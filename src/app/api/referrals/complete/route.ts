import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/billing/stripe';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orgId = String(body?.orgId ?? '').trim();

  if (!orgId) return NextResponse.json({ error: 'orgId required' }, { status: 400 });

  // Find a pending referral for this org
  const { data: referral } = await supabase
    .from('referrals')
    .select('id, referrer_org_id')
    .eq('referred_org_id', orgId)
    .eq('status', 'pending')
    .maybeSingle();

  if (!referral) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no_pending_referral' });
  }

  // Mark as completed
  await supabase
    .from('referrals')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', referral.id);

  // Apply £10 credit to the referrer (best-effort, non-fatal)
  try {
    const { data: referrerBilling } = await supabase
      .from('organization_billing')
      .select('stripe_customer_id')
      .eq('org_id', referral.referrer_org_id)
      .maybeSingle();

    if (referrerBilling?.stripe_customer_id) {
      await stripe.customers.createBalanceTransaction(
        referrerBilling.stripe_customer_id,
        {
          amount: -1000, // negative = credit
          currency: 'gbp',
          description: 'Referral reward — new shipper joined Cargo44',
        }
      );
      await supabase
        .from('referrals')
        .update({ referrer_credit_applied: true })
        .eq('id', referral.id);
    }
  } catch (e: any) {
    console.warn('[referrals/complete] Stripe credit failed:', e?.message);
  }

  return NextResponse.json({ ok: true, referral_id: referral.id });
}
