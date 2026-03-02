import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', '/agent');
    return NextResponse.redirect(url);
  }

  const resp = NextResponse.redirect(new URL('/agent', req.url));
  resp.cookies.set('cp_mode', 'agent', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 60,
  });
  return resp;
}