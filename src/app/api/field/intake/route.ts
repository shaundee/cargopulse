import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

function extFor(contentType: string) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  return 'jpg';
}

function makeTrackingCode(prefix = 'SHP') {
  const s = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${s}`;
}

function parsePayload(payloadRaw: unknown) {
  const payloadStr = String(payloadRaw ?? '');
  try {
    return JSON.parse(payloadStr || '{}');
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const clientEventId = String(form.get('clientEventId') ?? '').trim();
  const payload = parsePayload(form.get('payload'));

  if (!clientEventId) return NextResponse.json({ error: 'clientEventId is required' }, { status: 400 });
  if (!payload) return NextResponse.json({ error: 'payload must be valid JSON' }, { status: 400 });

  const customerName = String(payload?.customerName ?? '').trim();
  const phone = String(payload?.phone ?? '').trim();
  const destination = String(payload?.destination ?? '').trim();
  const serviceType = String(payload?.serviceType ?? 'depot').trim();
  const cargoType = String(payload?.cargoType ?? 'general').trim();

  const pickupAddress = payload?.pickupAddress == null ? null : String(payload.pickupAddress).trim() || null;
  const pickupContactPhone = payload?.pickupContactPhone == null ? null : String(payload.pickupContactPhone).trim() || null;
  const notes = payload?.notes == null ? null : String(payload.notes).trim() || null;
  const occurredAtISO = payload?.occurredAtISO ? String(payload.occurredAtISO) : new Date().toISOString();

  if (customerName.length < 2) return NextResponse.json({ error: 'customerName is required' }, { status: 400 });
  if (phone.length < 6) return NextResponse.json({ error: 'phone is required' }, { status: 400 });
  if (destination.length < 2) return NextResponse.json({ error: 'destination is required' }, { status: 400 });

  // org_id from membership
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });
  const orgId = membership.org_id as string;

  // Idempotency: if we already processed this clientEventId, return the existing result.
  // Table: public.client_sync_events (org_id, client_event_id) PK
  const { error: evInsErr } = await supabase
    .from('client_sync_events')
    .insert({
      org_id: orgId,
      client_event_id: clientEventId,
      kind: 'intake_create',
      payload,
    });

  if (evInsErr) {
    // 23505 = duplicate
    if ((evInsErr as any).code === '23505') {
      const { data: existing, error: exErr } = await supabase
        .from('client_sync_events')
        .select('shipment_id, tracking_code')
        .eq('org_id', orgId)
        .eq('client_event_id', clientEventId)
        .maybeSingle();

      if (exErr) return NextResponse.json({ error: exErr.message }, { status: 400 });

      return NextResponse.json({
        ok: true,
        duplicate: true,
        shipmentId: existing?.shipment_id,
        trackingCode: existing?.tracking_code,
      });
    }

    return NextResponse.json({ error: evInsErr.message }, { status: 400 });
  }

  // 1) Customer upsert by (org_id, phone)
  const { data: existingCustomer, error: custSelErr } = await supabase
    .from('customers')
    .select('id')
    .eq('org_id', orgId)
    .eq('phone', phone)
    .maybeSingle();

  if (custSelErr) return NextResponse.json({ error: custSelErr.message }, { status: 400 });

  let customerId = existingCustomer?.id as string | undefined;

  if (customerId) {
    const { error: updErr } = await supabase
      .from('customers')
      .update({ name: customerName })
      .eq('id', customerId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
  } else {
    const { data: newCust, error: insErr } = await supabase
      .from('customers')
      .insert({ org_id: orgId, name: customerName, phone })
      .select('id')
      .single();

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 });
    customerId = newCust.id;
  }

  // 2) Create shipment
  const trackingCode = makeTrackingCode('SHP');

  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .insert({
      org_id: orgId,
      customer_id: customerId,
      tracking_code: trackingCode,
      destination,
      service_type: serviceType,
      current_status: 'collected',
      last_event_at: occurredAtISO,
      cargo_type: cargoType,
      cargo_meta: {
        pickup_address: pickupAddress,
        pickup_contact_phone: pickupContactPhone,
        notes,
      },
    })
    .select('id, tracking_code')
    .single();

  if (shipErr) {
    await supabase
      .from('client_sync_events')
      .update({ processed_at: new Date().toISOString(), error: shipErr.message })
      .eq('org_id', orgId)
      .eq('client_event_id', clientEventId);

    return NextResponse.json({ error: shipErr.message }, { status: 400 });
  }

const shipmentId = shipment.id;
const createdBy = user.id;

  // 3) Insert initial event
  const { error: evErr } = await supabase
    .from('shipment_events')
    .insert({
      org_id: orgId,
      shipment_id: shipment.id,
      status: 'collected',
      note: notes ?? 'Collected (field intake)',
      occurred_at: occurredAtISO,
    });

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 400 });

  // 4) Upload assets (pickup photos, optional signature)
  const photos = form.getAll('photos');
  const signature = form.get('signature');

  async function uploadOne(file: unknown, kind: 'pickup_photo' | 'pickup_signature', idx: number) {
    if (!file || !(file instanceof Blob)) return null;

    const contentType = (file as any).type || 'image/jpeg';
    const ext = extFor(contentType);

    const path = `org/${orgId}/shipments/${shipmentId}/intake/${Date.now()}-${idx}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from('assets')
      .upload(path, bytes, { contentType, upsert: true });

    if (upErr) throw new Error(upErr.message);

    const { error: assetErr } = await supabase
      .from('shipment_assets')
      .insert({
        org_id: orgId,
      shipment_id: shipmentId,
        kind,
        path,
        created_by: createdBy,
      });

    if (assetErr) throw new Error(assetErr.message);

    return path;
  }

  try {
    let idx = 0;
    for (const f of photos) {
      // eslint-disable-next-line no-await-in-loop
      await uploadOne(f, 'pickup_photo', idx++);
    }

    if (signature && signature instanceof Blob) {
      await uploadOne(signature, 'pickup_signature', idx++);
    }
  } catch (e: any) {
    await supabase
      .from('client_sync_events')
      .update({ processed_at: new Date().toISOString(), shipment_id: shipment.id, tracking_code: shipment.tracking_code, error: e?.message ?? 'asset_upload_failed' })
      .eq('org_id', orgId)
      .eq('client_event_id', clientEventId);

    return NextResponse.json({ error: e?.message ?? 'Asset upload failed', shipmentId: shipment.id }, { status: 400 });
  }

  // 5) Best-effort auto-log/send "collected" message (optional, but helps the demo)
  try {
    const { data: tpl } = await supabase
      .from('message_templates')
      .select('id, body, enabled')
      .eq('org_id', orgId)
      .eq('status', 'collected')
      .eq('enabled', true)
      .limit(1)
      .maybeSingle();

    if (tpl?.id && phone) {
      const rendered = renderTemplate(String(tpl.body ?? ''), {
        customer_name: customerName,
        tracking_code: shipment.tracking_code ?? '',
        destination,
        status: 'collected',
        // backwards compat
        name: customerName,
        code: shipment.tracking_code ?? '',
      });

      const toE164 = normalizeE164Phone(phone);
      const shouldSend = isTwilioConfigured() && Boolean(toE164);

      const provider = shouldSend ? 'twilio_whatsapp' : 'log';
      const initialSendStatus = shouldSend ? 'queued' : 'logged';

      const { data: logRow, error: logErr } = await supabase
        .from('message_logs')
        .insert({
          org_id: orgId,
          shipment_id: shipment.id,
          template_id: tpl.id,
          to_phone: phone,
          provider,
          send_status: initialSendStatus,
          body: rendered,
          status: 'collected',
          sent_at: new Date().toISOString(),
          error: null,
        })
        .select('id')
        .single();

      if (!logErr && shouldSend && logRow?.id) {
        try {
          const r = await twilioSendWhatsApp({ toE164: toE164!, body: rendered });

          await supabase
            .from('message_logs')
            .update({
              provider_message_id: r.sid,
              send_status: r.status,
              error: null,
              sent_at: new Date().toISOString(),
            })
            .eq('id', logRow.id);
        } catch (e: any) {
          await supabase
            .from('message_logs')
            .update({ send_status: 'failed', error: e?.message ?? 'Send failed' })
            .eq('id', logRow.id);
        }
      }
    }
  } catch (e: any) {
    console.warn('[field/intake] auto-log failed', e?.message ?? e);
  }

  // Mark processed
  await supabase
    .from('client_sync_events')
    .update({ processed_at: new Date().toISOString(), shipment_id: shipment.id, tracking_code: shipment.tracking_code, error: null })
    .eq('org_id', orgId)
    .eq('client_event_id', clientEventId);

  revalidatePath('/shipments');
  return NextResponse.json({ ok: true, shipmentId: shipment.id, trackingCode: shipment.tracking_code });
}
