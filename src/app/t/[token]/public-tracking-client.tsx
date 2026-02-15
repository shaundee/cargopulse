'use client';

import { Badge, Container, Divider, Group, Image, Paper, Stack, Text, Timeline } from '@mantine/core';

type PublicEvent = { status: string; note?: string | null; occurred_at?: string | null };

function statusLabel(s: string) {
  switch (String(s)) {
    case 'received': return 'Received';
    case 'collected': return 'Collected';
    case 'loaded': return 'Loaded';
    case 'departed_uk': return 'Departed UK';
    case 'arrived_jamaica': return 'Arrived at destination';
    case 'out_for_delivery': return 'Out for delivery';
    case 'delivered': return 'Delivered';
    default: return s;
  }
}

function formatWhen(v: unknown) {
  const d = v ? new Date(String(v)) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '-';
}

export function PublicTrackingClient({
  data,
}: {
  data: {
    shipment: any;
    events: PublicEvent[];
    pod: null | { receiver_name?: string | null; delivered_at?: string | null; signed_url?: string | null };
  };
}) {
  const s = data.shipment;

  return (
    <Container size={720} py="xl">
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={2}>
              <Text fw={800} size="xl">Tracking: {s.tracking_code}</Text>
              <Text c="dimmed" size="sm">Destination: {s.destination} • Service: {s.service_type}</Text>
              <Text c="dimmed" size="sm">Last updated: {formatWhen(s.last_event_at)}</Text>
            </Stack>
            <Badge variant="light" size="lg">{statusLabel(s.current_status)}</Badge>
          </Group>

          <Divider />

          <Stack gap="xs">
            <Text fw={700}>Timeline</Text>
            <Timeline bulletSize={18} lineWidth={2}>
              {data.events.map((e, idx) => (
                <Timeline.Item key={idx} title={statusLabel(e.status)}>
                  <Text size="sm" c="dimmed">{formatWhen(e.occurred_at)}</Text>
                  {e.note ? <Text size="sm">{e.note}</Text> : null}
                </Timeline.Item>
              ))}
            </Timeline>
          </Stack>

          {data.pod ? (
            <>
              <Divider />
              <Stack gap="xs">
                <Text fw={700}>Proof of delivery</Text>
                <Text size="sm" c="dimmed">
                  Receiver: {data.pod.receiver_name ?? '—'} • Delivered: {formatWhen(data.pod.delivered_at)}
                </Text>
                {data.pod.signed_url ? (
                  <Image src={data.pod.signed_url} alt="Proof of delivery" radius="md" />
                ) : (
                  <Text size="sm" c="dimmed">Photo not available.</Text>
                )}
              </Stack>
            </>
          ) : null}

          {s.org?.support_phone ? (
            <>
              <Divider />
              <Text size="sm" c="dimmed">
                Need help? Contact: {s.org.support_phone}
              </Text>
            </>
          ) : null}
        </Stack>
      </Paper>
    </Container>
  );
}
