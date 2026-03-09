'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Badge,
  Box,
  Button,
  CopyButton,
  Drawer,
  Group,
  Stack,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconPhone,
  IconPlus,
  IconSearch,
  IconX,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { CreateShipmentDrawer } from '@/app/(app)/shipments/components/CreateShipmentDrawer';
import { countryFlag, getCountryCode } from '@/lib/countries';
import {
  type ShipmentStatus,
  statusBadgeColor,
  statusLabel,
  formatWhen,
} from '@/app/(app)/shipments/shipment-types';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CustomerShipment = {
  id: string;
  tracking_code: string;
  destination: string;
  current_status: ShipmentStatus;
  service_type: string | null;
  last_event_at: string;
};

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  shipments: CustomerShipment[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert ALL-CAPS names to Title Case; mixed-case names are left unchanged. */
function toTitleCase(str: string): string {
  if (str !== str.toUpperCase()) return str;
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function getInitials(name: string): string {
  const words = toTitleCase(name).split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0][0] ?? '?').toUpperCase();
  return ((words[0][0] ?? '') + (words[words.length - 1][0] ?? '')).toUpperCase();
}

const AVATAR_COLORS = ['blue', 'violet', 'teal', 'orange', 'pink', 'indigo', 'cyan', 'grape'];

function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const ACTIVE_STATUSES: Set<ShipmentStatus> = new Set([
  'received', 'collected', 'loaded', 'departed_uk',
  'arrived_destination', 'customs_processing', 'customs_cleared',
  'awaiting_collection', 'out_for_delivery',
]);

function uniqueDestinations(shipments: CustomerShipment[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of shipments) {
    if (!seen.has(s.destination)) {
      seen.add(s.destination);
      result.push(s.destination);
    }
  }
  return result;
}

// ── Destination flag chips ────────────────────────────────────────────────────

function DestFlags({ destinations }: { destinations: string[] }) {
  return (
    <Group gap={3} wrap="nowrap">
      {destinations.slice(0, 5).map(d => {
        const flag = countryFlag(getCountryCode(d));
        return (
          <Tooltip key={d} label={d} withArrow fz="xs">
            <Text component="span" style={{ fontSize: 13, lineHeight: 1, cursor: 'default' }}>
              {flag || d.slice(0, 2).toUpperCase()}
            </Text>
          </Tooltip>
        );
      })}
      {destinations.length > 5 && (
        <Text size="xs" c="dimmed">+{destinations.length - 5}</Text>
      )}
    </Group>
  );
}

// ── Customer card ─────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  selected,
  onClick,
}: {
  customer: CustomerRow;
  selected: boolean;
  onClick: () => void;
}) {
  const displayName = toTitleCase(customer.name);
  const initials = getInitials(customer.name);
  const color = avatarColor(customer.id);
  const activeCount = customer.shipments.filter(s => ACTIVE_STATUSES.has(s.current_status)).length;
  const dests = uniqueDestinations(customer.shipments);

  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '12px 16px',
        border: `1px solid ${selected ? 'var(--mantine-color-blue-4)' : 'var(--mantine-color-gray-2)'}`,
        borderRadius: 10,
        background: selected ? 'var(--mantine-color-blue-0)' : 'var(--mantine-color-white)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="center" gap="sm">
        {/* Left: avatar + name/phone */}
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
          <Avatar color={color} radius="xl" size={44} style={{ flexShrink: 0 }}>
            {initials}
          </Avatar>
          <Stack gap={3} style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap" align="center">
              <Text
                fw={600}
                size="sm"
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {displayName}
              </Text>
              <DestFlags destinations={dests} />
            </Group>
            <Text size="xs" c="dimmed" ff="monospace" style={{ whiteSpace: 'nowrap' }}>
              {customer.phone}
            </Text>
          </Stack>
        </Group>

        {/* Right: count + active badge */}
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          <Stack gap={0} align="flex-end">
            <Text fw={700} size="lg" lh={1}>{customer.shipments.length}</Text>
            <Text size="xs" c="dimmed" lh={1.4}>
              shipment{customer.shipments.length !== 1 ? 's' : ''}
            </Text>
          </Stack>
          {activeCount > 0 && (
            <Badge variant="light" color="blue" size="sm" style={{ flexShrink: 0 }}>
              {activeCount} active
            </Badge>
          )}
        </Group>
      </Group>
    </UnstyledButton>
  );
}

