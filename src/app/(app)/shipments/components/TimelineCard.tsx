'use client';

import { Group, Paper, Stack, Text, Button } from '@mantine/core';
import type { ShipmentEventRow, ShipmentStatus } from '../shipment-types';
import { formatWhen, statusLabel } from '../shipment-types';
import { IconDownload } from '@tabler/icons-react';

export function TimelineCard({
  detailEvents,
  trackingCode,
  destination,
}: {
  detailEvents: ShipmentEventRow[];
  trackingCode?: string;
  destination?: string | null
}) {

  return (
    <Paper withBorder p="sm" radius="md">
   <Group justify="space-between" mb="xs">
  <Text fw={700}>Timeline</Text>
  <Button
    size="xs"
    variant="light"
    leftSection={<IconDownload size={14} />}
    onClick={() => {
      const header = ['status', 'occurred_at', 'note'].join(',');
      const lines = detailEvents.map((ev) => {
        const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        return [esc(ev.status), esc(ev.occurred_at ?? ''), esc(ev.note ?? '')].join(',');
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
    }}
  >
    Export CSV
  </Button>
</Group>


      <Stack gap="xs">
        {detailEvents.length === 0 ? (
          <Text c="dimmed" size="sm">
            No events
          </Text>
        ) : (
          detailEvents.map((ev) => (
            <Paper key={ev.id} withBorder p="sm" radius="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                 <Text fw={600}>{statusLabel(ev.status as ShipmentStatus, destination)}</Text>
                  {ev.note ? (
                    <Text size="sm" c="dimmed">
                      {ev.note}
                    </Text>
                  ) : null}
                </Stack>
                <Text size="sm" c="dimmed">
                  {formatWhen(ev.occurred_at)}
                </Text>
              </Group>
            </Paper>
          ))
        )}
      </Stack>
    </Paper>
  );
}
