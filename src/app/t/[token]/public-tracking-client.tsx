'use client';

import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Image,
  Paper,
  Stack,
  Text,
  Timeline,
} from '@mantine/core';

type PublicEvent = { status: string; note?: string | null; occurred_at?: string | null };
const DTF = (() => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/London',
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
})();

function statusLabel(s: string) {
  switch (String(s)) {
    case 'received': return 'Received (UK depot)';
    case 'collected': return 'Collected (UK)';
    case 'loaded': return 'Loaded';
    case 'departed_uk': return 'Departed UK';
    case 'arrived_jamaica': return 'Arrived at destination';
    case 'collected_by_customer': return 'Collected by customer';
    case 'out_for_delivery': return 'Out for delivery';
    case 'delivered': return 'Delivered';
    default: return s.replaceAll('_', ' ');
  }
}

function formatWhen(v: unknown) {
  const d = v ? new Date(String(v)) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  if (DTF) return DTF.format(d);
  // Fallback (stable)
  return d.toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}


function waLink(phone: string) {
  // super lightweight normalization for wa.me (digits only; no +)
  const digits = phone.replace(/[^\d]/g, '');
  return digits ? `https://wa.me/${digits}` : null;
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

const [shareUrl, setShareUrl] = useState('');

useEffect(() => {
  setShareUrl(window.location.href);
}, []);


  const [copied, setCopied] = useState(false);

  const activeIndex = Math.max(0, (data.events?.length ?? 0) - 1);

  const supportPhone = String(s?.org?.support_phone ?? '').trim();
const supportWa = supportPhone ? waLink(supportPhone) : null;

  async function copyLink() {
    try {
      if (!shareUrl) return;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <Container size={720} py="xl">
      <Paper withBorder p="lg" radius="md">
        <Stack gap="md">
          <Stack gap={4}>
            <Text c="dimmed" size="sm">
              {s?.org?.name ? `${s.org.name} • Tracking` : 'Tracking'}
            </Text>

            <Group justify="space-between" align="flex-start">
              <Stack gap={2}>
                <Text fw={900} size="xl">
                  {s?.tracking_code ?? '—'}
                </Text>

                <Text c="dimmed" size="sm">
                  {s?.customer?.name ? `Customer: ${s.customer.name} • ` : ''}
                  Destination: {s?.destination ?? '—'}
                  {s?.service_type ? ` • Service: ${s.service_type}` : ''}
                </Text>

                <Text c="dimmed" size="sm">
                  Last updated: {formatWhen(s?.last_event_at)}
                </Text>
              </Stack>

              <Badge variant="light" size="lg">
                {statusLabel(s?.current_status)}
              </Badge>
            </Group>

            <Group gap="xs" mt="xs">
              <Button size="xs" variant="light" onClick={copyLink} disabled={!shareUrl}>
                {copied ? 'Copied' : 'Copy link'}
              </Button>

              {supportPhone ? (
                <Button
                  size="xs"
                  variant="light"
                  component="a"
                  href={supportWa ?? `tel:${supportPhone}`}
                  target={supportWa ? '_blank' : undefined}
                >
                  Contact support
                </Button>
              ) : null}
            </Group>
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text fw={700}>Timeline</Text>

            {data.events?.length ? (
              <Timeline bulletSize={18} lineWidth={2} active={activeIndex}>
                {data.events.map((e, idx) => (
                  <Timeline.Item key={idx} title={statusLabel(e.status)}>
                    <Text size="sm" c="dimmed">
                      {formatWhen(e.occurred_at)}
                    </Text>
                    {e.note ? <Text size="sm">{e.note}</Text> : null}
                  </Timeline.Item>
                ))}
              </Timeline>
            ) : (
              <Text size="sm" c="dimmed">
                No updates yet.
              </Text>
            )}
          </Stack>

          <Divider />

          <Stack gap="xs">
            <Text fw={700}>Proof of delivery</Text>

            {data.pod ? (
              <>
                <Text size="sm" c="dimmed">
                  Receiver: {data.pod.receiver_name ?? '—'} • Delivered: {formatWhen(data.pod.delivered_at)}
                </Text>

                {data.pod.signed_url ? (
                  <Image src={data.pod.signed_url} alt="Proof of delivery" radius="md" />
                ) : (
                  <Text size="sm" c="dimmed">
                    Photo not available.
                  </Text>
                )}
              </>
            ) : (
              <Text size="sm" c="dimmed">
                Not delivered yet.
              </Text>
            )}
          </Stack>
        </Stack>
      </Paper>
    </Container>
  );
}
