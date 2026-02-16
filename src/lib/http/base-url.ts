export function getBaseUrlFromHeaders(headers: Headers): string {
  // Prefer explicit env in production if you have it
  const env =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  const clean = (s: string) => s.replace(/\/+$/, '');

  if (env) return clean(env);

  const proto = headers.get('x-forwarded-proto') ?? 'http';
  const host = headers.get('x-forwarded-host') ?? headers.get('host') ?? '';

  if (!host) return '';

  return clean(`${proto}://${host}`);
}
