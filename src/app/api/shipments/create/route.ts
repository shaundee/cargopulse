import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function makeTrackingCode() {
  // e.g. JAM-6H2K9Q (fast + human-friendly)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `JAM-${s}`;
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);

  const customerName = String(body?.customerName ?? '').trim();
  const phone = String(body?.phone ?? '').trim();
  const destination = String(body?.destination ?? '').trim();
  const serviceType = (String(body?.serviceType ?? 'depot') === 'door_to_door') ? 'door_to_door' : 'depot';

  if (customerName.length < 2) return NextResponse.json({ error: 'Customer name too short' }, { status: 400 });
  if (phone.length < 6) return NextResponse.json({ error: 'Phone is required' }, { status: 400 });
  if (destination.length < 2) return NextResponse.json({ error: 'Destination is required' }, { status: 400 });

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

  // 1) Upsert customer by (org_id, phone)
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .upsert(
      { org_id: orgId, phone, name: customerName },
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

  return NextResponse.json({ ok: true, shipmentId: shipment.id, trackingCode: shipment.tracking_code });
}
