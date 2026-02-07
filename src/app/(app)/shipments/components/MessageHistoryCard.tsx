'use client';

import { Badge, Group, Paper, Stack, Text } from '@mantine/core';
import type { MessageLogRow, ShipmentStatus } from '../shipment-types';
import { formatWhen, statusLabel } from '../shipment-types';

export function MessageHistoryCard({
  detailLogs,
  detailLogsLoading,
}: {
  detailLogs: MessageLogRow[];
  detailLogsLoading: boolean;
}) {
  return (
    <Paper withBorder p="sm" radius="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>Message history</Text>
        <Text size="sm" c="dimmed">
          Last 20
        </Text>
      </Group>

      {detailLogsLoading ? (
        <Text size="sm" c="dimmed">
          Loading…
        </Text>
      ) : detailLogs.length === 0 ? (
        <Text size="sm" c="dimmed">
          No messages logged yet
        </Text>
      ) : (
        <Stack gap="xs">
          {detailLogs.map((log) => (
            <Paper key={log.id} withBorder p="sm" radius="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Badge variant="light">{String(log.send_status ?? 'unknown')}</Badge>
                    <Badge variant="light" color="gray">
                      {String(log.provider ?? 'provider')}
                    </Badge>
                    {log.status ? (
                      <Badge variant="light" color="blue">
                        {statusLabel(log.status as ShipmentStatus)}
                      </Badge>
                    ) : null}
                  </Group>

                  <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                    {String(log.body ?? '')}
                  </Text>

                  {log.error ? (
                    <Text size="sm" c="red">
                      {String(log.error)}
                    </Text>
                  ) : null}

                  <Text size="xs" c="dimmed">
                    To: {String(log.to_phone ?? '-')}
                  </Text>
                </Stack>

                <Text size="sm" c="dimmed">
                  {formatWhen(log.created_at)}
                </Text>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
    </Paper>
  );
}
