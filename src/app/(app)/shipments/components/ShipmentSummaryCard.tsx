'use client';

import { Badge, Group, Paper, Stack, Text, Button, CopyButton } from '@mantine/core';
import type { ShipmentDetail, ShipmentStatus } from '../shipment-types';
import { statusBadgeColor, statusLabel } from '../shipment-types'
import { IconCheck, IconCopy } from '@tabler/icons-react';

export function ShipmentSummaryCard({ detailShipment }: { detailShipment: ShipmentDetail }) {
    const token = (detailShipment as any).public_tracking_token as string | undefined;
  const link = token ? `${window.location.origin}/t/${token}` : '';

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
                  <CopyButton value={link} timeout={2000}>
          {({ copied, copy }) => (
            <Button
              size="xs"
              variant="light"
              onClick={copy}
              disabled={!link}
              leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            >
              {copied ? 'Copied' : 'Copy customer link'}
            </Button>
          )}
        </CopyButton>
        
        <Button
  size="xs"
  variant="light"
  onClick={() => window.open(`/shipments/print/${detailShipment.id}`, '_blank')}
  leftSection={<span style={{ fontSize: 12 }}>🖨️</span>}
>
  Print
</Button>


          <Badge color={statusBadgeColor(detailShipment.current_status as ShipmentStatus)} variant="light">
            {statusLabel(detailShipment.current_status as ShipmentStatus)}
          </Badge>
        </Group>
      </Stack>
    </Paper>
  );
}
