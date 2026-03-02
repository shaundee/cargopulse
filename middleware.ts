import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

function isWebhookRoute(pathname: string) {
  return pathname.startsWith('/api/webhooks');
}

function isAuthPage(pathname: string) {
  return pathname === '/login' || pathname === '/signup' || pathname.startsWith('/auth');
}

function isAppRoute(pathname: string) {
  return (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/field') ||
    pathname.startsWith('/agent') ||
    pathname.startsWith('/shipments') ||
    pathname.startsWith('/customers') ||
    pathname.startsWith('/messages') ||
    pathname.startsWith('/pod') ||
    pathname.startsWith('/settings')
  );
}

function isProtectedApi(pathname: string) {
  return (
    pathname.startsWith('/api/agent') ||
    pathname.startsWith('/api/field') ||
    pathname.startsWith('/api/pod') ||
    pathname.startsWith('/api/shipments') ||
    pathname.startsWith('/api/messages') ||
    pathname.startsWith('/api/onboarding') ||
    pathname.startsWith('/api/agents') ||
    pathname.startsWith('/api/destinations')
  );
}

function agentAllowedApi(pathname: string) {
  return (
    pathname.startsWith('/api/agent') ||
    pathname.startsWith('/api/pod') ||
    pathname.startsWith('/api/webhooks')
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
NextResponse.next
  // Keep webhooks public
  if (isWebhookRoute(pathname)) return NextResponse.next();

  // Collect cookies that Supabase wants to set during this request
  const cookiesToSet: Array<{ name: string; value: string; options?: any }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          list.forEach((c) => cookiesToSet.push(c));
        },
      },
    }
  );

  const applyCookies = (res: NextResponse) => {
    for (const c of cookiesToSet) res.cookies.set(c.name, c.value, c.options);
    return res;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const needsAuth = isAppRoute(pathname) || isProtectedApi(pathname);

  // Auth gate
  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return applyCookies(NextResponse.redirect(url));
  }

  // Signed-in users shouldn't sit on login/signup
  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return applyCookies(NextResponse.redirect(url));
  }

  // Let auth pages + public content through
  if (!user || !needsAuth || isAuthPage(pathname)) {
    return applyCookies(NextResponse.next({ request }));
  }

  // ---------- CENTRAL API BLOCK: agent mode blocks everything except agent/pod/webhooks ----------
  const isAgentMode = request.cookies.get('cp_mode')?.value === 'agent';

  if (isAgentMode && pathname.startsWith('/api')) {
    if (!agentAllowedApi(pathname)) {
      return applyCookies(NextResponse.json({ error: 'forbidden' }, { status: 403 }));
    }
    return applyCookies(NextResponse.next({ request }));
  }

  // Otherwise, allow (pages are already blocked by your per-page layout guards in (app))
  return applyCookies(NextResponse.next({ request }));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};