import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { stripe } from '@/lib/billing/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

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

  // ── Helpers ──────────────────────────────────────────────────────────────────

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

  // ── Handler ──────────────────────────────────────────────────────────────────

  try {
    console.log(`[stripe-webhook] received: ${event.type}`);

    switch (event.type) {

      // ── New subscription created via Checkout ─────────────────────────────
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

        // Retrieve full subscription to get status + period
        let status = 'active';
        let periodEnd: string | null = null;
        let priceId: string | null = null;

        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          status = String(sub.status).toLowerCase();
          const cpe = (sub as any).current_period_end as number | null | undefined;
          periodEnd = cpe
            ? new Date(cpe! * 1000).toISOString()
            : null;
          priceId = (sub.items.data[0]?.price?.id as string) ?? null;
        }

        await upsertBilling(orgId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId ?? (process.env.STRIPE_PRICE_ID_CORE ?? null),
          status,                  // ← correct column name
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        });

        console.log(`[stripe-webhook] org ${orgId} activated — status: ${status}`);
        break; // ← was missing, causing fall-through
      }

      // ── Subscription updated (renewal, plan change, pause) ────────────────
      case 'customer.subscription.updated': {
        const sub = event.data.object as any;

        const orgId =
          (sub.metadata?.org_id as string | undefined) ??
          (sub.customer ? await orgIdByCustomer(String(sub.customer)) : null);

        if (!orgId) {
          console.warn('[stripe-webhook] customer.subscription.updated: could not resolve org_id');
          break;
        }

        await upsertBilling(orgId, {
          stripe_customer_id: sub.customer ?? null,
          stripe_subscription_id: sub.id ?? null,
          stripe_price_id: (sub.items?.data?.[0]?.price?.id as string) ?? null,
          status: String(sub.status ?? 'inactive').toLowerCase(),
          current_period_end: ((sub as any).current_period_end as number | null | undefined)
            ? new Date(((sub as any).current_period_end as number) * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        });

        console.log(`[stripe-webhook] org ${orgId} subscription updated — status: ${sub.status}`);
        break;
      }

      // ── Subscription cancelled / expired ──────────────────────────────────
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
          stripe_subscription_id: sub.id ?? null,
          status: 'canceled',
          current_period_end: ((sub as any).current_period_end as number | null | undefined)
            ? new Date(((sub as any).current_period_end as number) * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        });

        console.log(`[stripe-webhook] org ${orgId} subscription cancelled`);
        break;
      }

      // ── Payment failed (dunning) ──────────────────────────────────────────
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
        // Ignored event type — still return 200 so Stripe doesn't retry
        break;
    }
  } catch (e: any) {
    console.error('[stripe-webhook] handler error:', e?.message);
    return NextResponse.json({ error: e?.message ?? 'Webhook handler error' }, { status: 500 });
  }

  return new Response('ok', { status: 200 });
}