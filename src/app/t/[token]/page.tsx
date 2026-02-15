import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { PublicTrackingClient } from './public-tracking-client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TrackingPage({ params }: { params: { token: string } }) {
  const token = String(params.token ?? '').trim();
  if (!UUID_RE.test(token)) notFound();

  const supabase = createSupabaseAdminClient();

  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select(`
      id, org_id, tracking_code, destination, service_type, current_status, last_event_at,
      org:organizations(name, support_phone),
      customer:customers(name)
    `)
    .eq('public_tracking_token', token)
    .maybeSingle();

  if (shipErr || !shipment) notFound();

  const { data: events } = await supabase
    .from('shipment_events')
    .select('status, note, occurred_at')
    .eq('shipment_id', shipment.id)
    .order('occurred_at', { ascending: true })
    .limit(200);

  const { data: pod } = await supabase
    .from('pod')
    .select('receiver_name, delivered_at, photo_url')
    .eq('shipment_id', shipment.id)
    .maybeSingle();

  let podSignedUrl: string | null = null;
  if (pod?.photo_url) {
    const { data: signed } = await supabase.storage.from('pod').createSignedUrl(pod.photo_url, 300);
    podSignedUrl = signed?.signedUrl ?? null;
  }

  return (
    <PublicTrackingClient
      data={{
        shipment,
        events: events ?? [],
        pod: pod ? { ...pod, signed_url: podSignedUrl } : null,
      }}
    />
  );
}
