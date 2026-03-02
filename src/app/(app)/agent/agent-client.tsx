'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Image,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCamera,
  IconCheck,
  IconClipboardCheck,
  IconMapPin,
  IconRefresh,
  IconSearch,
  IconTruck,
  IconX,
} from '@tabler/icons-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentShipmentRow = {
  id: string;
  tracking_code: string;
  destination: string | null;
  current_status: string;
  last_event_at: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  public_tracking_token?: string | null;
};

type AgentActionStatus = 'arrived_destination' | 'out_for_delivery' | 'collected_by_customer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(s: string) {
  const map: Record<string, string> = {
    received: 'Received (UK)',
    collected: 'Collected (UK)',
    loaded: 'Loaded',
    departed_uk: 'Departed UK',
    arrived_destination: 'Arrived',
    out_for_delivery: 'Out for delivery',
    collected_by_customer: 'Collected by customer',
    delivered: 'Delivered ✓',
  };
  return map[s] ?? s;
}

function statusColor(s: string) {
  switch (s) {
    case 'delivered': return 'green';
    case 'out_for_delivery':
    case 'collected_by_customer': return 'teal';
    case 'arrived_destination': return 'cyan';
    case 'departed_uk': return 'blue';
    default: return 'gray';
  }
}

function nextActions(status: string): AgentActionStatus[] {
  switch (status) {
    case 'departed_uk':
    case 'loaded':
      return ['arrived_destination'];
    case 'arrived_destination':
      return ['out_for_delivery', 'collected_by_customer'];
    case 'out_for_delivery':
      return ['collected_by_customer'];
    default:
      return [];
  }
}

function actionLabel(s: AgentActionStatus) {
  switch (s) {
    case 'arrived_destination': return 'Mark arrived';
    case 'out_for_delivery': return 'Out for delivery';
    case 'collected_by_customer': return 'Collected by customer';
  }
}

function fmtWhen(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / 3600000;
  if (diffH < 24) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function notifyAutoMessage(auto_message: any) {
  if (!auto_message) return;
  if (auto_message.skipped) return; // silent skip — don't spam agents
  if (auto_message.mode === 'sent') {
    notifications.show({ title: 'Customer notified', message: 'WhatsApp sent', color: 'green' });
  } else if (auto_message.mode === 'failed') {
    notifications.show({ title: 'Message failed', message: auto_message.error ?? 'Send failed', color: 'orange' });
  }
}

// ─── PhotoCapture (inline, same pattern as field intake) ──────────────────────

function PhotoCapture({
  label,
  photo,
  onChange,
  capture = 'environment',
}: {
  label: string;
  photo: File | null;
  onChange: (f: File | null) => void;
  capture?: 'environment' | 'user';
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = photo ? URL.createObjectURL(photo) : null;

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500}>{label}</Text>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={capture}
        style={{ display: 'none' }}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
      />
      {previewUrl ? (
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Image
            src={previewUrl}
            radius="sm"
            h={140}
            fit="cover"
            alt="POD photo"
            onLoad={() => URL.revokeObjectURL(previewUrl)}
          />
          <ActionIcon
            size="sm"
            color="red"
            variant="filled"
            radius="xl"
            style={{ position: 'absolute', top: 4, right: 4 }}
            onClick={() => onChange(null)}
          >
            <IconX size={12} />
          </ActionIcon>
        </div>
      ) : (
        <Button
          variant="light"
          leftSection={<IconCamera size={16} />}
          onClick={() => inputRef.current?.click()}
          fullWidth
        >
          {label}
        </Button>
      )}
    </Stack>
  );
}

// ─── Shipment Card ────────────────────────────────────────────────────────────

