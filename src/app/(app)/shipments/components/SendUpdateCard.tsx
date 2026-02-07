'use client';

import { Button, Paper, Select, Stack, Text } from '@mantine/core';
import type { TemplateRow, ShipmentStatus } from '../shipment-types';
import { statusLabel } from '../shipment-types';

export function SendUpdateCard({
  templates,
  sendTemplateId,
  setSendTemplateId,
  onSend,
  sending,
  currentStatus,
}: {
  templates: TemplateRow[];
  sendTemplateId: string | null;
  setSendTemplateId: (v: string | null) => void;
  onSend: () => void;
  sending: boolean;
  currentStatus: ShipmentStatus;
}) {
  const isDelivered = currentStatus === 'delivered';

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Text fw={700}>Send update</Text>

        {isDelivered ? (
          <Text size="sm" c="dimmed">
            Delivered — updates are locked.
          </Text>
        ) : null}

        <Select
          label="Template"
          data={templates
            .filter((t) => t.enabled)
            // optional: hide delivered template once delivered to prevent duplicates
            .filter((t) => (isDelivered ? t.status !== 'delivered' : true))
            .map((t) => ({ value: t.id, label: statusLabel(t.status) }))}
          value={sendTemplateId}
          onChange={(v) => setSendTemplateId(v)}
          placeholder="Choose a template"
          disabled={isDelivered}
        />

        <Button onClick={onSend} loading={sending} disabled={!sendTemplateId || isDelivered}>
          Send (log)
        </Button>

        <Text size="sm" c="dimmed">
          This logs the rendered message in message_logs. WhatsApp sending comes next.
        </Text>
      </Stack>
    </Paper>
  );
}
