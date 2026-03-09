export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';
import { stripe } from '@/lib/billing/stripe';
import { getPlanTier, PLAN_LIMITS, getShipmentMeterEventName } from '@/lib/billing/plan';

type NormalizedRow = {
  customerName:  string;
  phoneE164:     string;
  phoneCountry:  string;
  destination:   string;
  serviceType:   'depot' | 'door_to_door';
  trackingCode:  string;
  status:        string;
  occurredAt:    string;
  referenceNo:   string | null;
  internalNotes: string | null;
  cargoType:     string;
  cargoDesc:     string | null;
};

export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const { jobId } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });
  const orgId = membership.org_id as string;

  const body      = await req.json().catch(() => null);
  const chunkSize = Math.min(250, Math.max(25, Math.trunc(Number(body?.chunkSize ?? 150))));

  // ── Load + verify job ─────────────────────────────────────────────────────
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, org_id, status, imported_rows, error_rows')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 400 });
  if (!job || job.org_id !== orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // ── Billing ───────────────────────────────────────────────────────────────
  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status, plan_tier, shipment_count, stripe_customer_id')
    .eq('org_id', orgId)
    .maybeSingle();

  const tier = getPlanTier(billing ?? null);

  // ── Fetch next chunk of validated rows ────────────────────────────────────
  const { data: rows, error: rowsErr } = await supabase
    .from('import_rows')
    .select('job_id, row_no, normalized')
    .eq('job_id', jobId)
    .eq('status', 'valid')
    .order('row_no', { ascending: true })
    .limit(chunkSize);

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 400 });

  if (!rows?.length) {
    await supabase
      .from('import_jobs')
      .update({ status: 'complete', updated_at: new Date().toISOString() })
      .eq('id', jobId);
    revalidatePath('/shipments');
    return NextResponse.json({ ok: true, done: true, processed: 0 });
  }

  await supabase
    .from('import_jobs')
    .update({ status: 'importing', updated_at: new Date().toISOString() })
    .eq('id', jobId);

  let ok = 0;
  let err = 0;
  let shipmentEventsToMeter = 0;

  for (const r of rows) {
    const n = r.normalized as NormalizedRow;

    try {
      // Upsert customer by (org_id, phone_e164)
      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .upsert(
          {
            org_id:       orgId,
            phone:        n.phoneE164,
            phone_e164:   n.phoneE164,
            country_code: n.phoneCountry,
            name:         n.customerName,
          },
          { onConflict: 'org_id,phone' }
        )
        .select('id')
        .single();

      if (custErr) throw new Error(custErr.message);

      const { data: shipment, error: shipErr } = await supabase
        .from('shipments')
        .insert({
          org_id:         orgId,
          customer_id:    customer.id,
          tracking_code:  n.trackingCode,
          destination:    n.destination,
          service_type:   n.serviceType,
          cargo_type:     n.cargoType,
          cargo_meta:     n.cargoDesc ? { desc: n.cargoDesc } : {},
          reference_no:   n.referenceNo,
          internal_notes: n.internalNotes,
          current_status: 'received',
          last_event_at:  n.occurredAt,
        })
        .select('id')
        .single();

      if (shipErr) throw new Error(shipErr.message);

      const { error: rpcErr } = await supabase.rpc('add_shipment_event', {
        p_shipment_id: shipment.id,
        p_status:      n.status,
        p_note:        'Imported',
        p_occurred_at: n.occurredAt,
      });

      if (rpcErr) throw new Error(rpcErr.message);

      ok++;

      const currentCount = (billing?.shipment_count ?? 0) + ok;
      const shouldMeter =
        tier === 'flex'
          ? true
          : tier === 'starter'
            ? currentCount > PLAN_LIMITS.starter.shipments
            : tier === 'pro'
              ? currentCount > PLAN_LIMITS.pro.shipments
              : false;

      if (shouldMeter) shipmentEventsToMeter++;

      await supabase
        .from('import_rows')
        .update({ status: 'imported', shipment_id: shipment.id, updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('row_no', r.row_no);

    } catch (e: any) {
      const msg = String(e?.message ?? 'failed');
      const friendly =
        msg.toLowerCase().includes('shipments_org_tracking_unique') || msg.toLowerCase().includes('duplicate key')
          ? 'duplicate_tracking_code'
          : msg;

      err++;
      await supabase
        .from('import_rows')
        .update({ status: 'error', errors: [friendly], updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('row_no', r.row_no);
    }
  }

  if (ok > 0) {
    await supabase.rpc('increment_shipment_count_by', { p_org_id: orgId, p_delta: ok });
    revalidatePath('/shipments');
  }

  const meterEventName = getShipmentMeterEventName(billing, true);
  if (shipmentEventsToMeter > 0 && meterEventName && billing?.stripe_customer_id) {
    for (let i = 0; i < shipmentEventsToMeter; i++) {
      try {
        await stripe.billing.meterEvents.create({
          event_name: meterEventName,
          payload: { value: '1', stripe_customer_id: billing.stripe_customer_id },
        });
      } catch (e: any) {
        console.warn('[imports] Stripe meter event failed:', e?.message);
        break;
      }
    }
  }

  await supabase
    .from('import_jobs')
    .update({
      imported_rows: (job.imported_rows ?? 0) + ok,
      error_rows:    (job.error_rows ?? 0)    + err,
      updated_at:    new Date().toISOString(),
    })
    .eq('id', jobId);

  // Check if any valid rows remain
  const { count } = await supabase
    .from('import_rows')
    .select('row_no', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('status', 'valid');

  const hasMore = (count ?? 0) > 0;

  return NextResponse.json({
    ok:        true,
    done:      false,
    processed: rows.length,
    imported:  ok,
    errors:    err,
    next:      hasMore,
  });
}
