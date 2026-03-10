import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

function extFor(contentType: string) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  return 'jpg';
}

export async function POST(req: Request) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const clientEventId = String(form.get('clientEventId') ?? '').trim();
  const payloadStr = String(form.get('payload') ?? '');
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(payloadStr || '{}');
  } catch {
    return NextResponse.json({ error: 'payload must be valid JSON' }, { status: 400 });
  }

  if (!clientEventId)
    return NextResponse.json({ error: 'clientEventId is required' }, { status: 400 });

  const shipmentId = String(payload.shipmentId ?? '').trim();
  if (!shipmentId)
    return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });

  const occurredAtISO = String(payload.occurredAtISO ?? '') || new Date().toISOString();

  // org_id from membership
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id)
    return NextResponse.json({ error: 'No organization membership' }, { status: 400 });
  const orgId = membership.org_id as string;

  // Verify shipment belongs to this org
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, tracking_code, current_status')
    .eq('id', shipmentId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  if (shipment.current_status !== 'received')
    return NextResponse.json({ error: 'Shipment cannot be collected — current status is not received' }, { status: 422 });

  // Idempotency: same pattern as intake route
  const { error: evInsErr } = await supabase.from('client_sync_events').insert({
    org_id: orgId,
    client_event_id: clientEventId,
    kind: 'collect_existing',
    payload,
  });

  if (evInsErr) {
    if ((evInsErr as any).code === '23505') {
      const { data: existing } = await supabase
        .from('client_sync_events')
        .select('shipment_id, tracking_code')
        .eq('org_id', orgId)
        .eq('client_event_id', clientEventId)
        .maybeSingle();
      return NextResponse.json({
        ok: true,
        duplicate: true,
        shipmentId: existing?.shipment_id,
        trackingCode: existing?.tracking_code,
      });
    }
    return NextResponse.json({ error: evInsErr.message }, { status: 400 });
  }

  // Insert collected event
  const { error: evErr } = await supabase.from('shipment_events').insert({
    org_id: orgId,
    shipment_id: shipmentId,
    status: 'collected',
    note: 'Collected (field)',
    occurred_at: occurredAtISO,
  });

  if (evErr) {
    await supabase
      .from('client_sync_events')
      .update({ processed_at: new Date().toISOString(), error: evErr.message })
      .eq('org_id', orgId)
      .eq('client_event_id', clientEventId);
    return NextResponse.json({ error: evErr.message }, { status: 400 });
  }

  // Update shipment current_status
  await supabase
    .from('shipments')
    .update({ current_status: 'collected', last_event_at: occurredAtISO })
    .eq('id', shipmentId);

  // Upload assets (photos + signature)
  const createdBy = user.id;

  async function uploadOne(
    file: unknown,
    kind: 'pickup_photo' | 'pickup_signature',
    idx: number,
  ) {
    if (!file || !(file instanceof Blob)) return null;
    const contentType = (file as any).type || 'image/jpeg';
    const ext = extFor(contentType);
    const path = `org/${orgId}/shipments/${shipmentId}/collect/${Date.now()}-${idx}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage
      .from('assets')
      .upload(path, bytes, { contentType, upsert: true });
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
    const photos = form.getAll('photos');
    const signature = form.get('signature');
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
    return NextResponse.json(
      { error: e?.message ?? 'Asset upload failed', shipmentId },
      { status: 400 },
    );
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
