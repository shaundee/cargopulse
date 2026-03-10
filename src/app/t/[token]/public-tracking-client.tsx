'use client';

import { useEffect, useState } from 'react';
import {
  IconBrandWhatsapp,
  IconPhone,
  IconCopy,
  IconCheck,
  IconPackage,
  IconTruck,
  IconMapPin,
  IconClipboardCheck,
  IconShare2,
} from '@tabler/icons-react';
import { destFlag } from '@/lib/destinations';

// ─── Types ───────────────────────────────────────────────────────────────────

type PublicEvent = { status: string; note?: string | null; occurred_at?: string | null };

type Props = {
  data: {
    shipment: any;
    events: PublicEvent[];
    pod: null | {
      receiver_name?: string | null;
      delivered_at?: string | null;
      signed_url?: string | null;
    };
  };
};

// ─── Journey steps (simplified for progress bar) ─────────────────────────────

const CORE_STEPS = [
  { key: 'collected',           label: 'Collected' },
  { key: 'loaded',              label: 'Loaded' },
  { key: 'departed_uk',         label: 'Departed UK' },
  { key: 'arrived_destination', label: 'Arrived' },
  { key: 'out_for_delivery',    label: 'Delivery' },
  { key: 'delivered',           label: 'Delivered' },
];

const STATUS_TO_STEP: Record<string, number> = {
  received:             -1,
  collected:             0,
  loaded:                1,
  departed_uk:           2,
  arrived_destination:   3,
  customs_processing:    3,
  customs_cleared:       3,
  awaiting_collection:   3,
  collected_by_customer: 3,
  out_for_delivery:      4,
  delivered:             5,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────


function statusLabel(s: string, destination?: string): string {
  switch (s) {
    case 'received':             return 'Received at UK depot';
    case 'collected':            return 'Collected';
    case 'loaded':               return 'Loaded';
    case 'departed_uk':          return 'Departed UK';
    case 'arrived_destination':  return destination ? `Arrived — ${destination}` : 'Arrived at destination';
    case 'customs_processing':   return 'Customs processing';
    case 'customs_cleared':      return 'Customs cleared';
    case 'awaiting_collection':  return 'Awaiting collection';
    case 'collected_by_customer': return 'Collected by customer';
    case 'out_for_delivery':     return 'Out for delivery';
    case 'delivered':            return 'Delivered';
    default: return s.replace(/_/g, ' ');
  }
}

function statusHint(s: string, destination: string): string {
  switch (s) {
    case 'received':             return 'Your shipment has been received at our UK depot';
    case 'collected':            return 'Your shipment has been collected — preparing to load';
    case 'loaded':               return 'Your shipment is packed and ready to depart the UK';
    case 'departed_uk':          return `Your shipment has left the UK and is heading to ${destination}`;
    case 'arrived_destination':  return `Your shipment has arrived in ${destination}`;
    case 'customs_processing':   return 'Your shipment is going through customs clearance';
    case 'customs_cleared':      return 'Your shipment has cleared customs';
    case 'awaiting_collection':  return 'Your shipment is ready for collection at the depot';
    case 'collected_by_customer': return 'Your shipment has been collected by the customer';
    case 'out_for_delivery':     return 'Your shipment is out for delivery — arriving soon!';
    case 'delivered':            return 'Your shipment has been delivered successfully 🎉';
    default: return '';
  }
}

function nextStepHint(s: string, destination: string): string | null {
  switch (s) {
    case 'received':             return "Next: Collection — we'll pick up your shipment soon";
    case 'collected':            return 'Next: Loading — your shipment will be packed at our UK depot';
    case 'loaded':               return `Next: Departed UK — your shipment will be on its way to ${destination}`;
    case 'departed_uk':          return `Next: Arriving — your shipment is heading to ${destination}`;
    case 'arrived_destination':  return 'Next: Processing — your shipment is being prepared for delivery';
    case 'customs_processing':   return 'Next: Customs cleared — awaiting release from customs';
    case 'customs_cleared':      return 'Next: Delivery — your shipment is preparing for dispatch';
    case 'awaiting_collection':  return 'Visit the depot to collect your shipment';
    case 'collected_by_customer': return 'Your shipment has been collected';
    case 'out_for_delivery':     return "Next: Delivered — your shipment is almost there!";
    case 'delivered':            return null;
    default: return null;
  }
}

function statusIcon(s: string, size = 18) {
  switch (s) {
    case 'received':
    case 'collected':
    case 'awaiting_collection':  return <IconPackage size={size} />;
    case 'loaded':
    case 'departed_uk':
    case 'out_for_delivery':     return <IconTruck size={size} />;
    case 'arrived_destination':
    case 'customs_processing':
    case 'customs_cleared':
    case 'collected_by_customer': return <IconMapPin size={size} />;
    case 'delivered':            return <IconClipboardCheck size={size} />;
    default:                     return <IconPackage size={size} />;
  }
}

function digitsOnly(s: string) { return s.replace(/\D/g, ''); }

const DTF = (() => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch { return null; }
})();

