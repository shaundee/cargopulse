import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { PrintControls } from './print-controls';

export default async function ShipmentPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
function labelStatus(status: unknown, destination?: string | null) {
  switch (String(status ?? '')) {
    case 'received': return 'Received';
    case 'collected': return 'Collected';
    case 'loaded': return 'Loaded';
    case 'departed_uk': return 'Departed (UK)';
    case 'arrived_destination':
      return destination ? `Arrived (${destination})` : 'Arrived (destination)';
    case 'out_for_delivery': return 'Out for delivery';
    case 'collected_by_customer': return 'Collected by customer';
    case 'delivered': return 'Delivered';
    default: return String(status ?? '');
  }
}

  const { id } = await params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/shipments/print/${encodeURIComponent(id)}`);

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) redirect('/onboarding');

  const { data: shipment } = await supabase
    .from('shipments')
    .select('id, tracking_code, destination, service_type, current_status, created_at, last_event_at, customers(name, phone)')
    .eq('org_id', membership.org_id)
    .eq('id', id)
    .maybeSingle();

  if (!shipment) redirect('/shipments');

  const { data: events } = await supabase
    .from('shipment_events')
    .select('status, note, occurred_at')
    .eq('shipment_id', shipment.id)
    .order('occurred_at', { ascending: true })
    .limit(200);

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
        h1 { margin: 0; font-size: 40px; letter-spacing: 0.5px; }
        .meta { margin-top: 10px; font-size: 14px; }
        .label { font-weight: 700; }
        .event { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 8px; }
      `}</style>

      <div className="no-print">
        <PrintControls backHref="/shipments" />
        <hr />
      </div>

      <h1>{shipment.tracking_code}</h1>

      <div className="meta">
        <div><span className="label">Customer:</span> {(shipment as any).customers?.name ?? '—'} • {(shipment as any).customers?.phone ?? '—'}</div>
        <div><span className="label">Destination:</span> {shipment.destination}</div>
        <div><span className="label">Service:</span> {shipment.service_type}</div>
        <div><span className="label">Status:</span> {labelStatus(shipment.current_status, shipment.destination)}</div>

      </div>

      <h2 style={{ marginTop: 20 }}>Timeline</h2>

      {(events ?? []).length ? (
        (events ?? []).map((e, idx) => (
          <div key={idx} className="event">
        <div><span className="label">{labelStatus(e.status, shipment.destination)}</span></div>
<div style={{ color: '#555', fontSize: 13 }}>
  {(() => { const d = e?.occurred_at ? new Date(String(e.occurred_at)) : null; return d && !isNaN(d.getTime()) ? d.toLocaleString() : '—'; })()}
</div>
            {(e as any).note ? <div style={{ marginTop: 6 }}>{String((e as any).note)}</div> : null}
          </div>
        ))
      ) : (
        <div style={{ color: '#666' }}>No events yet.</div>
      )}
    </div>
  );
}