// ── Shipment history card ─────────────────────────────────────────────────────

function ShipmentHistoryCard({ shipment }: { shipment: CustomerShipment }) {
  const flag = countryFlag(getCountryCode(shipment.destination));
  const svcLabel = shipment.service_type === 'door_to_door' ? 'Door to Door' : 'Depot';

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-gray-2)',
        borderRadius: 8,
        padding: '10px 12px',
      }}
    >
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={4} style={{ minWidth: 0 }}>
          <Text size="sm" fw={700} ff="monospace">{shipment.tracking_code}</Text>
          <Group gap={4} wrap="nowrap">
            <Text size="xs">{flag}</Text>
            <Text size="xs" c="dimmed">{shipment.destination}</Text>
            <Text size="xs" c="dimmed">·</Text>
            <Text size="xs" c="dimmed">{svcLabel}</Text>
          </Group>
        </Stack>
        <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
          <Badge
            variant="light"
            color={statusBadgeColor(shipment.current_status)}
            size="xs"
          >
            {statusLabel(shipment.current_status)}
          </Badge>
          <Text size="xs" c="dimmed">{formatWhen(shipment.last_event_at)}</Text>
        </Stack>
      </Group>
    </Box>
  );
}

// ── Customer detail drawer ────────────────────────────────────────────────────

