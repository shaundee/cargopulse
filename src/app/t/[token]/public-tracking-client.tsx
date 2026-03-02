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
  ThemeIcon,
} from '@mantine/core';
import {
  IconCheck,
  IconCircleDashed,
  IconCopy,
  IconPackage,
  IconPhone,
  IconBrandWhatsapp,
  IconTruck,
  IconMapPin,
  IconClipboardCheck,
} from '@tabler/icons-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type PublicEvent = { status: string; note?: string | null; occurred_at?: string | null };

type Props = {
  data: {
    shipment: any;
    events: PublicEvent[];
    pod: null | {
      receiver_name?: string | null;
      delivered_at?: string | null;
      signed_url?: string | null;
    };
  };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_ORDER = [
  'received',
  'collected',
  'loaded',
  'departed_uk',
  'arrived_destination',
  'collected_by_customer',
  'out_for_delivery',
  'delivered',
] as const;

function statusLabel(s: string, destination?: string | null) {
  switch (s) {
    case 'received': return 'Received at UK depot';
    case 'collected': return 'Collected';
    case 'loaded': return 'Loaded';
    case 'departed_uk': return 'Departed UK';
    case 'arrived_destination': return destination ? `Arrived — ${destination}` : 'Arrived at destination';
    case 'collected_by_customer': return 'Collected by customer';
    case 'out_for_delivery': return 'Out for delivery';
    case 'delivered': return 'Delivered';
    default: return s.replace(/_/g, ' ');
  }
}

function statusIcon(s: string) {
  switch (s) {
    case 'received':
    case 'collected': return <IconPackage size={16} />;
    case 'loaded':
    case 'departed_uk': return <IconTruck size={16} />;
    case 'arrived_destination':
    case 'collected_by_customer':
    case 'out_for_delivery': return <IconMapPin size={16} />;
    case 'delivered': return <IconClipboardCheck size={16} />;
    default: return <IconCircleDashed size={16} />;
  }
}

function statusColor(s: string) {
  switch (s) {
    case 'delivered': return 'green';
    case 'out_for_delivery':
    case 'collected_by_customer': return 'teal';
    case 'arrived_destination': return 'cyan';
    case 'departed_uk': return 'blue';
    case 'loaded': return 'indigo';
    case 'collected': return 'grape';
    default: return 'gray';
  }
}

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
  } catch { return null; }
})();

