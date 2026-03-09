'use client';

import { useEffect, useMemo, useState } from 'react';
import { Collapse } from '@mantine/core';
import {
  IconBrandWhatsapp,
  IconChevronDown,
  IconChevronUp,
  IconBox,
  IconTruck,
  IconPlaneDeparture,
  IconMapPin,
  IconFileSearch,
  IconShieldCheck,
  IconPackage,
  IconUserCheck,
  IconCircleCheck,
} from '@tabler/icons-react';
import type { ShipmentStatus, TemplateRow } from '../shipment-types';
import { OPTIONAL_STATUSES, statusOrder } from '../shipment-types';

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderTemplate(body: string, vars: Record<string, string>) {
  return String(body ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => vars[k] ?? '');
}

function pillLabel(s: ShipmentStatus): string {
  switch (s) {
    case 'received':             return 'Received';
    case 'collected':            return 'Collected';
    case 'loaded':               return 'Loaded';
    case 'departed_uk':          return 'Departed UK';
    case 'arrived_destination':  return 'Arrived';
    case 'customs_processing':   return 'Customs';
    case 'customs_cleared':      return 'Cleared';
    case 'awaiting_collection':  return 'At depot';
    case 'collected_by_customer': return 'By customer';
    case 'out_for_delivery':     return 'Out for delivery';
    case 'delivered':            return 'Delivered';
  }
}

const PILL_ICON: Record<string, React.ReactNode> = {
  received:              <IconBox size={13} />,
  collected:             <IconPackage size={13} />,
  loaded:                <IconTruck size={13} />,
  departed_uk:           <IconPlaneDeparture size={13} />,
  arrived_destination:   <IconMapPin size={13} />,
  customs_processing:    <IconFileSearch size={13} />,
  customs_cleared:       <IconShieldCheck size={13} />,
  awaiting_collection:   <IconPackage size={13} />,
  collected_by_customer: <IconUserCheck size={13} />,
  out_for_delivery:      <IconTruck size={13} />,
  delivered:             <IconCircleCheck size={13} />,
};

const ICON_BG: Record<string, string> = {
  received:              '#dbeafe',
  collected:             '#fef3c7',
  loaded:                '#e0e7ff',
  departed_uk:           '#ede9fe',
  arrived_destination:   '#d1fae5',
  customs_processing:    '#fef9c3',
  customs_cleared:       '#d1fae5',
  awaiting_collection:   '#e0e7ff',
  collected_by_customer: '#fce7f3',
  out_for_delivery:      '#ffedd5',
  delivered:             '#dcfce7',
};

