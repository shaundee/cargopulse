'use client';

import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import type { ShipmentDetail, ShipmentStatus } from '../shipment-types';
import { statusBadgeColor, statusLabel } from '../shipment-types'

export function ShipmentSummaryCard({ detailShipment }: { detailShipment: ShipmentDetail }) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap={4}>
        <Text fw={700}>
          {detailShipment.customers?.name ?? '—'} • {detailShipment.customers?.phone ?? '—'}
        </Text>
        <Text size="sm" c="dimmed">
          Destination: {detailShipment.destination}
        </Text>
        <Text size="sm" c="dimmed">
          Service: {detailShipment.service_type ?? detailShipment.serviceType ?? '-'}
        </Text>
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            Status:
          </Text>
          <Badge color={statusBadgeColor(detailShipment.current_status as ShipmentStatus)} variant="light">
            {statusLabel(detailShipment.current_status as ShipmentStatus)}
          </Badge>
        </Group>
      </Stack>
    </Paper>
  );
}
