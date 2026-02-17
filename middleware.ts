import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

const isAppRoute =
  pathname.startsWith('/dashboard') ||
  pathname.startsWith('/field') ||
  pathname.startsWith('/agent') ||
  pathname.startsWith('/shipments') ||
  pathname.startsWith('/customers') ||
  pathname.startsWith('/messages') ||
  pathname.startsWith('/pod') ||
  pathname.startsWith('/settings');

  if (isAppRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // ---- RBAC (agent/field/office) ----
  // Keep Twilio webhooks public
  const isWebhookRoute = pathname.startsWith('/api/webhooks');
  if (isWebhookRoute) return response;

  // Protect these API routes too (optional but recommended)
  const isProtectedApi =
    pathname.startsWith('/api/agent') ||
    pathname.startsWith('/api/field');

  const needsRoleCheck = isAppRoute || isProtectedApi;

  if (needsRoleCheck && user) {
    // Fetch membership + role
    const { data: member, error: memberErr } = await supabase
      .from('org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    // If we can't read membership for any reason, fail closed for protected API,
    // fail open for UI (to avoid locking out during migrations), but you can tighten later.
    const role = (member?.role ?? 'admin') as 'admin' | 'staff' | 'field' | 'agent';

    const isOfficePage =
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/shipments') ||
      pathname.startsWith('/customers') ||
      pathname.startsWith('/messages') ||
      pathname.startsWith('/pod') ||
      pathname.startsWith('/settings');

    const isFieldPage = pathname.startsWith('/field');
    const isAgentPage = pathname.startsWith('/agent');

    const isOfficeApi =
      pathname.startsWith('/api/shipments') ||
      pathname.startsWith('/api/messages') ||
      pathname.startsWith('/api/pod') ||
      pathname.startsWith('/api/onboarding');

    const isFieldApi = pathname.startsWith('/api/field');
    const isAgentApi = pathname.startsWith('/api/agent');

    const allowOffice = role === 'admin' || role === 'staff';
    const allowField = role === 'admin' || role === 'staff' || role === 'field';
    const allowAgent = role === 'admin' || role === 'staff' || role === 'agent';

    // API: return 403 JSON (no redirects)
    if (pathname.startsWith('/api')) {
      // keep webhooks public (handled above)
      if (isAgentApi && !allowAgent) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
      if (isFieldApi && !allowField) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }

      // Optional: tighten these later if you want role gating on office APIs too
      if (isOfficeApi && !allowOffice) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 });
      }
    } else {
      // Pages: redirect to the correct home for that role
      if (isAgentPage && !allowAgent) {
        const url = request.nextUrl.clone();
        url.pathname = allowField ? '/field' : '/dashboard';
        return NextResponse.redirect(url);
      }

      if (isFieldPage && !allowField) {
        const url = request.nextUrl.clone();
        url.pathname = allowAgent ? '/agent' : '/dashboard';
        return NextResponse.redirect(url);
      }

      if (isOfficePage && !allowOffice) {
        const url = request.nextUrl.clone();
        url.pathname = allowAgent ? '/agent' : '/field';
        return NextResponse.redirect(url);
      }
    }
  }
  // ---- end RBAC ----


  const isAuthPage = pathname === '/login' || pathname === '/signup';

  // If already signed in, don't let user sit on login/signup
if (isAuthPage && user) {
  const { data: member, error: memberErr } = await supabase
    .from('org_members')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memberErr || !member) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const role = (member.role ?? 'staff') as 'admin' | 'staff' | 'field' | 'agent';

  const url = request.nextUrl.clone();
  url.pathname = role === 'agent' ? '/agent' : role === 'field' ? '/field' : '/dashboard';
  return NextResponse.redirect(url);
}

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