function PillIcon({ status, greyed }: { status: string; greyed: boolean }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 5, flexShrink: 0,
      background: greyed ? '#f3f4f6' : (ICON_BG[status] ?? '#f3f4f6'),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {PILL_ICON[status] ?? <IconPackage size={13} />}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function StatusUpdateCard({
  currentStatus,
  templates,
  customerName,
  trackingCode,
  destination,
  publicTrackingToken,
  enabledStatuses = [],
  onSave,
  saving,
}: {
  currentStatus: ShipmentStatus;
  templates: TemplateRow[];
  customerName: string;
  trackingCode: string;
  destination: string;
  publicTrackingToken?: string | null;
  enabledStatuses?: string[];
  onSave: (opts: { status: ShipmentStatus; sendUpdate: boolean; templateId: string | null; note: string }) => void;
  saving: boolean;
}) {
  const [pendingStatus, setPendingStatus] = useState<ShipmentStatus | null>(null);
  const [note, setNote] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Reset when current status changes (after a save + reload)
  useEffect(() => {
    setPendingStatus(null);
    setNote('');
    setPreviewOpen(false);
  }, [currentStatus]);

  const currentRank  = statusOrder.indexOf(currentStatus);
  const isDelivered  = currentStatus === 'delivered';

  // Visible pills: skip 'received' (auto-set), hide disabled optionals
  const visibleStatuses = statusOrder.filter((s) => {
    if (s === 'received') return false;
    if (OPTIONAL_STATUSES.includes(s)) return enabledStatuses.includes(s);
    return true;
  });

  // The first future visible status gets "NEXT"
  const firstNext = visibleStatuses.find((s) => statusOrder.indexOf(s) > currentRank) ?? null;

  // Templates
  const enabledTemplates = useMemo(() => templates.filter((t) => t.enabled), [templates]);
  const effectiveStatus  = pendingStatus ?? currentStatus;

  useEffect(() => {
    const match = enabledTemplates.find((t) => t.status === effectiveStatus);
    setTemplateId(match?.id ?? enabledTemplates[0]?.id ?? null);
  }, [effectiveStatus, enabledTemplates]);

  const selectedTemplate = enabledTemplates.find((t) => t.id === templateId) ?? null;

  const trackingUrl = useMemo(() => {
    if (!publicTrackingToken || typeof window === 'undefined') return '';
    return `${window.location.origin}/t/${publicTrackingToken}`;
  }, [publicTrackingToken]);

  const preview = useMemo(() => {
    if (!selectedTemplate?.body) return '';
    return renderTemplate(selectedTemplate.body, {
      customer_name: customerName,
      tracking_code: trackingCode,
      destination,
      status: effectiveStatus,
      note,
      tracking_url: trackingUrl,
      name: customerName,
      code: trackingCode,
    });
  }, [customerName, destination, note, effectiveStatus, selectedTemplate?.body, trackingCode, trackingUrl]);

  function handlePillClick(s: ShipmentStatus) {
    if (statusOrder.indexOf(s) < currentRank) return; // past — disabled
    if (pendingStatus === s) {
      setPendingStatus(null);
    } else {
      setPendingStatus(s);
      setPreviewOpen(false);
      setNote('');
    }
  }

  function handleSave(sendUpdate: boolean) {
    onSave({
      status: pendingStatus ?? currentStatus,
      sendUpdate,
      templateId: sendUpdate ? (templateId ?? null) : null,
      note,
    });
    setPendingStatus(null);
    setNote('');
    setPreviewOpen(false);
  }

  return (
    <div style={{ borderRadius: 12, border: '1px solid #e5e7eb', padding: '14px 16px', background: '#fff' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: '#9ca3af', marginBottom: 12 }}>
        UPDATE STATUS
      </div>

      {isDelivered ? (
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
          Delivered — status is locked. Use &ldquo;Proof of delivery&rdquo; to update the photo.
        </p>
      ) : (
        <>
          {/* ── Status pills ─────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {visibleStatuses.map((s) => {
              const rank       = statusOrder.indexOf(s);
              const isPast     = rank < currentRank;
              const isCurrent  = s === currentStatus;
              const isNext     = s === firstNext;
              const isPending  = s === pendingStatus;
              const isOptional = OPTIONAL_STATUSES.includes(s);
              const isFinal    = s === 'delivered';

              let bg      = '#fff';
              let border  = '1.5px solid #e5e7eb';
              let color   = '#1f2937';
              let opacity = 1;
              let fw      = 500;

              if (isPast) {
                bg = '#f9fafb'; border = '1.5px solid #f3f4f6'; color = '#9ca3af'; opacity = 0.65;
              } else if (isCurrent && isPending) {
                bg = '#312e81'; border = '1.5px solid #312e81'; color = '#fff'; fw = 600;
              } else if (isCurrent) {
                bg = '#4f46e5'; border = '1.5px solid #4f46e5'; color = '#fff'; fw = 600;
              } else if (isPending) {
                bg = '#eef2ff'; border = '2px solid #4f46e5'; color = '#3730a3'; fw = 600;
              } else if (isNext) {
                bg = '#fafafa'; border = '1.5px dashed #6366f1';
              } else if (isFinal) {
                bg = '#f0fdf4'; border = '1.5px solid #bbf7d0'; color = '#166534';
              }

              return (
                <div key={s} style={{ position: 'relative' }}>
                  {isOptional && (
                    <div style={{
                      position: 'absolute', top: -7, right: 3, zIndex: 1,
                      background: '#fef3c7', color: '#92400e',
                      fontSize: 8, fontWeight: 800, padding: '1px 4px',
                      borderRadius: 3, letterSpacing: 0.5, lineHeight: 1.5,
                    }}>
                      OPT
                    </div>
                  )}
                  <button
                    onClick={() => !isPast && handlePillClick(s)}
                    disabled={isPast || saving}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: bg, border, borderRadius: 9,
                      padding: '7px 10px',
                      cursor: isPast || saving ? 'not-allowed' : 'pointer',
                      opacity: saving && !isPending ? opacity * 0.7 : opacity,
                      transition: 'all 0.12s',
                      outline: 'none', fontFamily: 'inherit',
                    }}
                  >
                    <PillIcon status={s} greyed={isPast} />
                    <span style={{ fontSize: 13, fontWeight: fw, color, whiteSpace: 'nowrap' }}>
                      {pillLabel(s)}
                    </span>
                    {isCurrent && (
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#a5b4fc', flexShrink: 0 }} />
                    )}
                    {isNext && !isPending && (
                      <span style={{ fontSize: 9, color: '#f59e0b', fontWeight: 800, letterSpacing: 0.5 }}>
                        NEXT
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── Action area (only when a pill is selected) ────────────── */}
          {pendingStatus !== null && (() => {
            const isResend = pendingStatus === currentStatus;
            return (
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {isResend && (
                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
                  Status already set — this will only send the WhatsApp notification.
                </p>
              )}
              <input
                type="text"
                placeholder="Add a note (optional)..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px',
                  border: '1px solid #e5e7eb', borderRadius: 8,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                  boxSizing: 'border-box', color: '#1f2937',
                }}
              />

              {selectedTemplate && (
                <div>
                  <button
                    onClick={() => setPreviewOpen((o) => !o)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: 'none', border: 'none', padding: '2px 0',
                      cursor: 'pointer', color: '#6366f1', fontSize: 13, fontWeight: 500,
                      fontFamily: 'inherit',
                    }}
                  >
                    {previewOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
                    Preview WhatsApp message
                  </button>
                  <Collapse in={previewOpen}>
                    <div style={{
                      marginTop: 6, background: '#f0fdf4', border: '1px solid #bbf7d0',
                      borderRadius: 8, padding: '10px 12px',
                      fontSize: 13, color: '#166534', lineHeight: 1.5,
                    }}>
                      {preview || '(no preview)'}
                    </div>
                  </Collapse>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || !selectedTemplate}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    background: saving || !selectedTemplate ? '#9ca3af' : '#16a34a',
                    color: '#fff', border: 'none', borderRadius: 10,
                    padding: '12px 16px', fontWeight: 700, fontSize: 14,
                    cursor: saving || !selectedTemplate ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <IconBrandWhatsapp size={18} />
                  {isResend ? 'Send notification' : 'Update & Notify'}
                </button>
                {!isResend && (
                  <button
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    style={{
                      padding: '12px 16px', borderRadius: 10,
                      border: '1.5px solid #e5e7eb', background: '#fff',
                      fontWeight: 600, fontSize: 14,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      color: '#374151', whiteSpace: 'nowrap', fontFamily: 'inherit',
                    }}
                  >
                    Save only
                  </button>
                )}
              </div>
            </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
