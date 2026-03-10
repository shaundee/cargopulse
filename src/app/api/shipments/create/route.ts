import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeE164Phone } from '@/lib/whatsapp/twilio';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';
import { stripe } from '@/lib/billing/stripe';
import { canCreateShipment, getShipmentMeterEventName } from '@/lib/billing/plan';

function makeTrackingCode() {
  // e.g. SHP-6H2K9Q (fast + human-friendly)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `SHP-${s}`;
}

export async function POST(req: Request) {
  const blocked = await blockIfAgentMode();
if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);

  const customerName = String(body?.customerName ?? '').trim();
  const phone = String(body?.phone ?? '').trim();
  const phoneCountry = String(body?.phoneCountry ?? 'GB').toUpperCase() as any;
  const destination = String(body?.destination ?? '').trim();
  const serviceType = (String(body?.serviceType ?? 'depot') === 'door_to_door') ? 'door_to_door' : 'depot';
  const initialChargePence = Math.max(0, Math.trunc(Number(body?.initial_charge_pence ?? 0)));
const depositPaidPence = Math.max(0, Math.trunc(Number(body?.deposit_paid_pence ?? 0)));

  const CARGO_ALLOWED = new Set(['general', 'barrel', 'box', 'crate', 'pallet', 'vehicle', 'machinery', 'mixed', 'other']);
  const PACKING_CATS = new Set(['Clothing', 'Food & Groceries', 'Electronics', 'Household Goods', 'Personal Care', 'Documents', 'Other']);
  const cargoTypeRaw = String(body?.cargoType ?? 'general');
  const cargoType = CARGO_ALLOWED.has(cargoTypeRaw) ? cargoTypeRaw : 'general';

  const cargoMetaRaw = body?.cargoMeta && typeof body.cargoMeta === 'object' ? body.cargoMeta as Record<string, unknown> : {};
  const cargoMeta: Record<string, unknown> = {};

  if (cargoType === 'barrel' || cargoType === 'box') {
    const qty = cargoMetaRaw.quantity;
    if (qty !== null && qty !== undefined) {
      const n = Number(qty);
      if (Number.isFinite(n) && n >= 0) cargoMeta.quantity = Math.trunc(n);
    }
    const rawContents = cargoMetaRaw.contents;
    if (Array.isArray(rawContents) && rawContents.length > 0) {
      const sanitised = rawContents
        .filter((c: any) => c && PACKING_CATS.has(String(c.category ?? '')))
        .map((c: any) => ({
          category: String(c.category),
          description: String(c.description ?? '').trim() || null,
          qty: Math.max(1, Math.trunc(Number(c.qty) || 1)),
        }));
      if (sanitised.length > 0) cargoMeta.contents = sanitised;
    }
  }


  if (customerName.length < 2) return NextResponse.json({ error: 'Customer name too short' }, { status: 400 });


