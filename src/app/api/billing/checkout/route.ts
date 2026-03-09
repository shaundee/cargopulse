import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stripe } from '@/lib/billing/stripe';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

export const runtime = 'nodejs';

type CheckoutPlan = 'starter' | 'pro' | 'flex' | 'pause';

function resolveRequestedPlan(raw: unknown): CheckoutPlan {
  const plan = String(raw ?? 'pro').toLowerCase();
  if (plan === 'starter' || plan === 'flex' || plan === 'pause') return plan;
  return 'pro';
}

export async function POST(req: Request) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const reqBody = await req.json().catch(() => ({}));
  const plan = resolveRequestedPlan(reqBody?.plan);

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

if (customerId) {
  try {
    const existing = await stripe.customers.retrieve(customerId);
    if ('deleted' in existing && existing.deleted) {
      customerId = null;
    }
  } catch {
    customerId = null;
  }
}

if (!customerId) {
  const customer = await stripe.customers.create({
    metadata: { org_id: orgId, user_id: user.id },
  });
  customerId = customer.id;

  await supabase.from('organization_billing').upsert(
    {
      org_id: orgId,
      stripe_customer_id: customerId,
      stripe_subscription_id: null,
      stripe_price_id: null,
      status: 'inactive',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'org_id' }
  );
}

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
    if (!flatPrice || !meteredPrice) {
      return NextResponse.json({ error: 'Starter prices not configured (STRIPE_PRICE_ID_STARTER / STRIPE_METERED_PRICE_ID_STARTER)' }, { status: 500 });
    }
    lineItems = [
      { price: flatPrice, quantity: 1 },
      { price: meteredPrice },
    ];
  } else if (plan === 'pro') {
    const proPrice = process.env.STRIPE_PRICE_ID_PRO;
    if (!proPrice) {
      return NextResponse.json({ error: 'Missing STRIPE_PRICE_ID_PRO' }, { status: 500 });
    }

    const proMeteredPrice = process.env.STRIPE_METERED_PRICE_ID_PRO;
    lineItems = [{ price: proPrice, quantity: 1 }];
    if (proMeteredPrice) lineItems.push({ price: proMeteredPrice });
  } else if (plan === 'flex') {
    const flatPrice = process.env.STRIPE_PRICE_ID_FLEX;
    const meteredPrice = process.env.STRIPE_METERED_PRICE_ID_FLEX;
    if (!flatPrice || !meteredPrice) {
      return NextResponse.json({ error: 'Flex prices not configured (STRIPE_PRICE_ID_FLEX / STRIPE_METERED_PRICE_ID_FLEX)' }, { status: 500 });
    }
    lineItems = [
      { price: flatPrice, quantity: 1 },
      { price: meteredPrice },
    ];
  } else {
    const pausePrice = process.env.STRIPE_PRICE_ID_PAUSE;
    if (!pausePrice) {
      return NextResponse.json({ error: 'Pause price not configured (STRIPE_PRICE_ID_PAUSE)' }, { status: 500 });
    }
    lineItems = [{ price: pausePrice, quantity: 1 }];
  }

try {
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
} catch (err: any) {
  return NextResponse.json(
    { error: err?.message ?? 'Failed to create checkout session' },
    { status: 500 }
  );
}
}
