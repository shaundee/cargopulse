export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';
import { normalizeE164Phone } from '@/lib/whatsapp/twilio';
import { getPlanTier, isBillingActive, PLAN_LIMITS } from '@/lib/billing/plan';

type Mapping = Record<string, string | null>;

function pick(raw: any, header: string | null | undefined): string {
  if (!raw || !header) return '';
  return String(raw[header] ?? '').trim();
}

function makeTrackingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `SHP-${s}`;
}

const ALLOWED_STATUSES = new Set([
  'received', 'collected', 'loaded', 'departed_uk',
  'arrived_destination', 'collected_by_customer', 'out_for_delivery',
  // 'delivered' intentionally excluded — must go through POD flow
]);

const ALLOWED_CARGO = new Set(['general', 'barrel', 'box', 'vehicle', 'machinery', 'mixed', 'other']);

function normStatus(v: string): string {
  const s = v.trim().toLowerCase().replace(/\s+/g, '_');
  if (ALLOWED_STATUSES.has(s)) return s;
  return 'received';
}

function normServiceType(v: string): 'depot' | 'door_to_door' {
  const s = v.trim().toLowerCase();
  if (s.includes('door')) return 'door_to_door';
  return 'depot';
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export const ERROR_LABELS: Record<string, string> = {
  customer_name_required:       'Customer name is missing or too short',
  invalid_phone:                'Phone number is invalid or unrecognised',
  destination_required:         'Destination is missing — add a destination column or set a default',
  duplicate_tracking_code:      'Tracking code already exists in your account',
  duplicate_tracking_code_in_file: 'Duplicate tracking code within this file',
  delivered_locked:             'Cannot import status "delivered" — use Proof of Delivery instead',
  subscription_required:        'Active subscription required',
  free_limit_reached:           'Free plan limit (10 shipments/month) reached',
  paused_plan:                 'Your account is paused — switch back to an active plan to create shipments',
  multi_destination_not_allowed:'Your plan only supports one destination — upgrade to Pro',
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

  // Load job + verify ownership
  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, org_id, mapping, defaults')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 400 });
  if (!job || job.org_id !== orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Accept mapping + defaults from body (or fall back to stored on job)
  const body = await req.json().catch(() => null);
  const mapping: Mapping = (body?.mapping ?? job.mapping ?? {}) as Mapping;
  const defaults: any   = (body?.defaults ?? job.defaults ?? {});

  // Persist mapping + defaults if provided
  if (body?.mapping !== undefined || body?.defaults !== undefined) {
    await supabase
      .from('import_jobs')
      .update({ mapping, defaults, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }

  // Mark job as validating
  await supabase
    .from('import_jobs')
    .update({ status: 'validating', updated_at: new Date().toISOString() })
    .eq('id', jobId);

  // ── Load billing ──────────────────────────────────────────────────────────
  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status, plan_tier, shipment_count')
    .eq('org_id', orgId)
    .maybeSingle();

  const tier          = getPlanTier(billing ?? null);
  const billingActive = isBillingActive(billing ?? null);
  const freeLimit     = PLAN_LIMITS.free.shipments;
  let   runningCount  = billing?.shipment_count ?? 0;
  const multiDestAllowed = PLAN_LIMITS[tier].multiDest;

  // ── Load org destinations ─────────────────────────────────────────────────
  const { data: destRows } = await supabase
    .from('org_destinations')
    .select('name')
    .eq('org_id', orgId)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  const destNames   = (destRows ?? []).map((d: any) => String(d.name).trim());
  const destNormMap = new Map(destNames.map((n) => [n.toLowerCase(), n]));
  const primaryDest = destNames[0] ?? '';

  // ── Fetch all rows ────────────────────────────────────────────────────────
  const { data: rows, error: rowsErr } = await supabase
    .from('import_rows')
    .select('job_id, row_no, raw')
    .eq('job_id', jobId)
    .order('row_no', { ascending: true })
    .limit(5000);

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 400 });
  if (!rows?.length) return NextResponse.json({ error: 'No rows to validate' }, { status: 400 });

  // ── Bulk-check existing tracking codes in DB ──────────────────────────────
  const incomingCodes = rows
    .map((r) => pick(r.raw, mapping.tracking_code).replace(/\s+/g, '-').toUpperCase())
    .filter(Boolean);

  const existingCodesInDb = new Set<string>();
  if (incomingCodes.length) {
    const { data: existing } = await supabase
      .from('shipments')
      .select('tracking_code')
      .eq('org_id', orgId)
      .in('tracking_code', incomingCodes);
    (existing ?? []).forEach((s: any) => existingCodesInDb.add(s.tracking_code));
  }

  // ── Validate each row ─────────────────────────────────────────────────────
  const seenTrackingCodes = new Set<string>();
  let validCount = 0;
  let errorCount = 0;

  type RowUpdate = {
    job_id: string;
    row_no: number;
    status: 'valid' | 'error';
    normalized: Record<string, any>;
    errors: string[];
    updated_at: string;
  };

  const updates: RowUpdate[] = [];

  for (const r of rows) {
    const raw = r.raw as any;

    const customerName  = pick(raw, mapping.customer_name);
    const phoneRaw      = pick(raw, mapping.customer_phone);
    const phoneCountry  = (pick(raw, mapping.phone_country) || defaults.phoneCountry || 'GB').toUpperCase();
    const destRaw       = pick(raw, mapping.destination) || String(defaults.destination || '').trim();
    const serviceType   = normServiceType(pick(raw, mapping.service_type) || defaults.serviceType || 'depot');
    const statusRaw     = pick(raw, mapping.status) || defaults.status || 'received';
    const occurredAt    = parseDate(pick(raw, mapping.occurred_at)) ?? new Date().toISOString();
    const referenceNo   = pick(raw, mapping.reference_no) || null;
    const internalNotes = pick(raw, mapping.internal_notes) || null;
    const cargoTypeIn   = pick(raw, mapping.cargo_type).toLowerCase();
    const cargoType     = ALLOWED_CARGO.has(cargoTypeIn) ? cargoTypeIn : 'general';
    const cargoDesc     = pick(raw, mapping.cargo_desc) || null;

    // Normalize phone → E.164
    const phoneE164 = normalizeE164Phone(phoneRaw, { defaultCountry: phoneCountry as any }) ?? null;

    // Normalize destination (case-insensitive match against known destinations)
    const destination = destNormMap.get(destRaw.toLowerCase()) ?? destRaw;

    // Generate tracking code if empty
    let trackingCode = pick(raw, mapping.tracking_code).replace(/\s+/g, '-').toUpperCase();
    const hasExplicitCode = Boolean(trackingCode);
    if (!trackingCode) trackingCode = makeTrackingCode();

    // Normalize status (blocks 'delivered')
    const statusNorm = normStatus(statusRaw);

    const errors: string[] = [];

    if (customerName.length < 2)          errors.push('customer_name_required');
    if (!phoneE164)                         errors.push('invalid_phone');
    if (!destination)                       errors.push('destination_required');

    // Delivered is locked
    if (statusRaw.trim().toLowerCase() === 'delivered') {
      errors.push('delivered_locked');
    }

    // Duplicate tracking code in DB (only check explicit codes, not generated ones)
    if (hasExplicitCode && existingCodesInDb.has(trackingCode)) {
      errors.push('duplicate_tracking_code');
    }

    // Duplicate tracking code within this file (only explicit codes)
    if (hasExplicitCode) {
      if (seenTrackingCodes.has(trackingCode)) {
        errors.push('duplicate_tracking_code_in_file');
      } else {
        seenTrackingCodes.add(trackingCode);
      }
    }

    // Billing
    if (!billingActive) {
      errors.push('subscription_required');
    } else if (tier === 'pause') {
      errors.push('paused_plan');
    } else if (tier === 'free' && runningCount >= freeLimit) {
      errors.push('free_limit_reached');
    }

    // Plan: single-destination restriction
    if (
      !multiDestAllowed &&
      primaryDest &&
      destination &&
      destination.toLowerCase() !== primaryDest.toLowerCase()
    ) {
      errors.push('multi_destination_not_allowed');
    }

    const rowStatus: 'valid' | 'error' = errors.length ? 'error' : 'valid';
    if (rowStatus === 'valid') { validCount++; runningCount++; }
    else errorCount++;

    updates.push({
      job_id:  jobId,
      row_no:  r.row_no,
      status:  rowStatus,
      normalized: {
        customerName,
        phoneE164,
        phoneCountry,
        destination,
        serviceType,
        trackingCode,
        status: statusNorm,
        occurredAt,
        referenceNo,
        internalNotes,
        cargoType,
        cargoDesc,
      },
      errors,
      updated_at: new Date().toISOString(),
    });
  }

  // ── Batch upsert updates (PK = job_id, row_no) ────────────────────────────
  const CHUNK = 500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await supabase
      .from('import_rows')
      .upsert(updates.slice(i, i + CHUNK), { onConflict: 'job_id,row_no' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // ── Mark job validated ────────────────────────────────────────────────────
  await supabase
    .from('import_jobs')
    .update({
      status:     'validated',
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  return NextResponse.json({
    ok:        true,
    totalRows: rows.length,
    valid:     validCount,
    errors:    errorCount,
  });
}
