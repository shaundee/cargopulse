import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/billing/stripe';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reqBody = await req.json().catch(() => ({}));
  const plan: 'starter' | 'pro' =
    String(reqBody?.plan ?? 'pro') === 'starter' ? 'starter' : 'pro';

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

  const orgId = membership.org_id as string;

  const { data: billing } = await supabase
    .from('organization_billing')
    .select('stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  let customerId = billing?.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { org_id: orgId, user_id: user.id },
    });
    customerId = customer.id;

    await supabase.from('organization_billing').upsert(
      { org_id: orgId, stripe_customer_id: customerId, status: 'inactive' },
      { onConflict: 'org_id' }
    );
  }

  const baseUrl =
    (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null) ??
    getBaseUrlFromHeaders(new Headers(req.headers));

  let lineItems: { price: string; quantity?: number }[];
  if (plan === 'starter') {
    const flatPrice = process.env.STRIPE_PRICE_ID_STARTER;
    const meteredPrice = process.env.STRIPE_METERED_PRICE_ID_STARTER;
    if (!flatPrice || !meteredPrice)
      return NextResponse.json({ error: 'Starter prices not configured (STRIPE_PRICE_ID_STARTER / STRIPE_METERED_PRICE_ID_STARTER)' }, { status: 500 });
    lineItems = [
      { price: flatPrice, quantity: 1 },
      { price: meteredPrice },  // metered — no quantity
    ];
  } else {
    const proPrice = process.env.STRIPE_PRICE_ID_CORE;
    if (!proPrice)
      return NextResponse.json({ error: 'Missing STRIPE_PRICE_ID_CORE' }, { status: 500 });
    lineItems = [{ price: proPrice, quantity: 1 }];
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    success_url: `${baseUrl}/billing/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/billing/return?status=cancel`,
    client_reference_id: orgId,
    metadata: { org_id: orgId, plan_tier: plan },
  });

  return NextResponse.json({ url: session.url });
}