function ShipmentCard({
  row,
  onAction,
  onPod,
}: {
  row: AgentShipmentRow;
  onAction: (row: AgentShipmentRow, status: AgentActionStatus) => void;
  onPod: (row: AgentShipmentRow) => void;
}) {
  const isDelivered = row.current_status === 'delivered';
  const actions = nextActions(row.current_status);
  const canPod = !isDelivered;

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      style={{
        opacity: isDelivered ? 0.55 : 1,
        borderColor: isDelivered ? undefined : 'var(--mantine-color-gray-3)',
      }}
    >
      <Stack gap="xs">
        {/* Header */}
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={800} size="lg" ff="monospace" style={{ letterSpacing: 0.5 }}>
              {row.tracking_code}
            </Text>
            <Text size="sm" c="dimmed" truncate>
              {row.destination ?? '—'}
              {row.customer_name ? ` · ${row.customer_name}` : ''}
            </Text>
          </Stack>

          <Stack gap={4} align="flex-end" style={{ flexShrink: 0 }}>
            <Badge color={statusColor(row.current_status)} variant="filled" size="sm">
              {statusLabel(row.current_status)}
            </Badge>
            <Text size="xs" c="dimmed">{fmtWhen(row.last_event_at)}</Text>
          </Stack>
        </Group>

        {/* Actions */}
        {(actions.length > 0 || canPod) && !isDelivered && (
          <>
            <Divider />
            <Group gap="xs" wrap="wrap">
              {actions.map((a) => (
                <Button
                  key={a}
                  size="xs"
                  variant={a === 'arrived_destination' ? 'filled' : 'light'}
                  leftSection={a === 'arrived_destination' ? <IconMapPin size={13} /> : <IconTruck size={13} />}
                  onClick={() => onAction(row, a)}
                >
                  {actionLabel(a)}
                </Button>
              ))}

              <Button
                size="xs"
                variant="light"
                color="green"
                leftSection={<IconClipboardCheck size={13} />}
                onClick={() => onPod(row)}
              >
                Deliver + POD
              </Button>
            </Group>
          </>
        )}

        {isDelivered && (
          <Group gap={6}>
            <ThemeIcon size="xs" color="green" variant="light" radius="xl">
              <IconCheck size={10} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">Delivered</Text>
          </Group>
        )}
      </Stack>
    </Paper>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AgentClient() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AgentShipmentRow[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Status confirm modal
  const [actionTarget, setActionTarget] = useState<{ row: AgentShipmentRow; status: AgentActionStatus } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // POD modal
  const [podTarget, setPodTarget] = useState<AgentShipmentRow | null>(null);
  const [receiverName, setReceiverName] = useState('');
  const [podPhoto, setPodPhoto] = useState<File | null>(null);
  const [podBusy, setPodBusy] = useState(false);

  const load = useCallback(async (query: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/shipments/list?q=${encodeURIComponent(query.trim())}`, {
        cache: 'no-store',
        signal: ac.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load');
      setRows(json?.shipments ?? []);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      notifications.show({ color: 'red', title: 'Load failed', message: e?.message });
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), q.trim() ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function patchRow(id: string, patch: Partial<AgentShipmentRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  // ── Status action ──

  async function confirmAction() {
    if (!actionTarget) return;
    setActionBusy(true);
    try {
      const res = await fetch('/api/agent/shipments/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ shipmentId: actionTarget.row.id, status: actionTarget.status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Update failed');

      notifications.show({ color: 'green', title: 'Updated', message: statusLabel(actionTarget.status) });
      notifyAutoMessage(json?.auto_message);

      patchRow(actionTarget.row.id, {
        current_status: actionTarget.status,
        last_event_at: new Date().toISOString(),
      });
      setActionTarget(null);
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Update failed', message: e?.message });
    } finally {
      setActionBusy(false);
    }
  }

  // ── POD ──

  async function submitPod() {
    if (!podTarget) return;
    if (!receiverName.trim()) {
      notifications.show({ title: 'Missing receiver name', message: 'Who received the shipment?', color: 'red' });
      return;
    }
    if (!podPhoto) {
      notifications.show({ title: 'Missing photo', message: 'Take a POD photo first', color: 'red' });
      return;
    }
    setPodBusy(true);
    try {
      const fd = new FormData();
      fd.set('shipmentId', podTarget.id);
      fd.set('receiverName', receiverName.trim());
      fd.set('file', podPhoto);
      fd.set('sendUpdate', 'true');

      const res = await fetch('/api/pod/complete', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'POD failed');

      notifications.show({ color: 'green', title: 'Delivered!', message: `POD saved for ${podTarget.tracking_code}` });
      notifyAutoMessage(json?.auto_message);

      patchRow(podTarget.id, {
        current_status: 'delivered',
        last_event_at: new Date().toISOString(),
      });
      setPodTarget(null);
      setReceiverName('');
      setPodPhoto(null);
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'POD failed', message: e?.message });
    } finally {
      setPodBusy(false);
    }
  }

  // ── Split active / delivered ──
  const active = rows.filter((r) => r.current_status !== 'delivered');
  const delivered = rows.filter((r) => r.current_status === 'delivered');

  return (
    <Stack gap="md">
      {/* Header */}
      <Group justify="space-between" align="flex-end" wrap="wrap">
        <Stack gap={2}>
          <Text fw={700} size="lg">Agent portal</Text>
          <Text size="sm" c="dimmed">
            {active.length} active · {delivered.length} delivered
          </Text>
        </Stack>

        <Group gap="xs">
          <TextInput
            placeholder="Search tracking…"
            leftSection={<IconSearch size={15} />}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            w={200}
          />
          <ActionIcon
            variant="light"
            size="lg"
            loading={loading}
            onClick={() => void load(q)}
            aria-label="Refresh"
          >
            <IconRefresh size={16} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Active shipments */}
      {loading ? (
        <Text c="dimmed" size="sm">Loading…</Text>
      ) : active.length === 0 ? (
        <Paper withBorder p="xl" radius="md">
          <Stack align="center" gap="xs">
            <ThemeIcon size="xl" variant="light" color="gray" radius="xl">
              <IconCheck size={22} />
            </ThemeIcon>
            <Text fw={600}>All clear</Text>
            <Text size="sm" c="dimmed">No active shipments for your destination.</Text>
          </Stack>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {active.map((r) => (
            <ShipmentCard
              key={r.id}
              row={r}
              onAction={(row, status) => setActionTarget({ row, status })}
              onPod={(row) => {
                setPodTarget(row);
                setReceiverName('');
                setPodPhoto(null);
              }}
            />
          ))}
        </SimpleGrid>
      )}

      {/* Delivered (collapsed) */}
      {delivered.length > 0 && (
        <Stack gap="xs">
          <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: 1 }}>
            Delivered ({delivered.length})
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {delivered.map((r) => (
              <ShipmentCard
                key={r.id}
                row={r}
                onAction={() => {}}
                onPod={() => {}}
              />
            ))}
          </SimpleGrid>
        </Stack>
      )}

      {/* Status confirm modal */}
      <Modal
        opened={Boolean(actionTarget)}
        onClose={() => !actionBusy && setActionTarget(null)}
        title={actionTarget ? actionLabel(actionTarget.status) : ''}
        size="sm"
        centered
      >
        {actionTarget && (
          <Stack gap="sm">
            <Text size="sm">
              <b>{actionTarget.row.tracking_code}</b> · {actionTarget.row.destination ?? '—'}
            </Text>
            {actionTarget.row.customer_name && (
              <Text size="sm" c="dimmed">Customer: {actionTarget.row.customer_name}</Text>
            )}
            <Text size="sm" c="dimmed">
              Customer will be notified automatically if a template is configured.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setActionTarget(null)} disabled={actionBusy}>
                Cancel
              </Button>
              <Button onClick={confirmAction} loading={actionBusy}>
                Confirm
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      {/* POD modal */}
      <Modal
        opened={Boolean(podTarget)}
        onClose={() => !podBusy && setPodTarget(null)}
        title="Deliver + capture POD"
        size="sm"
        centered
      >
        {podTarget && (
          <Stack gap="sm">
            <Text size="sm">
              <b>{podTarget.tracking_code}</b> · {podTarget.destination ?? '—'}
            </Text>

            <TextInput
              label="Receiver name"
              value={receiverName}
              onChange={(e) => setReceiverName(e.currentTarget.value)}
              placeholder="e.g. Marsha Brown"
              required
            />

            <PhotoCapture
              label="Take POD photo"
              photo={podPhoto}
              onChange={setPodPhoto}
              capture="environment"
            />

            <Group justify="flex-end">
              <Button variant="default" onClick={() => setPodTarget(null)} disabled={podBusy}>
                Cancel
              </Button>
              <Button
                onClick={submitPod}
                loading={podBusy}
                disabled={!receiverName.trim() || !podPhoto}
                leftSection={<IconClipboardCheck size={16} />}
              >
                Save POD
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}