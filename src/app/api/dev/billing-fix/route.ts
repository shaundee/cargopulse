import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

// DEV-ONLY: force-upgrades the current user's org to a given plan tier.
// Hit GET /api/dev/billing-fix?plan=pro  (or starter / flex / pause / free)
// This route is disabled in production.

export async function GET(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  const plan = new URL(req.url).searchParams.get('plan') ?? 'pro';
  if (!['free', 'flex', 'starter', 'pro', 'pause'].includes(plan)) {
    return NextResponse.json({ error: 'plan must be free | flex | starter | pro | pause' }, { status: 400 });
  }

  // Identify the current user
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not logged in' }, { status: 401 });

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!member?.org_id) return NextResponse.json({ error: 'No org membership found' }, { status: 400 });

  // Use admin client to bypass RLS
  const admin = createSupabaseAdminClient();

  // Read current billing row first
  const { data: existing } = await admin
    .from('organization_billing')
    .select('*')
    .eq('org_id', member.org_id)
    .maybeSingle();

  const { error } = await admin
    .from('organization_billing')
    .upsert({
      org_id: member.org_id,
      status: plan === 'free' ? 'inactive' : 'active',
      plan_tier: plan,
      shipment_count: existing?.shipment_count ?? 0,
      billing_period_start: existing?.billing_period_start ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'org_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    message: `Org ${member.org_id} set to ${plan}`,
    was: { status: existing?.status, plan_tier: existing?.plan_tier },
    now: { status: plan === 'free' ? 'inactive' : 'active', plan_tier: plan },
  });
}
