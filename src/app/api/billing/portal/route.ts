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

  const { data: billing } = await supabase
    .from('organization_billing')
    .select('stripe_customer_id')
    .eq('org_id', membership.org_id)
    .maybeSingle();

  if (!billing?.stripe_customer_id) return NextResponse.json({ error: 'No Stripe customer' }, { status: 400 });

 const baseUrl =
  (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null) ??
  getBaseUrlFromHeaders(new Headers(req.headers));
  const session = await stripe.billingPortal.sessions.create({
    customer: billing.stripe_customer_id,
   return_url: `${baseUrl}/billing/return?status=portal`,
  });

  return NextResponse.json({ url: session.url });
}