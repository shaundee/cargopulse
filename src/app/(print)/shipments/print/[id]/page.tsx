import { notFound, redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PrintControls } from './print-controls';
import { canUseBOL } from '@/lib/billing/plan';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusLabel(status: unknown, destination?: string | null) {
  switch (String(status ?? '')) {
    case 'received': return 'Received at UK depot';
    case 'collected': return 'Collected';
    case 'loaded': return 'Loaded';
    case 'departed_uk': return 'Departed UK';
    case 'arrived_destination':
      return destination ? `Arrived — ${destination}` : 'Arrived at destination';
    case 'collected_by_customer': return 'Collected by customer';
    case 'out_for_delivery': return 'Out for delivery';
    case 'delivered': return 'Delivered';
    default: return String(status ?? '');
  }
}

function fmt(iso: unknown) {
  const d = iso ? new Date(String(iso)) : null;
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtDate(iso: unknown) {
  const d = iso ? new Date(String(iso)) : null;
  if (!d || isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', {
    timeZone: 'Europe/London',
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ShipmentPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status, plan_tier')
    .eq('org_id', membership.org_id)
    .maybeSingle();

  if (!canUseBOL(billing)) redirect('/settings?upgrade=bol');

  const { data: shipment } = await supabase
    .from('shipments')
    .select(`
      id, tracking_code, destination, service_type, current_status,
      created_at, last_event_at, public_tracking_token,
      cargo_type, cargo_meta, internal_notes, reference_no,
      customers(name, phone, phone_e164),
      org:organizations(name, support_phone, logo_url)
    `)
    .eq('org_id', membership.org_id)
    .eq('id', id)
    .maybeSingle();

  if (!shipment) notFound();

  const { data: events } = await supabase
    .from('shipment_events')
    .select('status, note, occurred_at')
    .eq('shipment_id', shipment.id)
    .order('occurred_at', { ascending: true })
    .limit(200);

  const { data: pod } = await supabase
    .from('pod')
    .select('receiver_name, delivered_at')
    .eq('shipment_id', shipment.id)
    .maybeSingle();

  const s = shipment as any;
  const org = s.org ?? {};
  const customer = Array.isArray(s.customers) ? s.customers[0] : s.customers;
  const meta = s.cargo_meta && typeof s.cargo_meta === 'object' ? s.cargo_meta : {};
  const veh = meta.vehicle ?? null;
  const dims = meta.dimensions ?? null;

  const trackingUrl = s.public_tracking_token
    ? `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/t/${s.public_tracking_token}`
    : null;

  // QR code via Google Charts (no npm dep, works offline on the print page)
  const qrUrl = trackingUrl
    ? `https://chart.googleapis.com/chart?cht=qr&chs=120x120&chl=${encodeURIComponent(trackingUrl)}&choe=UTF-8`
    : null;

  const isDelivered = s.current_status === 'delivered';

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
          font-size: 11px;
          color: #111;
          background: #fff;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 14mm 14mm 10mm;
          background: #fff;
          position: relative;
        }

        /* ── Header ── */
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2.5px solid #111;
          padding-bottom: 10px;
          margin-bottom: 12px;
        }

        .header-left { flex: 1; }
        .org-name { font-size: 20px; font-weight: 900; letter-spacing: -0.5px; }
        .org-sub { font-size: 10px; color: #555; margin-top: 2px; }

        .doc-type {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #555;
          text-align: right;
        }
        .tracking-code {
          font-size: 26px;
          font-weight: 900;
          letter-spacing: 1px;
          text-align: right;
          font-family: 'Courier New', monospace;
          line-height: 1;
          margin-top: 4px;
        }

        /* ── Status banner ── */
        .status-banner {
          background: #111;
          color: #fff;
          padding: 6px 12px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          display: inline-block;
          margin-bottom: 12px;
        }

        /* ── Grid ── */
        .grid-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .grid-3 {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 10px;
          margin-bottom: 10px;
        }

        .card {
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 8px 10px;
        }

        .card-label {
          font-size: 8.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
          color: #888;
          margin-bottom: 3px;
        }

        .card-value {
          font-size: 12px;
          font-weight: 600;
          color: #111;
          line-height: 1.3;
        }

        .card-value.large {
          font-size: 15px;
          font-weight: 900;
        }

        /* ── Section heading ── */
        .section-heading {
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: #888;
          border-bottom: 1px solid #ddd;
          padding-bottom: 4px;
          margin-bottom: 8px;
          margin-top: 12px;
        }

        /* ── Timeline ── */
        .timeline { }
        .tl-row {
          display: flex;
          gap: 10px;
          padding: 5px 0;
          border-bottom: 1px solid #f0f0f0;
        }
        .tl-row:last-child { border-bottom: none; }
        .tl-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #bbb;
          margin-top: 3px;
          flex-shrink: 0;
        }
        .tl-dot.active { background: #111; }
        .tl-status { font-weight: 600; flex: 1; }
        .tl-when { color: #777; white-space: nowrap; }
        .tl-note { color: #555; font-size: 10px; margin-top: 1px; grid-column: 2 / -1; }

        /* ── QR + footer ── */
        .bottom-section {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid #ddd;
          gap: 12px;
        }

        .qr-block { flex-shrink: 0; text-align: center; }
        .qr-block img { display: block; width: 90px; height: 90px; }
        .qr-label { font-size: 8px; color: #888; margin-top: 3px; text-align: center; }

        .terms {
          flex: 1;
          font-size: 8.5px;
          color: #777;
          line-height: 1.5;
        }

        .terms strong { color: #333; }

        /* ── POD block ── */
        .pod-block {
          border: 1.5px solid #111;
          border-radius: 4px;
          padding: 8px 10px;
          margin-top: 10px;
        }

        /* ── Print controls ── */
        .print-controls {
          padding: 12px 16px;
          background: #f5f5f5;
          border-bottom: 1px solid #ddd;
          display: flex;
          gap: 10px;
          align-items: center;
        }

        @media print {
          .print-controls { display: none !important; }
          .page { margin: 0; padding: 10mm 12mm 8mm; width: 100%; }
          body { background: #fff; }
        }
      `}</style>

      {/* Print controls — hidden on print */}
      <div className="print-controls">
        <PrintControls backHref="/shipments" trackingUrl={trackingUrl} />
      </div>

      <div className="page">

        {/* ── Header ── */}
        <div className="header">
          <div className="header-left">
            <div className="org-name">{org.name || 'Freight Forwarder'}</div>
            {org.support_phone && (
              <div className="org-sub">Tel: {org.support_phone}</div>
            )}
            <div className="org-sub">Issue date: {fmtDate(new Date())}</div>
          </div>
          <div>
            <div className="doc-type">Shipment Receipt / BOL</div>
            <div className="tracking-code">{s.tracking_code}</div>
          </div>
        </div>

        {/* ── Status banner ── */}
        <div className="status-banner">
          {statusLabel(s.current_status, s.destination)}
        </div>

        {/* ── Key details grid ── */}
        <div className="grid-3">
          <div className="card">
            <div className="card-label">Customer</div>
            <div className="card-value">{customer?.name ?? '—'}</div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              {customer?.phone_e164 ?? customer?.phone ?? ''}
            </div>
          </div>
          <div className="card">
            <div className="card-label">Destination</div>
            <div className="card-value large">{s.destination ?? '—'}</div>
          </div>
          <div className="card">
            <div className="card-label">Service</div>
            <div className="card-value">
              {s.service_type === 'door_to_door' ? 'Door to door' : s.service_type === 'depot' ? 'Depot collection' : s.service_type ?? '—'}
            </div>
          </div>
        </div>

        <div className="grid-3">
          <div className="card">
            <div className="card-label">Created</div>
            <div className="card-value">{fmt(s.created_at)}</div>
          </div>
          <div className="card">
            <div className="card-label">Last updated</div>
            <div className="card-value">{fmt(s.last_event_at)}</div>
          </div>
          <div className="card">
            <div className="card-label">Reference no.</div>
            <div className="card-value">{s.reference_no || '—'}</div>
          </div>
        </div>

        {/* ── Cargo ── */}
        {(s.cargo_type || veh || dims || meta.notes) && (
          <>
            <div className="section-heading">Cargo details</div>
            <div className="grid-2">
              <div className="card">
                <div className="card-label">Cargo type</div>
                <div className="card-value">{s.cargo_type ?? '—'}</div>
                {meta.quantity != null && (
                  <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Qty: {meta.quantity}</div>
                )}
                {meta.notes && (
                  <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>{meta.notes}</div>
                )}
              </div>

              {veh ? (
                <div className="card">
                  <div className="card-label">Vehicle</div>
                  <div className="card-value">
                    {[veh.year, veh.make, veh.model].filter(Boolean).join(' ') || '—'}
                  </div>
                  {veh.reg && <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Reg: {veh.reg}</div>}
                  {veh.vin && <div style={{ fontSize: 10, color: '#555' }}>VIN: {veh.vin}</div>}
                  {veh.keys_received != null && (
                    <div style={{ fontSize: 10, color: '#555' }}>
                      Keys received: {veh.keys_received ? 'Yes' : 'No'}
                    </div>
                  )}
                </div>
              ) : dims ? (
                <div className="card">
                  <div className="card-label">Dimensions</div>
                  <div className="card-value">
                    {[dims.length_cm && `L${dims.length_cm}cm`, dims.width_cm && `W${dims.width_cm}cm`, dims.height_cm && `H${dims.height_cm}cm`].filter(Boolean).join(' × ') || '—'}
                  </div>
                  {dims.weight_kg && <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Weight: {dims.weight_kg}kg</div>}
                  {dims.forklift_required && <div style={{ fontSize: 10, color: '#555' }}>Forklift required</div>}
                </div>
              ) : null}
            </div>
          </>
        )}

        {/* ── Internal notes ── */}
        {s.internal_notes && (
          <>
            <div className="section-heading">Notes</div>
            <div className="card" style={{ marginBottom: 10 }}>
              <div className="card-value" style={{ fontWeight: 400 }}>{s.internal_notes}</div>
            </div>
          </>
        )}

        {/* ── Timeline ── */}
        <div className="section-heading">Status history</div>
        <div className="timeline">
          {(events ?? []).length === 0 ? (
            <div style={{ color: '#999', fontSize: 10 }}>No events recorded.</div>
          ) : (
            (events ?? []).map((e, i) => {
              const isLatest = i === (events ?? []).length - 1;
              return (
                <div key={i} className="tl-row">
                  <div className={`tl-dot ${isLatest ? 'active' : ''}`} />
                  <div className="tl-status">{statusLabel(e.status, s.destination)}</div>
                  <div className="tl-when">{fmt(e.occurred_at)}</div>
                  {(e as any).note && (
                    <div className="tl-note">{String((e as any).note)}</div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── POD ── */}
        {pod && isDelivered && (
          <>
            <div className="section-heading">Proof of delivery</div>
            <div className="pod-block">
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div className="card-label">Received by</div>
                  <div className="card-value">{pod.receiver_name || '—'}</div>
                </div>
                <div>
                  <div className="card-label">Delivered at</div>
                  <div className="card-value">{fmt(pod.delivered_at)}</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Customer signature strip ── */}
        {!isDelivered && (
          <>
            <div className="section-heading">Customer acknowledgement</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div>
                <div style={{ borderBottom: '1px solid #111', marginBottom: 4, height: 32 }} />
                <div style={{ fontSize: 9, color: '#888' }}>Customer signature</div>
              </div>
              <div>
                <div style={{ borderBottom: '1px solid #111', marginBottom: 4, height: 32 }} />
                <div style={{ fontSize: 9, color: '#888' }}>Date</div>
              </div>
            </div>
          </>
        )}

        {/* ── QR + Terms ── */}
        <div className="bottom-section">
          {qrUrl ? (
            <div className="qr-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrUrl} alt="Track shipment QR" />
              <div className="qr-label">Scan to track</div>
            </div>
          ) : null}

          <div className="terms">
            <strong>Terms & conditions:</strong> All goods are accepted and shipped subject to the forwarder&apos;s standard
            terms and conditions. The forwarder is not liable for any loss, damage, or delay unless caused by gross
            negligence. It is the customer&apos;s responsibility to ensure accurate declaration of contents and value.
            Prohibited items are not accepted. This document serves as a receipt of collection only and does not
            constitute a contract of carriage until countersigned.
            {org.name && (
              <> By using the services of {org.name}, the customer agrees to these terms.</>
            )}
          </div>
        </div>

      </div>
    </>
  );
}