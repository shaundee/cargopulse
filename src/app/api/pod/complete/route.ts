import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const shipmentId = String(form.get('shipmentId') ?? '').trim();
  const receiverName = String(form.get('receiverName') ?? '').trim();
  const file = form.get('file');

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!receiverName) return NextResponse.json({ error: 'receiverName is required' }, { status: 400 });
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  // Get org_id from membership (keeps org isolation)
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });
  const orgId = membership.org_id as string;

  // Ensure shipment exists + belongs to org
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id')
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  if (shipment.org_id !== orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const contentType = (file as any).type || 'image/jpeg';
  const ext =
    contentType.includes('png') ? 'png' :
    contentType.includes('webp') ? 'webp' :
    contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' :
    'jpg';

  const path = `org/${orgId}/shipments/${shipmentId}/${Date.now()}.${ext}`;

  // Upload to Storage bucket "pod"
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from('pod')
    .upload(path, bytes, { contentType, upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  const deliveredAt = new Date().toISOString();

  // Upsert POD (works if shipment_id is unique/PK)
  const { error: podErr } = await supabase
    .from('pod')
    .upsert({
      shipment_id: shipmentId,
      org_id: orgId,
      photo_url: path,
      receiver_name: receiverName,
      delivered_at: deliveredAt,
    });

  if (podErr) return NextResponse.json({ error: podErr.message }, { status: 400 });

  // Insert delivered event
  const { error: evErr } = await supabase.from('shipment_events').insert({
    shipment_id: shipmentId,
    org_id: orgId,
    status: 'delivered',
    note: `POD captured (${receiverName})`,
    occurred_at: deliveredAt,
  });

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 400 });

  // Update shipment status
  const { error: sErr } = await supabase
    .from('shipments')
    .update({ current_status: 'delivered', last_event_at: deliveredAt })
    .eq('id', shipmentId);

  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, path });
}
