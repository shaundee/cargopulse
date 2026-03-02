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
  const priceId = process.env.STRIPE_PRICE_ID_CORE!;
  if (!priceId) return NextResponse.json({ error: 'Missing STRIPE_PRICE_ID_CORE' }, { status: 500 });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
 success_url: `${baseUrl}/billing/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
cancel_url: `${baseUrl}/billing/return?status=cancel`,
    client_reference_id: orgId,
    metadata: { org_id: orgId },
  });

  return NextResponse.json({ url: session.url });
}