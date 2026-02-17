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

function str(v: unknown) {
  return String(v ?? '').trim();
}

function optStr(v: unknown) {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function num(v: unknown) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown) {
  if (v === null || v === undefined || v === '') return null;
  return Boolean(v);
}

function pick<T>(...vals: T[]) {
  for (const v of vals) {
    if (v !== undefined) return v;
  }
  return undefined;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const clientEventId = str(form.get('clientEventId'));
  const payload = parsePayload(form.get('payload')) as Record<string, unknown> | null;

  if (!clientEventId) return NextResponse.json({ error: 'clientEventId is required' }, { status: 400 });
  if (!payload) return NextResponse.json({ error: 'payload must be valid JSON' }, { status: 400 });

  const customerName = str(payload.customerName);
  const phone = str(payload.phone);
  const destination = str(payload.destination);
  const serviceType = str(payload.serviceType || 'depot') as 'depot' | 'door_to_door';

  const cargoTypeRaw = str(payload.cargoType || 'general');
  const allowed = new Set([
    'general',
    'barrel',
    'box',
    'crate',
    'pallet',
    'vehicle',
    'machinery',
    'mixed',
    'other',
  ]);
  const cargoTypeSafe = (allowed.has(cargoTypeRaw) ? cargoTypeRaw : 'general') as
    | 'general'
    | 'barrel'
    | 'box'
    | 'crate'
    | 'pallet'
    | 'vehicle'
    | 'machinery'
    | 'mixed'
    | 'other';

  const occurredAtISO = str(payload.occurredAtISO) || new Date().toISOString();

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
  const { error: evInsErr } = await supabase.from('client_sync_events').insert({
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

  // --- cargo meta (backwards compatible with older outbox payload keys) ---
  const quantity = num((payload as any).quantity);

  const pickupAddress = optStr((payload as any).pickupAddress);
  const pickupContactPhone = optStr((payload as any).pickupContactPhone);
  const notes = optStr((payload as any).notes);

  // old keys: machineryWeightKg etc
  const weightKg = num(pick((payload as any).weightKg, (payload as any).machineryWeightKg));
  const lengthCm = num(pick((payload as any).lengthCm, (payload as any).machineryLengthCm));
  const widthCm = num(pick((payload as any).widthCm, (payload as any).machineryWidthCm));
  const heightCm = num(pick((payload as any).heightCm, (payload as any).machineryHeightCm));
  const forkliftRequired = bool(pick((payload as any).forkliftRequired, (payload as any).machineryForkliftRequired));
  const handlingNotes = optStr((payload as any).handlingNotes);

  // vehicle keys: old keysReceived, new vehicleKeysReceived
  const vehicleMake = optStr((payload as any).vehicleMake);
  const vehicleModel = optStr((payload as any).vehicleModel);
  const vehicleYear = optStr((payload as any).vehicleYear);
  const vehicleVin = optStr((payload as any).vehicleVin);
  const vehicleReg = optStr((payload as any).vehicleReg);
  const keysReceived = bool(pick((payload as any).keysReceived, (payload as any).vehicleKeysReceived));

  const cargoMeta: Record<string, unknown> = {
    pickup_address: pickupAddress,
    pickup_contact_phone: pickupContactPhone,
    notes,
  };

  if (cargoTypeSafe === 'barrel' || cargoTypeSafe === 'box') {
    if (Number.isFinite(quantity as any)) cargoMeta.quantity = quantity;
  }

  if (cargoTypeSafe === 'crate' || cargoTypeSafe === 'pallet' || cargoTypeSafe === 'machinery') {
    cargoMeta.dimensions = {
      weight_kg: weightKg,
      length_cm: lengthCm,
      width_cm: widthCm,
      height_cm: heightCm,
      forklift_required: forkliftRequired,
      handling_notes: handlingNotes,
    };
  }

  if (cargoTypeSafe === 'vehicle') {
    cargoMeta.vehicle = {
      make: vehicleMake,
      model: vehicleModel,
      year: vehicleYear,
      vin: vehicleVin,
      reg: vehicleReg,
      keys_received: keysReceived,
      handling_notes: handlingNotes,
    };
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
    const { error: updErr } = await supabase.from('customers').update({ name: customerName }).eq('id', customerId);
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
      cargo_type: cargoTypeSafe,
      cargo_meta: cargoMeta,
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

  const shipmentId = shipment.id as string;
  const createdBy = user.id;

  // 3) Insert initial event
  const { error: evErr } = await supabase.from('shipment_events').insert({
    org_id: orgId,
    shipment_id: shipmentId,
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

    const { error: upErr } = await supabase.storage.from('assets').upload(path, bytes, { contentType, upsert: true });
    if (upErr) throw new Error(upErr.message);

    const { error: assetErr } = await supabase.from('shipment_assets').insert({
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
      .update({
        processed_at: new Date().toISOString(),
        shipment_id: shipmentId,
        tracking_code: shipment.tracking_code,
        error: e?.message ?? 'asset_upload_failed',
      })
      .eq('org_id', orgId)
      .eq('client_event_id', clientEventId);

    return NextResponse.json({ error: e?.message ?? 'Asset upload failed', shipmentId }, { status: 400 });
  }

  // 5) Best-effort auto-log/send "collected" message
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
          shipment_id: shipmentId,
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
          await supabase.from('message_logs').update({ send_status: 'failed', error: e?.message ?? 'Send failed' }).eq('id', logRow.id);
        }
      }
    }
  } catch (e: any) {
    console.warn('[field/intake] auto-log failed', e?.message ?? e);
  }

  // Mark processed
  await supabase
    .from('client_sync_events')
    .update({
      processed_at: new Date().toISOString(),
      shipment_id: shipmentId,
      tracking_code: shipment.tracking_code,
      error: null,
    })
    .eq('org_id', orgId)
    .eq('client_event_id', clientEventId);

  revalidatePath('/shipments');
  revalidatePath('/field');

  return NextResponse.json({ ok: true, shipmentId, trackingCode: shipment.tracking_code });
}
