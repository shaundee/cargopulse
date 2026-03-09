'use client';

import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import {
  IconBox,
  IconCircleCheck,
  IconDownload,
  IconMapPin,
  IconPackage,
  IconPlaneDeparture,
  IconTruck,
} from '@tabler/icons-react';
import type { ShipmentEventRow, ShipmentStatus } from '../shipment-types';
import { formatWhen, statusBadgeColor, statusLabel, statusRank } from '../shipment-types';

// ── Journey progress bar ───────────────────────────────────────────────────────

const JOURNEY_STEPS: { status: ShipmentStatus; label: string; icon: React.ReactNode }[] = [
  { status: 'collected',           label: 'Collected',  icon: <IconBox size={12} /> },
  { status: 'loaded',              label: 'Loaded',     icon: <IconPackage size={12} /> },
  { status: 'departed_uk',         label: 'Departed',   icon: <IconPlaneDeparture size={12} /> },
  { status: 'arrived_destination', label: 'Arrived',    icon: <IconMapPin size={12} /> },
  { status: 'out_for_delivery',    label: 'Delivery',   icon: <IconTruck size={12} /> },
  { status: 'delivered',           label: 'Delivered',  icon: <IconCircleCheck size={12} /> },
];

function JourneyProgressBar({ currentStatus }: { currentStatus: ShipmentStatus }) {
  // Find the highest core step rank that is <= currentStatus rank
  const curRank = statusRank(currentStatus);
  const stepRanks = JOURNEY_STEPS.map((s) => statusRank(s.status));

  // activeIdx: the step that represents the current position in the journey
  let activeIdx = -1;
  for (let i = 0; i < stepRanks.length; i++) {
    if (stepRanks[i] <= curRank) activeIdx = i;
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {JOURNEY_STEPS.map((step, i) => {
          const isDone    = i < activeIdx;
          const isCurrent = i === activeIdx;
          const isFuture  = i > activeIdx;
          const isLast    = i === JOURNEY_STEPS.length - 1;

          const dotBg    = isDone ? '#4f46e5' : isCurrent ? '#4f46e5' : '#e5e7eb';
          const dotColor = isDone || isCurrent ? '#fff' : '#9ca3af';
          const dotSize  = 26;

          return (
            <div key={step.status} style={{ display: 'flex', alignItems: 'center', flex: isLast ? 0 : 1 }}>
              {/* Step dot */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: dotSize, height: dotSize, borderRadius: '50%',
                  background: dotBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: isCurrent ? '0 0 0 3px #e0e7ff' : 'none',
                  transition: 'all 0.2s',
                  color: dotColor,
                }}>
                  {step.icon}
                </div>
                <span style={{
                  fontSize: 9, fontWeight: isCurrent ? 700 : 500,
                  color: isCurrent ? '#4f46e5' : isDone ? '#6b7280' : '#9ca3af',
                  whiteSpace: 'nowrap',
                  letterSpacing: 0.2,
                }}>
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div style={{
                  flex: 1, height: 2, marginBottom: 15,
                  background: isDone ? '#4f46e5' : '#e5e7eb',
                  transition: 'background 0.2s',
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Actor badge helper ─────────────────────────────────────────────────────────

function actorColor(label: string | null | undefined) {
  if (!label) return 'gray';
  const l = label.toLowerCase();
  if (l === 'admin') return 'violet';
  if (l === 'staff') return 'blue';
  if (l === 'field') return 'orange';
  if (l === 'system') return 'gray';
  return 'teal';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TimelineCard({
  detailEvents,
  currentStatus,
  trackingCode,
  destination,
}: {
  detailEvents: ShipmentEventRow[];
  currentStatus?: ShipmentStatus;
  trackingCode?: string;
  destination?: string | null;
}) {
  function downloadCsv() {
    const header = ['status', 'occurred_at', 'actor', 'note'].join(',');
    const lines = detailEvents.map((ev) => {
      const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      return [
        esc(ev.status),
        esc(ev.occurred_at ?? ''),
        esc(ev.actor_label ?? ''),
        esc(ev.note ?? ''),
      ].join(',');
    });
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${trackingCode ?? 'shipment'}_timeline.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <Paper withBorder p="sm" radius="md">
      {/* Journey progress bar */}
      {currentStatus && <JourneyProgressBar currentStatus={currentStatus} />}

      <Group justify="space-between" mb="sm">
        <Text fw={700}>Updates</Text>
        {detailEvents.length > 0 && (
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconDownload size={13} />}
            onClick={downloadCsv}
          >
            Export CSV
          </Button>
        )}
      </Group>

      {detailEvents.length === 0 ? (
        <Text c="dimmed" size="sm">No events recorded yet.</Text>
      ) : (
        <Stack gap={0}>
          {detailEvents.map((ev, i) => {
            const isLast = i === detailEvents.length - 1;
            return (
              <div key={ev.id} style={{ display: 'flex', gap: 12 }}>
                {/* Vertical track */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                  <div style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--mantine-color-blue-5)',
                    marginTop: 6,
                    flexShrink: 0,
                    boxShadow: '0 0 0 3px var(--mantine-color-blue-1)',
                  }} />
                  {!isLast && (
                    <div style={{
                      width: 2,
                      flex: 1,
                      background: 'var(--mantine-color-gray-3)',
                      minHeight: 16,
                    }} />
                  )}
                </div>

                {/* Content */}
                <Stack gap={2} pb={isLast ? 0 : 'sm'} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Badge
                      color={statusBadgeColor(ev.status as ShipmentStatus)}
                      variant="light"
                      size="sm"
                      style={{ flexShrink: 0 }}
                    >
                      {statusLabel(ev.status as ShipmentStatus, destination)}
                    </Badge>

                    {ev.actor_label && (
                      <Badge
                        color={actorColor(ev.actor_label)}
                        variant="dot"
                        size="sm"
                        style={{ flexShrink: 0 }}
                      >
                        {ev.actor_label}
                      </Badge>
                    )}

                    <Text size="xs" c="dimmed" style={{ marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {formatWhen(ev.occurred_at)}
                    </Text>
                  </Group>

                  {ev.note && (
                    <Text size="sm" c="dimmed" style={{ wordBreak: 'break-word' }}>
                      {ev.note}
                    </Text>
                  )}
                </Stack>
              </div>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