function formatWhen(v: unknown): string {
  const d = v ? new Date(String(v)) : null;
  if (!d || isNaN(d.getTime())) return '—';
  if (!DTF) return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const parts = DTF.formatToParts(d);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  const dayPeriod = get('dayPeriod').toUpperCase();
  return `${get('day')} ${get('month')} ${get('year')} at ${get('hour')}:${get('minute')} ${dayPeriod}`.trim();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function PublicTrackingClient({ data }: Props) {
  const s = data.shipment;
  const destination = String(s?.destination ?? '').trim();
  const orgName     = String(s?.org?.name ?? '').trim();
  const logoUrl     = String(s?.org?.logo_url ?? '').trim();
  const supportPhone = String(s?.org?.support_phone ?? '').trim();
  const referralCode   = String(s?.org?.referral_code ?? '').trim();
  const originCountry  = String(s?.org?.origin_country ?? '').trim();
  const serviceType  = String(s?.service_type ?? '').trim();

  const waHref  = supportPhone ? `https://wa.me/${digitsOnly(supportPhone)}` : '';
  const telHref = supportPhone ? `tel:${supportPhone}` : '';

  const events = (data.events ?? [])
    .slice()
    .sort((a, b) => new Date(a.occurred_at ?? 0).getTime() - new Date(b.occurred_at ?? 0).getTime());

  const latest        = events[events.length - 1] ?? null;
  const currentStatus = String(latest?.status ?? s?.current_status ?? 'received').trim();
  const currentStepIdx = STATUS_TO_STEP[currentStatus] ?? -1;
  const isDelivered   = currentStatus === 'delivered';

  const flag = destFlag(destination);
  const hint = statusHint(currentStatus, destination);
  const next     = nextStepHint(currentStatus, destination);

  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied]     = useState(false);

  useEffect(() => { setShareUrl(window.location.href); }, []);

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareLink() {
    if (typeof navigator.share === 'function' && shareUrl) {
      navigator.share({ title: `Track ${s?.tracking_code ?? ''}`, url: shareUrl }).catch(() => {});
    } else {
      copyLink();
    }
  }

  // ── Styles (shared tokens) ────────────────────────────────────────────────
  const card: React.CSSProperties = {
    background: '#fff',
    borderRadius: 16,
    marginBottom: 10,
    overflow: 'hidden',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#eef0ff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      WebkitFontSmoothing: 'antialiased',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 14px 48px' }}>

        {/* ── Org header ──────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          {logoUrl ? (
            <img src={logoUrl} alt={orgName} style={{ height: 48, maxWidth: 160, borderRadius: 0, objectFit: 'contain' }} />
          ) : (
            <img
              src="/logosmall.svg?v=4"
              alt="Cargo44"
              style={{ height: 48, width: 'auto', objectFit: 'contain' }}
            />
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>{orgName || 'Your forwarder'}</div>
            {originCountry && (
              <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 2 }}>Shipping from {originCountry}</div>
            )}
          </div>
        </div>

        {/* ── Tracking card (gradient) ─────────────────────────────────────── */}
        <div style={{
          background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)',
          borderRadius: 16, padding: '20px 20px 22px',
          color: '#fff', marginBottom: 10, position: 'relative', overflow: 'hidden',
        }}>
          {/* Decorative circles */}
          <div style={{ position: 'absolute', top: -28, right: -28, width: 110, height: 110, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
          <div style={{ position: 'absolute', bottom: -40, right: 60, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, opacity: 0.65, marginBottom: 6 }}>TRACKING</div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 1.5, fontFamily: 'monospace' }}>
                {s?.tracking_code ?? '—'}
              </div>
            </div>
            <button
              onClick={copyLink}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'rgba(255,255,255,0.18)', border: 'none',
                borderRadius: 8, padding: '7px 13px',
                color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0,
              }}
            >
              {copied ? <IconCheck size={13} strokeWidth={3} /> : <IconCopy size={13} />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 18, fontSize: 13, opacity: 0.9, position: 'relative' }}>
            <span>To <strong>{destination} {flag}</strong></span>
            <span>Service <strong>{serviceType === 'door_to_door' ? 'Door to door' : 'Depot'}</strong></span>
          </div>
        </div>

        {/* ── Current status ───────────────────────────────────────────────── */}
        <div style={{
          ...card,
          background: isDelivered ? '#d1fae5' : '#f0fdf4',
          border: `1px solid ${isDelivered ? '#6ee7b7' : '#bbf7d0'}`,
          padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: isDelivered ? '#059669' : '#16a34a',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}>
            {statusIcon(currentStatus, 20)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#14532d' }}>
              {statusLabel(currentStatus, destination)}
            </div>
            {hint && (
              <div style={{ fontSize: 13, color: '#166534', marginTop: 3, lineHeight: 1.4 }}>{hint}</div>
            )}
          </div>
        </div>

        {/* ── Journey progress ─────────────────────────────────────────────── */}
        <div style={{ ...card, padding: '16px 14px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#9ca3af', marginBottom: 18 }}>
            JOURNEY PROGRESS
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start' }}>
            {CORE_STEPS.map((step, idx) => {
              const isCompleted = idx < currentStepIdx;
              const isCurrent   = idx === currentStepIdx;
              const isLast      = idx === CORE_STEPS.length - 1;

              const circleSize = isCurrent ? 32 : 26;

              return (
                <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {/* Line + Circle row */}
                  <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    {/* Left connector */}
                    {idx > 0 && (
                      <div style={{
                        flex: 1, height: 2,
                        background: (isCompleted || isCurrent) ? '#4338ca' : '#e5e7eb',
                        transition: 'background 0.3s',
                      }} />
                    )}

                    {/* Dot */}
                    <div style={{
                      width: circleSize, height: circleSize, borderRadius: '50%',
                      flexShrink: 0, zIndex: 1, position: 'relative',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isCompleted
                        ? '#4338ca'
                        : isCurrent
                          ? 'linear-gradient(135deg, #4338ca, #7c3aed)'
                          : '#e5e7eb',
                      color: (isCompleted || isCurrent) ? '#fff' : '#d1d5db',
                      boxShadow: isCurrent ? '0 0 0 4px rgba(99,102,241,0.2)' : 'none',
                      transition: 'all 0.3s',
                    }}>
                      {isCompleted
                        ? <IconCheck size={13} strokeWidth={3} />
                        : isCurrent
                          ? statusIcon(currentStatus, 14)
                          : null}
                    </div>

                    {/* Right connector */}
                    {!isLast && (
                      <div style={{
                        flex: 1, height: 2,
                        background: isCompleted ? '#4338ca' : '#e5e7eb',
                        transition: 'background 0.3s',
                      }} />
                    )}
                  </div>

                  {/* Step label */}
                  <div style={{
                    fontSize: 9.5, textAlign: 'center', marginTop: 7,
                    color: (isCompleted || isCurrent) ? '#4338ca' : '#9ca3af',
                    fontWeight: isCurrent ? 700 : 500,
                    lineHeight: 1.3, maxWidth: 48,
                  }}>
                    {step.key === 'arrived_destination' && destination ? (
                      <><span>Arrived</span><br /><span>{destination}</span></>
                    ) : (
                      step.label
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Next step hint ───────────────────────────────────────────────── */}
        {next && (
          <div style={{
            ...card,
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', gap: 12,
            borderLeft: '3px solid #7c3aed',
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0,
              background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IconTruck size={15} color="#7c3aed" />
            </div>
            <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.4 }}>{next}</div>
          </div>
        )}

        {/* ── Updates timeline ─────────────────────────────────────────────── */}
        {events.length > 0 && (
          <div style={{ ...card, padding: '16px 16px 8px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#9ca3af', marginBottom: 16 }}>
              UPDATES
            </div>
            {[...events].reverse().map((ev, i) => {
              const isLatest = i === 0;
              const isLast   = i === events.length - 1;
              return (
                <div key={i} style={{ display: 'flex', gap: 14, marginBottom: isLast ? 8 : 0 }}>
                  {/* Dot + vertical line */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 10, paddingTop: 4 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: isLatest ? '#4338ca' : '#d1d5db',
                    }} />
                    {!isLast && (
                      <div style={{ width: 1, flex: 1, minHeight: 16, background: '#e5e7eb', marginTop: 4 }} />
                    )}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, paddingBottom: isLast ? 0 : 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
                      {statusLabel(ev.status, destination)}
                    </div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                      {formatWhen(ev.occurred_at)}
                    </div>
                    {ev.note && (
                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.4 }}>{ev.note}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── POD ─────────────────────────────────────────────────────────── */}
        {data.pod && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8, color: '#111827' }}>Proof of delivery</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
              Received by: <strong style={{ color: '#111827' }}>{data.pod.receiver_name || '—'}</strong>
              {data.pod.delivered_at ? ` · ${formatWhen(data.pod.delivered_at)}` : ''}
            </div>
            {data.pod.signed_url && (
              <img src={data.pod.signed_url} alt="Proof of delivery" style={{ width: '100%', borderRadius: 10 }} />
            )}
          </div>
        )}

        {/* ── Support ─────────────────────────────────────────────────────── */}
        {(waHref || telHref) && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 12 }}>
              Need help with this shipment?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {waHref && (
                <a href={waHref} target="_blank" rel="noreferrer" style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: '#25d366', color: '#fff', borderRadius: 10, padding: '12px 14px',
                  fontWeight: 600, fontSize: 14, textDecoration: 'none',
                }}>
                  <IconBrandWhatsapp size={18} />
                  WhatsApp us
                </a>
              )}
              {telHref && (
                <a href={telHref} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: '#fff', color: '#374151', borderRadius: 10, padding: '12px 14px',
                  fontWeight: 600, fontSize: 14, textDecoration: 'none',
                  border: '1.5px solid #e5e7eb',
                }}>
                  <IconPhone size={18} />
                  Call
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Share ───────────────────────────────────────────────────────── */}
        <button onClick={shareLink} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 12,
          padding: '13px 16px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
          color: '#374151', marginBottom: 28,
        }}>
          <IconShare2 size={16} />
          Share tracking link
        </button>

        {/* ── Referral card ────────────────────────────────────────────── */}
        <div style={{
            ...card,
            padding: '18px 18px 20px',
            background: 'linear-gradient(135deg, #4338ca 0%, #7c3aed 100%)',
            color: '#fff',
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
              Are you a freight shipper? 📦
            </div>
            <div style={{ fontSize: 13, opacity: 0.9, marginBottom: 14, lineHeight: 1.5 }}>
              Track your shipments and send WhatsApp updates to your customers — just like this.
              {referralCode && ' Your shipper is already on Cargo44.'}
            </div>
            <a
              href={referralCode ? `/r/${referralCode}` : '/signup'}
              style={{
                display: 'inline-block',
                background: '#fff',
                color: '#4338ca',
                borderRadius: 8,
                padding: '9px 18px',
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
              }}
            >
              Try Cargo44 free →
            </a>
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
          Powered by <strong style={{ color: '#4338ca' }}>cargo44</strong>
        </div>

      </div>
    </div>
  );
}
