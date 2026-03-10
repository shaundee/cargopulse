'use client';

import type { PlanTier } from '@/lib/billing/plan';


import {
  Badge,
  Box,
  Button,
  Grid,
  Group,
  Paper,
  Progress,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBrandWhatsapp,
  IconCamera,
  IconCheck,
  IconClipboardList,
  IconDownload,
  IconMessage,
  IconPackage,
  IconPlus,
  IconSend,
  IconTruck,
} from '@tabler/icons-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AttentionItem =
  | { type: 'stale'; id: string; trackingCode: string; status: string; destination: string; daysStale: number }
  | { type: 'no_pod'; id: string; trackingCode: string }
  | { type: 'no_message'; count: number };

type RecentShipment = {
  id: string;
  tracking_code: string;
  destination: string;
  current_status: string;
  last_event_at: string;
  customerName: string | null;
};

type DestCount = { destination: string; count: number };

export type OpsSummary = {
  pending_collection: number;
  in_transit: number;
  arrived_not_cleared: number;
  awaiting_delivery: number;
  overdue_collection: number;
};

interface DashboardProps {
  greeting: string;
  orgName: string;
  stats: { active30: number; inTransit: number; delivered30: number; messages30: number };
  billing: { tier: PlanTier; shipmentCount: number; shipmentLimit: number | null; isActive: boolean };
  attentionItems: AttentionItem[];
  recentShipments: RecentShipment[];
  byDestination: DestCount[];
  isAdmin: boolean;
  opsSummary: OpsSummary;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  received: 'Received',
  collected: 'Collected',
  loaded: 'Loaded',
  departed_uk: 'Departed UK',
  arrived_destination: 'Arrived',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  collected_by_customer: 'Collected',
};

const STATUS_COLOR: Record<string, string> = {
  received: 'gray',
  collected: 'gray',
  loaded: 'blue',
  departed_uk: 'violet',
  arrived_destination: 'teal',
  out_for_delivery: 'orange',
  delivered: 'green',
  collected_by_customer: 'green',
};

const STALE_STATUS_PHRASE: Record<string, (dest: string) => string> = {
  received: () => 'received',
  collected: () => 'collected',
  loaded: () => 'loaded onto vessel',
  departed_uk: () => 'departed UK',
  arrived_destination: (dest) => `arrived in ${dest}`,
  out_for_delivery: () => 'out for delivery',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(diff / 86400000);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: number; sub: string; color: string; icon: React.ReactNode;
}) {
  return (
    <Paper withBorder p="md" radius="md">
      <Group justify="space-between" align="flex-start" mb={6}>
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.05em' }}>
          {label}
        </Text>
        <ThemeIcon variant="light" color={color} size="md" radius="md">
          {icon}
        </ThemeIcon>
      </Group>
      <Text fw={800} size="xl" lh={1}>{value}</Text>
      <Text size="xs" c="dimmed" mt={4}>{sub}</Text>
    </Paper>
  );
}

