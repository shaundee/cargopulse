'use client';

import { Group, Paper, Stack, Text } from '@mantine/core';
import type { ShipmentEventRow, ShipmentStatus } from '../shipment-types';
import { formatWhen, statusLabel } from '../shipment-types';

export function TimelineCard({ detailEvents }: { detailEvents: ShipmentEventRow[] }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Text fw={700} mb="xs">
        Timeline
      </Text>

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
                  <Text fw={600}>{statusLabel(ev.status as ShipmentStatus)}</Text>
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
