'use client';

import { useEffect, useState } from 'react';
import { Badge, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp, IconCheck, IconCopy, IconExternalLink, IconPrinter } from '@tabler/icons-react';
import type { ShipmentDetail, ShipmentStatus } from '../shipment-types';
import { statusBadgeColor, statusLabel } from '../shipment-types';

export function ShipmentSummaryCard({
  detailShipment,
  onReloadRequested,
}: {
  detailShipment: ShipmentDetail;
  onReloadRequested?: () => void;
}) {
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);

  // Safe: only run client-side
  useEffect(() => { setOrigin(window.location.origin); }, []);

  const token = detailShipment.public_tracking_token;
  const trackingLink = token && origin ? `${origin}/t/${token}` : '';

  function copyLink() {
    if (!trackingLink) return;
    navigator.clipboard.writeText(trackingLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function sendTrackingLink() {
    setSending(true);
    try {
      const res = await fetch('/api/messages/misc/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId: detailShipment.id, key: 'tracking_link' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Send failed');

      notifications.show({
        title: 'Tracking link sent',
        message: json?.mode === 'logged_only' ? 'Logged (WhatsApp not configured)' : 'Sent via WhatsApp',
        color: 'green',
      });
      onReloadRequested?.();
    } catch (e: any) {
      notifications.show({ title: 'Send failed', message: e?.message ?? 'Failed', color: 'red' });
    } finally {
      setSending(false);
    }
  }

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap={6}>
        {/* Customer + status row */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={700} size="sm">
              {detailShipment.customers?.name ?? '—'}
            </Text>
            <Text size="sm" c="dimmed">
              {detailShipment.customers?.phone ?? '—'}
            </Text>
          </Stack>
          <Badge
            color={statusBadgeColor(detailShipment.current_status as ShipmentStatus)}
            variant="light"
            size="md"
            style={{ flexShrink: 0 }}
          >
            {statusLabel(detailShipment.current_status as ShipmentStatus, detailShipment.destination)}
          </Badge>
        </Group>

        <Text size="xs" c="dimmed">
          {detailShipment.destination}
          {detailShipment.service_type ? ` · ${detailShipment.service_type}` : ''}
          {` · ${detailShipment.tracking_code}`}
        </Text>

        {/* Action row */}
        <Group gap="xs" mt={2}>
          {/* Primary: send tracking link via WhatsApp */}
          <Button
            size="xs"
            variant="filled"
            leftSection={<IconBrandWhatsapp size={14} />}
            onClick={sendTrackingLink}
            loading={sending}
            disabled={!trackingLink}
          >
            Send tracking link
          </Button>

          {/* Secondary: copy link */}
          <Button
            size="xs"
            variant="light"
            leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
            onClick={copyLink}
            disabled={!trackingLink}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>

          {/* Open tracking page */}
          {trackingLink && (
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconExternalLink size={14} />}
              component="a"
              href={trackingLink}
              target="_blank"
              rel="noreferrer"
            >
              Preview
            </Button>
          )}

          {/* Print */}
          <Button
            size="xs"
            variant="subtle"
            leftSection={<IconPrinter size={14} />}
            onClick={() => window.open(`/shipments/print/${detailShipment.id}`, '_blank')}
          >
            Print
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}