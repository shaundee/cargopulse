import { notFound } from 'next/navigation';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { PublicTrackingClient } from './public-tracking-client';

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

export default async function TrackingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // If someone pastes a shipment ID / random string, treat as not found.
  if (!token || !isUuid(token)) notFound();

  try {
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

    if (shipErr) {
      // In dev: show the real issue instead of lying with 404
      if (process.env.NODE_ENV !== 'production') {
        return (
          <div style={{ padding: 24, fontFamily: 'system-ui' }}>
            <h2>Public tracking error</h2>
            <p>Query failed (this would be hidden as 404 in production):</p>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 8 }}>
              {shipErr.message}
            </pre>
            <p style={{ marginTop: 12 }}>
              Most common cause: <b>SUPABASE_SERVICE_ROLE_KEY</b> missing/incorrect in <b>.env.local</b>.
            </p>
          </div>
        );
      }
      notFound();
    }

    if (!shipment) notFound();

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
  } catch (e: any) {
    // In dev: show the real issue; in prod: 404.
    if (process.env.NODE_ENV !== 'production') {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui' }}>
          <h2>Public tracking crashed</h2>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#f6f6f6', padding: 12, borderRadius: 8 }}>
            {e?.message ?? String(e)}
          </pre>
          <p style={{ marginTop: 12 }}>
            Check <b>NEXT_PUBLIC_SUPABASE_URL</b> and <b>SUPABASE_SERVICE_ROLE_KEY</b>.
          </p>
        </div>
      );
    }
    notFound();
  }
}
