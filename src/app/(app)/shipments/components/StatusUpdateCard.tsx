'use client';

import { Button, Checkbox, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import type { ShipmentStatus } from '../shipment-types';
import { statusLabel } from '../shipment-types';

export function StatusUpdateCard({
  currentStatus,
  eventStatus,
  setEventStatus,
  eventNote,
  setEventNote,
  autoLog,
  setAutoLog,
  onSave,
  saving,
}: {
  currentStatus: ShipmentStatus;
  eventStatus: ShipmentStatus;
  setEventStatus: (v: ShipmentStatus) => void;
  eventNote: string;
  setEventNote: (v: string) => void;
  autoLog: boolean;
  setAutoLog: (v: boolean) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const isDelivered = currentStatus === 'delivered';

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Text fw={700}>Add status update</Text>

        {isDelivered ? (
          <Text size="sm" c="dimmed">
            Delivered — status is locked. (Use “Replace POD” if you need to update the photo.)
          </Text>
        ) : null}

        <Select
          label="Status"
          data={[
            { value: 'collected', label: statusLabel('collected') },
            { value: 'received', label: statusLabel('received') },
            { value: 'loaded', label: statusLabel('loaded') },
            { value: 'departed_uk', label: statusLabel('departed_uk') },
            { value: 'arrived_jamaica', label: statusLabel('arrived_jamaica') },
            { value: 'out_for_delivery', label: statusLabel('out_for_delivery') },
          ]}
          value={eventStatus}
          onChange={(v) => setEventStatus((v ?? 'received') as ShipmentStatus)}
          disabled={isDelivered}
        />

        <TextInput
          label="Note (optional)"
          value={eventNote}
          onChange={(e) => setEventNote(e.currentTarget.value)}
          placeholder="e.g., Loaded onto container #12"
          disabled={isDelivered}
        />

        <Checkbox
          label="Log message using template for this status"
          checked={autoLog}
          onChange={(e) => setAutoLog(e.currentTarget.checked)}
          disabled={isDelivered}
        />

        <Button onClick={onSave} loading={saving} disabled={isDelivered}>
          Save update
        </Button>
      </Stack>
    </Paper>
  );
}