function formatWhen(v: unknown) {
  const d = v ? new Date(String(v)) : null;
  if (!d || isNaN(d.getTime())) return '—';
  return DTF ? DTF.format(d) : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function digitsOnly(s: string) { return s.replace(/\D/g, ''); }

// ─── Component ───────────────────────────────────────────────────────────────

export function PublicTrackingClient({ data }: Props) {
  const s = data.shipment;
  const destination = String(s?.destination ?? '').trim();
  const orgName = String(s?.org?.name ?? '').trim();
  const supportPhone = String(s?.org?.support_phone ?? '').trim();
  const supportWaHref = supportPhone ? `https://wa.me/${digitsOnly(supportPhone)}` : '';

  const events = (data.events ?? [])
    .slice()
    .sort((a, b) => new Date(a.occurred_at ?? 0).getTime() - new Date(b.occurred_at ?? 0).getTime());

  const latest = events[events.length - 1] ?? null;
  const currentStatus = String(latest?.status ?? s?.current_status ?? '').trim();
  const lastUpdatedAt = latest?.occurred_at ?? s?.last_event_at ?? null;
  const isDelivered = currentStatus === 'delivered';

  // Progress: how far along the standard journey
  const currentIdx = STATUS_ORDER.indexOf(currentStatus as any);
  const progressPct = currentIdx >= 0 ? Math.round(((currentIdx + 1) / STATUS_ORDER.length) * 100) : 0;

  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { setShareUrl(window.location.href); }, []);

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--mantine-color-gray-0)' }}>
      <Container size={520} py="lg" px="sm">
        <Stack gap="md">

          {/* ── Header ── */}
          <Paper withBorder radius="md" p="md">
            <Stack gap="xs">
              {/* Org name */}
              <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 1 }}>
                {orgName || 'Shipment tracking'}
              </Text>

              {/* Tracking code + status */}
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={2}>
                  <Text fw={900} size="xl" ff="monospace">
                    {s?.tracking_code ?? '—'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {destination || '—'}
                    {s?.service_type === 'door_to_door' ? ' · Door to door' : s?.service_type === 'depot' ? ' · Depot' : ''}
                  </Text>
                </Stack>

                <Badge
                  color={statusColor(currentStatus)}
                  variant="filled"
                  size="lg"
                  style={{ flexShrink: 0 }}
                  leftSection={statusIcon(currentStatus)}
                >
                  {statusLabel(currentStatus, destination)}
                </Badge>
              </Group>

              {/* Progress bar */}
              <div style={{
                height: 6,
                background: 'var(--mantine-color-gray-2)',
                borderRadius: 99,
                overflow: 'hidden',
                marginTop: 4,
              }}>
                <div style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: isDelivered
                    ? 'var(--mantine-color-green-6)'
                    : 'var(--mantine-color-blue-6)',
                  borderRadius: 99,
                  transition: 'width 0.6s ease',
                }} />
              </div>

              <Text size="xs" c="dimmed">
                Last updated: {formatWhen(lastUpdatedAt)}
              </Text>
            </Stack>
          </Paper>

          {/* ── Actions ── */}
          <Group gap="xs">
            <Button
              size="sm"
              variant="light"
              leftSection={copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
              onClick={copyLink}
              disabled={!shareUrl}
              style={{ flex: 1 }}
            >
              {copied ? 'Copied!' : 'Copy tracking link'}
            </Button>

            {supportWaHref && (
              <Button
                size="sm"
                variant="light"
                color="green"
                leftSection={<IconBrandWhatsapp size={15} />}
                component="a"
                href={supportWaHref}
                target="_blank"
                rel="noreferrer"
                style={{ flex: 1 }}
              >
                WhatsApp us
              </Button>
            )}

            {supportPhone && !supportWaHref && (
              <Button
                size="sm"
                variant="light"
                leftSection={<IconPhone size={15} />}
                component="a"
                href={`tel:${supportPhone}`}
                style={{ flex: 1 }}
              >
                Call us
              </Button>
            )}
          </Group>

          {/* ── Timeline ── */}
          <Paper withBorder radius="md" p="md">
            <Text fw={700} mb="sm">Journey updates</Text>

            {events.length === 0 ? (
              <Text size="sm" c="dimmed">No updates yet — check back soon.</Text>
            ) : (
              <Stack gap={0}>
                {events.map((ev, i) => {
                  const isLatest = i === events.length - 1;
                  const isLast = i === events.length - 1;
                  return (
                    <div key={i} style={{ display: 'flex', gap: 12 }}>
                      {/* Track */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28, flexShrink: 0 }}>
                        <ThemeIcon
                          size={28}
                          radius="xl"
                          color={isLatest ? statusColor(ev.status) : 'gray'}
                          variant={isLatest ? 'filled' : 'light'}
                        >
                          {statusIcon(ev.status)}
                        </ThemeIcon>
                        {!isLast && (
                          <div style={{
                            width: 2,
                            flex: 1,
                            minHeight: 16,
                            background: 'var(--mantine-color-gray-3)',
                          }} />
                        )}
                      </div>

                      {/* Content */}
                      <Stack gap={1} pb={isLast ? 0 : 'sm'} style={{ flex: 1 }}>
                        <Text fw={isLatest ? 700 : 500} size="sm">
                          {statusLabel(ev.status, destination)}
                        </Text>
                        <Text size="xs" c="dimmed">{formatWhen(ev.occurred_at)}</Text>
                        {ev.note && <Text size="sm" c="dimmed">{ev.note}</Text>}
                      </Stack>
                    </div>
                  );
                })}
              </Stack>
            )}
          </Paper>

          {/* ── POD ── */}
          {data.pod && (
            <Paper withBorder radius="md" p="md">
              <Text fw={700} mb="xs">Proof of delivery</Text>
              <Text size="sm" c="dimmed" mb="sm">
                Received by: <b>{data.pod.receiver_name || '—'}</b>
                {data.pod.delivered_at ? ` · ${formatWhen(data.pod.delivered_at)}` : ''}
              </Text>
              {data.pod.signed_url ? (
                <Image src={data.pod.signed_url} alt="Proof of delivery" radius="md" />
              ) : (
                <Text size="sm" c="dimmed">Photo not available.</Text>
              )}
            </Paper>
          )}

          {/* ── Footer ── */}
          <Divider />
          <Text size="xs" c="dimmed" ta="center">
            {orgName ? `Powered by ${orgName}` : 'Cargo44'}
            {' · '}Tracking is updated by your freight forwarder.
          </Text>

        </Stack>
      </Container>
    </div>
  );
}