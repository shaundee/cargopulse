import { NextResponse } from 'next/server';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const baseUrl =
    (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null) ??
    getBaseUrlFromHeaders(req.headers);

  const safeCode = String(code ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

  if (!safeCode) {
    return NextResponse.redirect(new URL('/signup', baseUrl));
  }

  const res = NextResponse.redirect(new URL(`/signup?ref=${safeCode}`, baseUrl));

  // Store in cookie so onboarding page can read it even after email confirmation
  res.cookies.set('cp_ref', safeCode, {
    path: '/',
    httpOnly: false, // readable by client-side JS
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return res;
}
