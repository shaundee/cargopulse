import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createSupabaseServerClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // You likely already have a helper for "current org".
  // Minimal approach: read org_id from org_members for this user.
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id, organizations:organizations(id, name, stripe_customer_id)')
    .eq('user_id', auth.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  if (memErr || !membership?.org_id) {
    return NextResponse.json({ error: 'No org/admin membership found' }, { status: 400 });
  }

  const org = (membership as any).organizations;
  const orgId = membership.org_id as string;

  let customerId = org?.stripe_customer_id as string | null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org?.name ?? 'Organization',
      metadata: { org_id: orgId },
    });
    customerId = customer.id;

    await supabase.from('organizations').update({ stripe_customer_id: customerId }).eq('id', orgId);
  }

  const priceId = process.env.STRIPE_PRICE_ID_PRO;
  if (!priceId) return NextResponse.json({ error: 'Missing STRIPE_PRICE_ID_PRO' }, { status: 500 });

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/billing/cancel`,
    client_reference_id: orgId,
    metadata: { org_id: orgId },
    allow_promotion_codes: false,
  });

  return NextResponse.json({ url: session.url });
}