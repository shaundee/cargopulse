import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/billing/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

function planTierFromPriceIds(priceIds: string[]): string | undefined {
  const ids = priceIds.filter(Boolean);

  if (process.env.STRIPE_PRICE_ID_PAUSE && ids.includes(process.env.STRIPE_PRICE_ID_PAUSE)) {
    return 'pause';
  }
  if (
    (process.env.STRIPE_PRICE_ID_FLEX && ids.includes(process.env.STRIPE_PRICE_ID_FLEX)) ||
    (process.env.STRIPE_METERED_PRICE_ID_FLEX && ids.includes(process.env.STRIPE_METERED_PRICE_ID_FLEX))
  ) {
    return 'flex';
  }
  if (
    (process.env.STRIPE_PRICE_ID_PRO && ids.includes(process.env.STRIPE_PRICE_ID_PRO)) ||
    (process.env.STRIPE_METERED_PRICE_ID_PRO && ids.includes(process.env.STRIPE_METERED_PRICE_ID_PRO))
  ) {
    return 'pro';
  }
  if (
    (process.env.STRIPE_PRICE_ID_STARTER && ids.includes(process.env.STRIPE_PRICE_ID_STARTER)) ||
    (process.env.STRIPE_METERED_PRICE_ID_STARTER && ids.includes(process.env.STRIPE_METERED_PRICE_ID_STARTER))
  ) {
    return 'starter';
  }

  return undefined;
}

function primaryPriceId(priceIds: string[]): string | null {
  const preferred = [
    process.env.STRIPE_PRICE_ID_PAUSE,
    process.env.STRIPE_PRICE_ID_FLEX,
    process.env.STRIPE_PRICE_ID_PRO,
    process.env.STRIPE_PRICE_ID_STARTER,
    process.env.STRIPE_METERED_PRICE_ID_FLEX,
    process.env.STRIPE_METERED_PRICE_ID_PRO,
    process.env.STRIPE_METERED_PRICE_ID_STARTER,
  ].filter(Boolean) as string[];

  for (const id of preferred) {
    if (priceIds.includes(id)) return id;
  }

  return priceIds[0] ?? null;
}

// Webhook must consume the raw body — no JSON parsing before constructEvent
export async function POST(req: Request) {
  const sig = (await headers()).get('stripe-signature');
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !whsec) {
    return NextResponse.json({ error: 'Missing stripe-signature or STRIPE_WEBHOOK_SECRET' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whsec);
  } catch (err: any) {
    console.error('[stripe-webhook] signature verification failed:', err?.message);
    return NextResponse.json({ error: `Webhook signature failed: ${err?.message}` }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  async function upsertBilling(orgId: string, patch: Record<string, unknown>) {
    const { error } = await supabase
      .from('organization_billing')
      .upsert({ org_id: orgId, ...patch }, { onConflict: 'org_id' });
    if (error) throw new Error(`upsertBilling failed: ${error.message}`);
  }

  async function orgIdByCustomer(customerId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('organization_billing')
      .select('org_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (error) throw new Error(`orgIdByCustomer failed: ${error.message}`);
    return data?.org_id ?? null;
  }

  try {
    console.log(`[stripe-webhook] received: ${event.type}`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;

        const orgId: string | null =
          session?.metadata?.org_id ?? session?.client_reference_id ?? null;
        const customerId = session?.customer as string | null;
        const subscriptionId = session?.subscription as string | null;

        if (!orgId || !customerId) {
          console.warn('[stripe-webhook] checkout.session.completed: missing org_id or customer');
          break;
        }

        let status = 'active';
        let periodEnd: string | null = null;
        let priceId: string | null = null;
        let planTier: string = session?.metadata?.plan_tier ?? 'pro';

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          status = String(sub.status).toLowerCase();
          const cpe = (sub as any).current_period_end as number | null | undefined;
          periodEnd = cpe ? new Date(cpe * 1000).toISOString() : null;
          const priceIds = (sub.items.data ?? [])
            .map((item: any) => item?.price?.id)
            .filter(Boolean) as string[];
          priceId = primaryPriceId(priceIds);
          planTier = planTierFromPriceIds(priceIds) ?? planTier;
        }

        await upsertBilling(orgId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId ?? null,
          status,
          current_period_end: periodEnd,
          plan_tier: planTier,
          shipment_count: 0,
          billing_period_start: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        console.log(`[stripe-webhook] org ${orgId} activated — plan: ${planTier}, status: ${status}`);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as any;

        const orgId =
          (sub.metadata?.org_id as string | undefined) ??
          (sub.customer ? await orgIdByCustomer(String(sub.customer)) : null);

        if (!orgId) {
          console.warn('[stripe-webhook] customer.subscription.updated: could not resolve org_id');
          break;
        }

        const priceIds = (sub.items?.data ?? [])
          .map((item: any) => item?.price?.id)
          .filter(Boolean) as string[];
        const updatedPlanTier = planTierFromPriceIds(priceIds);

        const patch: Record<string, unknown> = {
          stripe_customer_id: sub.customer ?? null,
          stripe_subscription_id: sub.id ?? null,
          stripe_price_id: primaryPriceId(priceIds),
          status: String(sub.status ?? 'inactive').toLowerCase(),
          current_period_end: ((sub as any).current_period_end as number | null | undefined)
            ? new Date(((sub as any).current_period_end as number) * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        };
        if (updatedPlanTier) patch.plan_tier = updatedPlanTier;

        await upsertBilling(orgId, patch);

        console.log(`[stripe-webhook] org ${orgId} subscription updated — status: ${sub.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as any;

        const orgId =
          (sub.metadata?.org_id as string | undefined) ??
          (sub.customer ? await orgIdByCustomer(String(sub.customer)) : null);

        if (!orgId) {
          console.warn('[stripe-webhook] customer.subscription.deleted: could not resolve org_id');
          break;
        }

  await upsertBilling(orgId, {
  stripe_subscription_id: null,
  stripe_price_id: null,
  status: 'inactive',
  plan_tier: 'free',
  current_period_end: null,
  updated_at: new Date().toISOString(),
});
        console.log(`[stripe-webhook] org ${orgId} subscription cancelled`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as any;
        const customerId = invoice?.customer as string | null;
        if (!customerId) break;

        const orgId = await orgIdByCustomer(customerId);
        if (!orgId) break;

        await upsertBilling(orgId, {
          shipment_count: 0,
          billing_period_start: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        console.log(`[stripe-webhook] org ${orgId} invoice paid — shipment_count reset`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        const customerId = invoice?.customer as string | null;
        if (!customerId) break;

        const orgId = await orgIdByCustomer(customerId);
        if (!orgId) break;

        await upsertBilling(orgId, {
          status: 'past_due',
          updated_at: new Date().toISOString(),
        });

        console.log(`[stripe-webhook] org ${orgId} payment failed — marked past_due`);
        break;
      }

      default:
        break;
    }
  } catch (e: any) {
    console.error('[stripe-webhook] handler error:', e?.message);
    return NextResponse.json({ error: e?.message ?? 'Webhook handler error' }, { status: 500 });
  }

  return new Response('ok', { status: 200 });
}
