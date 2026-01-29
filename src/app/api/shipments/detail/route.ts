import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const shipmentId = url.searchParams.get('shipment_id');
  if (!shipmentId) return NextResponse.json({ error: 'shipment_id is required' }, { status: 400 });

  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select(`
  id, org_id, tracking_code, destination, current_status, service_type, last_event_at,
  customers(name, phone),
  pod:pod(shipment_id, receiver_name, photo_url, delivered_at)
`)
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: events, error: evtErr } = await supabase
    .from('shipment_events')
    .select('id, status, note, occurred_at, created_by')
    .eq('shipment_id', shipmentId)
    .order('occurred_at', { ascending: false })
    .limit(200);

  if (evtErr) return NextResponse.json({ error: evtErr.message }, { status: 400 });

  return NextResponse.json({ shipment, events: events ?? [] });
}
