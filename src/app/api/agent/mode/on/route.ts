import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { canUseAgentPortal } from '@/lib/billing/plan';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const url = new URL('/login', req.url);
    url.searchParams.set('next', '/agent');
    return NextResponse.redirect(url);
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status, plan_tier')
    .eq('org_id', membership?.org_id ?? '')
    .maybeSingle();

  if (!canUseAgentPortal(billing)) {
    return NextResponse.redirect(new URL('/settings?upgrade=agent_portal', req.url));
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