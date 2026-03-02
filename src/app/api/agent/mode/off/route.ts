import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL('/login', req.url));

  const resp = NextResponse.redirect(new URL('/dashboard', req.url));
  resp.cookies.set('cp_mode', '', { path: '/', maxAge: 0 });
  return resp;
}