function QuickAction({ icon, label, sub, href, color }: {
  icon: React.ReactNode; label: string; sub: string; href: string; color: string;
}) {
  return (
    <Paper
      component="a"
      href={href}
      withBorder
      p="sm"
      radius="md"
      style={{ display: 'block', textDecoration: 'none', transition: 'background 0.12s' }}
    >
      <Group gap="sm">
        <ThemeIcon variant="light" color={color} size="md" radius="md">{icon}</ThemeIcon>
        <Stack gap={0}>
          <Text size="sm" fw={600}>{label}</Text>
          <Text size="xs" c="dimmed">{sub}</Text>
        </Stack>
      </Group>
    </Paper>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const rowStyle = { borderBottom: '1px solid var(--mantine-color-default-border)' };

  if (item.type === 'stale') {
    const phraser = STALE_STATUS_PHRASE[item.status] ?? (() => item.status);
    return (
      <Group justify="space-between" wrap="nowrap" py="xs" style={rowStyle}>
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color="orange" size="sm" radius="xl" style={{ flexShrink: 0 }}>
            <IconPackage size={12} />
          </ThemeIcon>
          <Text size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Text span fw={600}>{item.trackingCode}</Text>{' '}
            {phraser(item.destination)} — update status?
          </Text>
        </Group>
        <Button
          size="xs" variant="light" color="orange"
          rightSection={<IconArrowRight size={12} />}
          component="a" href="/shipments"
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Update
        </Button>
      </Group>
    );
  }

  if (item.type === 'no_message') {
    return (
      <Group justify="space-between" wrap="nowrap" py="xs" style={rowStyle}>
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color="blue" size="sm" radius="xl" style={{ flexShrink: 0 }}>
            <IconMessage size={12} />
          </ThemeIcon>
          <Text size="sm">
            <Text span fw={600}>{item.count} customer{item.count !== 1 ? 's' : ''}</Text>{' '}
            haven't received an update in 5+ days
          </Text>
        </Group>
        <Button
          size="xs" variant="light" color="blue"
          rightSection={<IconArrowRight size={12} />}
          component="a" href="/shipments"
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Review
        </Button>
      </Group>
    );
  }

  if (item.type === 'no_pod') {
    return (
      <Group justify="space-between" wrap="nowrap" py="xs" style={rowStyle}>
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon variant="light" color="red" size="sm" radius="xl" style={{ flexShrink: 0 }}>
            <IconCamera size={12} />
          </ThemeIcon>
          <Text size="sm">
            <Text span fw={600}>{item.trackingCode}</Text> delivered but no POD captured
          </Text>
        </Group>
        <Button
          size="xs" variant="light" color="red"
          rightSection={<IconArrowRight size={12} />}
          component="a" href={`/pod/${item.id}`}
          style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
        >
          Add POD
        </Button>
      </Group>
    );
  }

  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardClient({
  greeting, orgName, stats, billing, attentionItems, recentShipments, byDestination, isAdmin, opsSummary,
}: DashboardProps) {
  const { tier, shipmentCount, shipmentLimit, isActive } = billing;
  const usagePct = shipmentLimit ? Math.min((shipmentCount / shipmentLimit) * 100, 100) : 0;
  const tierLabel =
    tier === 'free' ? 'FREE PLAN' :
    tier === 'flex' ? 'FLEX PLAN' :
    tier === 'starter' ? 'STARTER PLAN' :
    tier === 'pause' ? 'PAUSED' :
    'PRO PLAN';
  const maxDest = byDestination[0]?.count ?? 1;

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="sm">
        <Stack gap={2}>
          <Title order={2} fw={700}>{greeting}</Title>
          <Text size="sm" c="dimmed">Here's what's happening with {orgName} today</Text>
        </Stack>
        <Group gap="sm">
          <Button variant="default" leftSection={<IconClipboardList size={16} />} component="a" href="/field">
            Field intake
          </Button>
          <Button leftSection={<IconPlus size={16} />} component="a" href="/shipments">
            New shipment
          </Button>
        </Group>
      </Group>

      {/* Stat cards */}
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <StatCard label="Active Shipments" value={stats.active30} sub="this month" color="violet" icon={<IconPackage size={18} />} />
        <StatCard label="In Transit" value={stats.inTransit} sub="right now" color="blue" icon={<IconTruck size={18} />} />
        <StatCard label="Delivered" value={stats.delivered30} sub="this month" color="green" icon={<IconCheck size={18} />} />
        <StatCard label="Messages Sent" value={stats.messages30} sub="this month" color="teal" icon={<IconSend size={18} />} />
      </SimpleGrid>

      {/* Ops strip */}
      <ScrollArea type="scroll" scrollbarSize={4}>
        <Group gap="sm" wrap="nowrap" pb={4}>
          {[
            {
              label: 'Pending collection',
              value: opsSummary.pending_collection,
              color: 'blue',
              href: '/shipments?status=received&service_type=door_to_door',
              overdue: false,
            },
            {
              label: 'In transit',
              value: opsSummary.in_transit,
              color: 'indigo',
              href: '/shipments?status=departed_uk',
              overdue: false,
            },
            {
              label: 'Arrived, not cleared',
              value: opsSummary.arrived_not_cleared,
              color: 'cyan',
              href: '/shipments?status=arrived_destination',
              overdue: false,
            },
            {
              label: 'Awaiting delivery',
              value: opsSummary.awaiting_delivery,
              color: 'teal',
              href: '/shipments?status=awaiting_collection',
              overdue: false,
            },
            {
              label: 'Overdue collection',
              value: opsSummary.overdue_collection,
              color: 'red',
              href: '/shipments?status=received&overdue=1',
              overdue: true,
            },
          ].map(({ label, value, color, href, overdue }) => (
            <UnstyledButton
              key={label}
              component="a"
              href={href}
              style={{ textDecoration: 'none', flexShrink: 0 }}
            >
              <Paper
                withBorder
                p="md"
                radius="md"
                style={{
                  minWidth: 140,
                  background: overdue && value > 0
                    ? 'var(--mantine-color-red-0)'
                    : undefined,
                  borderColor: overdue && value > 0
                    ? 'var(--mantine-color-red-3)'
                    : undefined,
                  transition: 'background 0.12s',
                }}
              >
                <Group gap={6} mb={4}>
                  <Box
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: `var(--mantine-color-${color}-5)`,
                      flexShrink: 0,
                    }}
                  />
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.04em' }}>
                    {label}
                  </Text>
                </Group>
                <Text fw={800} size="xl" c={overdue && value > 0 ? 'red' : undefined} lh={1}>
                  {value}
                </Text>
              </Paper>
            </UnstyledButton>
          ))}
        </Group>
      </ScrollArea>

      {/* Usage meter — free and starter only */}
      {shipmentLimit !== null && (
        <Paper withBorder p="md" radius="md">
          <Group justify="space-between" wrap="nowrap" gap="md">
            <Group gap="md" style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {tierLabel} {shipmentCount}/{shipmentLimit}
              </Text>
              <Box style={{ flex: 1 }}>
                <Progress value={usagePct} color="violet" size="md" radius="xl" />
              </Box>
            </Group>
            <Button
              size="xs" variant="light" color="violet"
              component="a" href="/settings"
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              Upgrade plan
            </Button>
          </Group>
        </Paper>
      )}

      {/* Two-column layout */}
      <Grid gutter="md">
        {/* Left */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Stack gap="md">
            {/* Needs attention */}
            <Paper withBorder p="md" radius="md">
              <Group gap="xs" mb={attentionItems.length > 0 ? 'xs' : 0}>
                <ThemeIcon variant="light" color="orange" size="sm" radius="md">
                  <IconAlertTriangle size={14} />
                </ThemeIcon>
                <Text fw={700}>Needs your attention</Text>
                {attentionItems.length > 0 && (
                  <Badge color="red" variant="filled" size="sm" circle>
                    {attentionItems.length}
                  </Badge>
                )}
              </Group>
              {attentionItems.length === 0 ? (
                <Text size="sm" c="dimmed" pt="xs">All clear — nothing needs action right now.</Text>
              ) : (
                <Stack gap={0}>
                  {attentionItems.map((item, i) => (
                    <AttentionRow key={i} item={item} />
                  ))}
                </Stack>
              )}
            </Paper>

            {/* Recent shipments */}
            <Paper withBorder p="md" radius="md">
              <Group justify="space-between" mb="sm">
                <Text fw={700}>Recent shipments</Text>
                <Button
                  size="xs" variant="subtle"
                  rightSection={<IconArrowRight size={12} />}
                  component="a" href="/shipments"
                >
                  View all
                </Button>
              </Group>
              {recentShipments.length === 0 ? (
                <Text size="sm" c="dimmed">No shipments yet.</Text>
              ) : (
                <Stack gap={0}>
                  {recentShipments.map((s, i) => (
                    <Group
                      key={s.id}
                      justify="space-between"
                      wrap="nowrap"
                      py="sm"
                      style={i < recentShipments.length - 1
                        ? { borderBottom: '1px solid var(--mantine-color-default-border)' }
                        : undefined}
                    >
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap">
                          <Text size="sm" fw={700} ff="monospace">{s.tracking_code}</Text>
                          <Text size="xs" c="dimmed" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            → {s.destination}
                          </Text>
                        </Group>
                        {s.customerName && (
                          <Text size="xs" c="dimmed">{s.customerName}</Text>
                        )}
                      </Stack>
                      <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
                        <Badge color={STATUS_COLOR[s.current_status] ?? 'gray'} variant="light" size="sm">
                          {STATUS_LABEL[s.current_status] ?? s.current_status}
                        </Badge>
                        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                          {timeAgo(s.last_event_at)}
                        </Text>
                      </Group>
                    </Group>
                  ))}
                </Stack>
              )}
            </Paper>
          </Stack>
        </Grid.Col>

        {/* Right */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="md">
            {/* Quick actions */}
            <Paper withBorder p="md" radius="md">
              <Text fw={700} mb="sm">Quick actions</Text>
              <Stack gap="xs">
                <QuickAction icon={<IconPackage size={16} />} label="New shipment" sub="Book a collection" href="/shipments" color="violet" />
                <QuickAction icon={<IconClipboardList size={16} />} label="Field intake" sub="Offline collection form" href="/field" color="gray" />
                <QuickAction icon={<IconSend size={16} />} label="Send bulk update" sub="Notify multiple customers" href="/messages" color="blue" />
                <QuickAction icon={<IconDownload size={16} />} label="Export shipments" sub="Download CSV report" href="/shipments" color="gray" />
              </Stack>
            </Paper>

            {/* Shipments by destination */}
            {byDestination.length > 0 && (
              <Paper withBorder p="md" radius="md">
                <Text fw={700} mb="sm">Shipments by destination</Text>
                <Stack gap="sm">
                  {byDestination.map(({ destination, count }) => (
                    <Box key={destination}>
                      <Group justify="space-between" mb={4}>
                        <Text size="sm">{destination}</Text>
                        <Text size="sm" fw={600}>{count}</Text>
                      </Group>
                      <Progress value={(count / maxDest) * 100} color="violet" size="xs" radius="xl" />
                    </Box>
                  ))}
                </Stack>
              </Paper>
            )}

            {/* WhatsApp upgrade banner — free tier only */}
            {tier === 'free' && (
              <Paper
                p="lg"
                radius="md"
                style={{
                  background: 'linear-gradient(135deg, var(--mantine-color-violet-7) 0%, var(--mantine-color-indigo-6) 100%)',
                }}
              >
                <Stack gap="xs">
                  <Text fw={700} c="white" size="md">Unlock WhatsApp updates</Text>
                  <Text size="sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    Customers get instant status updates. No more "where's my shipment?" calls.
                  </Text>
                  <Button
                    mt={4}
                    variant="white"
                    color="violet"
                    leftSection={<IconBrandWhatsapp size={16} />}
                    component="a"
                    href="/settings"
                    fullWidth
                  >
                    Upgrade to Starter — £39/mo
                  </Button>
                </Stack>
              </Paper>
            )}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