const phoneE164 = normalizeE164Phone(phone, { defaultCountry: phoneCountry });
if (!phoneE164) return NextResponse.json({ error: 'Phone must be valid (E.164). Use country picker.' }, { status: 400 });

  // Get org_id (membership gate)
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });

  const orgId = membership.org_id as string;

  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status, plan_tier, shipment_count, stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  const check = canCreateShipment(billing);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason }, { status: 402 });
  }

  // 1) Upsert customer by (org_id, phone)
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .upsert(
      { org_id: orgId, phone: phoneE164, phone_e164: phoneE164, country_code: phoneCountry, name: customerName },
      { onConflict: 'org_id,phone' }
    )
    .select('id')
    .single();

  if (custErr) return NextResponse.json({ error: custErr.message }, { status: 400 });

  // 2) Create shipment
  const trackingCode = makeTrackingCode();

  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .insert({
      org_id: orgId,
      customer_id: customer.id,
      tracking_code: trackingCode,
      destination,
      service_type: serviceType,
      current_status: 'received',
      last_event_at: new Date().toISOString(),
      cargo_type: cargoType,
      cargo_meta: cargoMeta,
    })
    .select('id, tracking_code')
    .single();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });

  // 3) Insert first timeline event
  const { error: evtErr } = await supabase
    .from('shipment_events')
    .insert({
      org_id: orgId,
      shipment_id: shipment.id,
      status: 'received',
      note: 'Created',
      occurred_at: new Date().toISOString(),
      created_by: user.id,
    });

  if (evtErr) return NextResponse.json({ error: evtErr.message }, { status: 400 });

  // Refresh shipments page cache (server-rendered wrapper)
  revalidatePath('/shipments');

  // Increment shipment_count atomically (best-effort, non-fatal)
  const isFirstShipment = (billing?.shipment_count ?? 0) === 0;
  await supabase.rpc('increment_shipment_count', { p_org_id: orgId });

  // On first shipment: complete any pending referral (best-effort)
  if (isFirstShipment) {
    try {
      const { data: referral } = await supabase
        .from('referrals')
        .select('id, referrer_org_id')
        .eq('referred_org_id', orgId)
        .eq('status', 'pending')
        .maybeSingle();

      if (referral) {
        await supabase
          .from('referrals')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', referral.id);

        // £10 Stripe credit for referrer
        const { data: referrerBilling } = await supabase
          .from('organization_billing')
          .select('stripe_customer_id')
          .eq('org_id', referral.referrer_org_id)
          .maybeSingle();

        if (referrerBilling?.stripe_customer_id) {
          try {
            await stripe.customers.createBalanceTransaction(
              referrerBilling.stripe_customer_id,
              { amount: -1000, currency: 'gbp', description: 'Referral reward — new shipper joined Cargo44' }
            );
            await supabase
              .from('referrals')
              .update({ referrer_credit_applied: true })
              .eq('id', referral.id);
          } catch (e: any) {
            console.warn('[referral] Stripe credit failed:', e?.message);
          }
        }
      }
    } catch (e: any) {
      console.warn('[referral] completion failed:', e?.message);
    }
  }

  // Shipment billing meters:
  // - Flex meters every shipment
  // - Starter meters shipments beyond 75/month
  // - Pro meters shipments beyond 250/month
  const meterEventName = getShipmentMeterEventName(billing, check.overage);
  if (meterEventName && billing?.stripe_customer_id) {
    try {
      await stripe.billing.meterEvents.create({
        event_name: meterEventName,
        payload: { value: '1', stripe_customer_id: billing.stripe_customer_id },
      });
    } catch (e: any) {
      console.warn('[shipments/create] Stripe meter event failed:', e?.message);
    }
  }

// 2b) Optional: create initial ledger rows (best-effort)
const ledgerRows: any[] = [];

if (Number.isFinite(initialChargePence) && initialChargePence > 0) {
  ledgerRows.push({
    org_id: orgId,
    shipment_id: shipment.id,
    entry_type: 'charge',
    amount_pence: initialChargePence, // +ve
    currency: 'GBP',
    method: 'cash',
    note: 'Initial charge',
    created_by: user.id,
  });
}

if (Number.isFinite(depositPaidPence) && depositPaidPence > 0) {
  ledgerRows.push({
    org_id: orgId,
    shipment_id: shipment.id,
    entry_type: 'payment',
    amount_pence: -depositPaidPence, // -ve
    currency: 'GBP',
    method: 'cash',
    note: 'Deposit paid',
    created_by: user.id,
  });
}

if (ledgerRows.length) {
  const { error: ledErr } = await supabase.from('shipment_ledger').insert(ledgerRows);
  if (ledErr) console.warn('[shipments/create] ledger insert failed', ledErr.message);
}


  return NextResponse.json({ ok: true, shipmentId: shipment.id, trackingCode: shipment.tracking_code });
  
}
export async function GET() {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;
  return new Response('ok', { status: 200 });
}