function CustomerDetail({
  customer,
  onClose,
  onNewShipment,
}: {
  customer: CustomerRow;
  onClose: () => void;
  onNewShipment: (name: string, phone: string) => void;
}) {
  const displayName = toTitleCase(customer.name);
  const firstName = displayName.split(' ')[0];
  const initials = getInitials(customer.name);
  const color = avatarColor(customer.id);

  const activeCount = customer.shipments.filter(s => ACTIVE_STATUSES.has(s.current_status)).length;
  const deliveredCount = customer.shipments.filter(
    s => s.current_status === 'delivered' || s.current_status === 'collected_by_customer',
  ).length;
  const dests = uniqueDestinations(customer.shipments);
  const whatsappNumber = customer.phone.replace(/\D/g, '');
  const sinceDate = new Date(customer.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  const sortedShipments = [...customer.shipments].sort((a, b) => {
    const aAct = ACTIVE_STATUSES.has(a.current_status) ? 1 : 0;
    const bAct = ACTIVE_STATUSES.has(b.current_status) ? 1 : 0;
    if (bAct !== aAct) return bAct - aAct;
    return new Date(b.last_event_at).getTime() - new Date(a.last_event_at).getTime();
  });

  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size="md"
      title={
        <Group gap="sm" wrap="nowrap">
          <Avatar color={color} radius="xl" size={36} style={{ flexShrink: 0 }}>
            {initials}
          </Avatar>
          <Stack gap={1} style={{ minWidth: 0 }}>
            <Text fw={700} size="sm" lh={1.2} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayName}
            </Text>
            <Text size="xs" c="dimmed" ff="monospace">{customer.phone}</Text>
          </Stack>
        </Group>
      }
    >
      <Stack gap="lg">
        {/* Quick actions */}
        <Group gap="sm" wrap="wrap">
          <Button
            component="a"
            href={`https://wa.me/${whatsappNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            variant="light"
            color="green"
            leftSection={<IconBrandWhatsapp size={14} />}
          >
            WhatsApp
          </Button>
          <Button
            component="a"
            href={`tel:${customer.phone}`}
            size="xs"
            variant="light"
            color="blue"
            leftSection={<IconPhone size={14} />}
          >
            Call
          </Button>
          <CopyButton value={customer.phone}>
            {({ copied, copy }) => (
              <Button
                size="xs"
                variant="light"
                color={copied ? 'green' : 'gray'}
                leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                onClick={copy}
              >
                {copied ? 'Copied!' : 'Copy phone'}
              </Button>
            )}
          </CopyButton>
        </Group>

        {/* Stats */}
        <Box
          style={{
            border: '1px solid var(--mantine-color-gray-2)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <Group gap={0} grow>
            <Stack gap={2} align="center" py="sm">
              <Text fw={700} size="xl">{customer.shipments.length}</Text>
              <Text size="xs" c="dimmed">Total</Text>
            </Stack>
            <Box style={{ borderLeft: '1px solid var(--mantine-color-gray-2)', borderRight: '1px solid var(--mantine-color-gray-2)' }}>
              <Stack gap={2} align="center" py="sm">
                <Text fw={700} size="xl" c="blue">{activeCount}</Text>
                <Text size="xs" c="dimmed">Active</Text>
              </Stack>
            </Box>
            <Stack gap={2} align="center" py="sm">
              <Text fw={700} size="xl" c="green">{deliveredCount}</Text>
              <Text size="xs" c="dimmed">Delivered</Text>
            </Stack>
          </Group>
        </Box>

        {/* Ships to */}
        {dests.length > 0 && (
          <Stack gap="xs">
            <Text size="xs" fw={600} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Ships to
            </Text>
            <Group gap="xs" wrap="wrap">
              {dests.map(d => {
                const flag = countryFlag(getCountryCode(d));
                return (
                  <Badge key={d} variant="light" color="gray" size="sm">
                    {flag} {d}
                  </Badge>
                );
              })}
            </Group>
          </Stack>
        )}

        {/* New shipment */}
        <Button
          leftSection={<IconPlus size={14} />}
          onClick={() => onNewShipment(customer.name, customer.phone)}
        >
          New shipment for {firstName}
        </Button>

        {/* Shipment history */}
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Shipment history ({customer.shipments.length})
          </Text>
          {sortedShipments.length === 0 ? (
            <Text size="sm" c="dimmed">No shipments yet</Text>
          ) : (
            <Stack gap="xs">
              {sortedShipments.map(s => (
                <ShipmentHistoryCard key={s.id} shipment={s} />
              ))}
            </Stack>
          )}
        </Stack>

        {/* Customer since */}
        <Text size="xs" c="dimmed" ta="center">
          Customer since {sinceDate}
        </Text>
      </Stack>
    </Drawer>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function CustomersClient({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [prefill, setPrefill] = useState({ name: '', phone: '' });

  // Derive selected from customers prop so it auto-updates after router.refresh()
  const selected = customers.find(c => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      c => toTitleCase(c.name).toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')),
    );
  }, [customers, search]);

  function handleNewShipment(name: string, phone: string) {
    setPrefill({ name, phone });
    setCreateOpen(true);
  }

  return (
    <>
      {selected && (
        <CustomerDetail
          customer={selected}
          onClose={() => setSelectedId(null)}
          onNewShipment={handleNewShipment}
        />
      )}

      <CreateShipmentDrawer
        opened={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); router.refresh(); }}
        initialName={prefill.name}
        initialPhone={prefill.phone}
      />

      <Stack gap="lg">
        {/* Header */}
        <Stack gap={4}>
          <Text fw={700} size="xl">Customers</Text>
          <Text c="dimmed" size="sm">
            {customers.length} customer{customers.length !== 1 ? 's' : ''} · added automatically from shipments
          </Text>
        </Stack>

        {/* Search */}
        <TextInput
          placeholder="Search by name or phone..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          rightSection={
            search ? (
              <UnstyledButton
                onClick={() => setSearch('')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <IconX size={14} color="var(--mantine-color-dimmed)" />
              </UnstyledButton>
            ) : null
          }
        />

        {/* Customer cards */}
        {filtered.length === 0 ? (
          <Text c="dimmed" size="sm">No customers match "{search}"</Text>
        ) : (
          <Stack gap="sm">
            {filtered.map(c => (
              <CustomerCard
                key={c.id}
                customer={c}
                selected={selectedId === c.id}
                onClick={() => setSelectedId(id => id === c.id ? null : c.id)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}
