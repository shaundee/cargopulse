import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

  const orgId = membership.org_id as string;

  const [{ data: org }, { data: referrals }] = await Promise.all([
    supabase
      .from('organizations')
      .select('referral_code')
      .eq('id', orgId)
      .maybeSingle(),
    supabase
      .from('referrals')
      .select('id, status, created_at, completed_at, referrer_credit_applied')
      .eq('referrer_org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const referralCode = String(org?.referral_code ?? '');

  const baseUrl =
    (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null) ??
    getBaseUrlFromHeaders(req.headers);

  const referralLink = referralCode ? `${baseUrl}/r/${referralCode}` : '';

  const rows = referrals ?? [];
  const totalReferred = rows.length;
  const totalCompleted = rows.filter((r) => r.status === 'completed').length;

  return NextResponse.json({
    referral_code: referralCode,
    referral_link: referralLink,
    referrals: rows,
    stats: {
      total_referred: totalReferred,
      total_completed: totalCompleted,
    },
  });
}
