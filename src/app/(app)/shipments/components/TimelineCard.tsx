'use client';

import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import type { ShipmentEventRow, ShipmentStatus } from '../shipment-types';
import { formatWhen, statusBadgeColor, statusLabel } from '../shipment-types';

function actorColor(label: string | null | undefined) {
  if (!label) return 'gray';
  const l = label.toLowerCase();
  if (l === 'admin') return 'violet';
  if (l === 'staff') return 'blue';
  if (l === 'field') return 'orange';
  if (l === 'system') return 'gray';
  // Named agents get teal
  return 'teal';
}

export function TimelineCard({
  detailEvents,
  trackingCode,
  destination,
}: {
  detailEvents: ShipmentEventRow[];
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
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Timeline</Text>
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