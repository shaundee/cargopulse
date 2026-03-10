'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Drawer,
  Group,
  Image,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck,
  IconCopy,
  IconPencil,
  IconPhone,
  IconPrinter,
  IconX,
} from '@tabler/icons-react';
import { type PackingItem } from '@/lib/offline/outbox';
import { PackingListEditor } from './PackingListEditor';

import type {
  MessageLogRow,
  ShipmentDetail,
  ShipmentEventRow,
  ShipmentStatus,
  TemplateRow,
} from '../shipment-types';
import { getExistingPod, statusBadgeColor, statusLabel } from '../shipment-types';

import { StatusUpdateCard } from './StatusUpdateCard';
import { MessageHistoryCard } from './MessageHistoryCard';
import { PodCard } from './PodCard';
import { TimelineCard } from './TimelineCard';

type DrawerTab = 'timeline' | 'cargo' | 'proof';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DESTINATION_FLAG: Record<string, string> = {
  jamaica: '🇯🇲',
  uk: '🇬🇧',
  'united kingdom': '🇬🇧',
  ghana: '🇬🇭',
  nigeria: '🇳🇬',
  usa: '🇺🇸',
  'united states': '🇺🇸',
  canada: '🇨🇦',
  barbados: '🇧🇧',
  trinidad: '🇹🇹',
  'trinidad and tobago': '🇹🇹',
  guyana: '🇬🇾',
  'sierra leone': '🇸🇱',
  cameroon: '🇨🇲',
  kenya: '🇰🇪',
};

function destFlag(dest: string | null | undefined) {
  if (!dest) return '';
  return DESTINATION_FLAG[dest.toLowerCase()] ?? '';
}

function serviceLabel(s: string | null | undefined) {
  if (s === 'door_to_door') return 'Door to Door';
  if (s === 'depot') return 'Depot';
  return s ?? '';
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ShipmentDetailDrawer({
  opened,
  shipmentId,
  initialTab = 'timeline',
  onClose,
  onReloadRequested,
}: {
  opened: boolean;
  shipmentId: string | null;
  onClose: () => void;
  onReloadRequested: () => void;
  initialTab?: DrawerTab;
}) {
  // Tabs
  const [tab, setTab] = useState<DrawerTab>(initialTab);

  useEffect(() => {
    if (!opened) return;
    setTab(initialTab ?? 'timeline');
  }, [opened, shipmentId, initialTab]);

  // Data
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailShipment, setDetailShipment] = useState<ShipmentDetail | null>(null);
  const [detailEvents, setDetailEvents] = useState<ShipmentEventRow[]>([]);
  const [detailLogs, setDetailLogs] = useState<MessageLogRow[]>([]);
  const [detailLogsLoading, setDetailLogsLoading] = useState(false);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [destEnabledStatuses, setDestEnabledStatuses] = useState<string[]>([]);

  // Status update saving state (StatusUpdateCard manages its own pending/note)
  const [eventSaving, setEventSaving] = useState(false);

  // POD
  const [podReceiver, setPodReceiver] = useState('');
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podSaving, setPodSaving] = useState(false);

  // Pickup assets
  const [assets, setAssets] = useState<Array<{ id: string; kind: string; url: string | null; created_at: string }>>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  // Cargo edit
  const [cargoEditing, setCargoEditing] = useState(false);
  const [editCargoType, setEditCargoType] = useState('general');
  const [editQty, setEditQty] = useState<number | null>(null);
  const [editItems, setEditItems] = useState<PackingItem[]>([]);
  const [cargoSaving, setCargoSaving] = useState(false);

  // Header actions
  const [origin, setOrigin] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const existingPod = useMemo(() => getExistingPod(detailShipment), [detailShipment]);

  const token = detailShipment?.public_tracking_token;
  const trackingLink = token && origin ? `${origin}/t/${token}` : '';

  function copyLink() {
    if (!trackingLink) return;
    navigator.clipboard.writeText(trackingLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ----------------------------
  // Loaders
  // ----------------------------

  async function loadTemplates() {
    try {
      const res = await fetch('/api/message-templates', { cache: 'no-store' });
      const ct = res.headers.get('content-type') || '';
      if (!res.ok) return;
      if (!ct.includes('application/json')) return;

      const json = await res.json();
      setTemplates((json.templates ?? []) as TemplateRow[]);
    } catch {
      // ignore
    }
  }

  async function loadAssets(id: string) {
    setAssetsLoading(true);
    try {
      const res = await fetch(`/api/shipments/assets/list?shipmentId=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load assets');
      setAssets(json?.assets ?? []);
    } catch {
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }

  async function loadLogs(id: string) {
    setDetailLogsLoading(true);
    try {
      const res = await fetch(`/api/messages/logs?shipment_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const ct = res.headers.get('content-type') || '';
      const json = ct.includes('application/json') ? await res.json() : null;

      if (res.ok && json) setDetailLogs(json.logs ?? []);
      else setDetailLogs([]);
    } catch {
      setDetailLogs([]);
    } finally {
      setDetailLogsLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    setDetailShipment(null);
    setDetailEvents([]);
    setDetailLogs([]);
    setTemplates([]);
    setPodReceiver('');
    setPodFile(null);
    setCargoEditing(false);

    try {
      const res = await fetch(`/api/shipments/detail?shipment_id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(isJson ? (payload?.error ?? `Failed to load (${res.status})`) : `Failed to load (${res.status})`);
      }

      setDetailShipment(payload.shipment);
      setDetailEvents(payload.events ?? []);

      // Load "side" data in parallel (logs, templates, assets, destination enabled statuses)
      const destName: string = payload.shipment?.destination ?? '';
      await Promise.all([
        loadLogs(id),
        loadTemplates(),
        loadAssets(id),
        fetch('/api/destinations', { cache: 'no-store' })
          .then((r) => r.json())
          .then((j) => {
            const dest = (j.destinations ?? []).find(
              (d: any) => String(d.name).toLowerCase() === destName.toLowerCase()
            );
            setDestEnabledStatuses(dest?.enabled_statuses ?? []);
          })
          .catch(() => setDestEnabledStatuses([])),
      ]);
    } catch (e: any) {
      notifications.show({
        title: 'Load failed',
        message: e?.message ?? 'Could not load shipment detail',
        color: 'red',
      });
      onClose();
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (!opened) return;
    if (!shipmentId) return;
    void loadDetail(shipmentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, shipmentId]);

  // ----------------------------
  // Actions
  // ----------------------------

  async function addEvent({
    status,
    sendUpdate,
    templateId,
    note,
  }: {
    status: ShipmentStatus;
    sendUpdate: boolean;
    templateId: string | null;
    note: string;
  }) {
    if (!detailShipment?.id) return;

    setEventSaving(true);
    try {
      const res = await fetch('/api/shipments/events/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: detailShipment.id,
          status,
          note: note || null,
          autoLog: sendUpdate,
          templateId,
        }),
      });

      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(isJson ? (payload?.error ?? `Update failed (${res.status})`) : `Update failed (${res.status})`);
      }

      notifications.show({ title: 'Status updated', message: 'Timeline updated', color: 'green' });

      if (sendUpdate && isJson) {
        const m = payload?.auto_message;
        if (m?.skipped) {
          notifications.show({ title: 'Message skipped', message: String(m?.reason ?? 'skipped'), color: 'yellow' });
        } else if (m?.ok && m?.mode === 'sent') {
          notifications.show({ title: 'Message sent', message: 'WhatsApp queued/sent', color: 'green' });
        } else if (m?.ok && m?.mode === 'logged_only') {
          notifications.show({ title: 'Message logged', message: 'Twilio not configured or invalid phone', color: 'blue' });
        } else if (m && m?.ok === false) {
          notifications.show({ title: 'Message failed', message: String(m?.error ?? 'Send failed'), color: 'red' });
        }
      }

      onReloadRequested();
      await loadDetail(detailShipment.id);
    } catch (e: any) {
      notifications.show({ title: 'Update failed', message: e?.message ?? 'Could not update status', color: 'red' });
    } finally {
      setEventSaving(false);
    }
  }

  async function savePod() {
    if (!detailShipment?.id || !podFile) return;

    setPodSaving(true);
    try {
      const fd = new FormData();
      fd.append('shipmentId', detailShipment.id);
      fd.append('receiverName', podReceiver);
      fd.append('file', podFile);

      const res = await fetch('/api/pod/complete', { method: 'POST', body: fd });

      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(isJson ? (payload?.error ?? `Failed (${res.status})`) : `Failed (${res.status})`);
      }

      notifications.show({ title: 'POD saved', message: 'Shipment marked delivered', color: 'green' });

      setPodReceiver('');
      setPodFile(null);

      await loadDetail(detailShipment.id);
      onReloadRequested();
    } catch (e: any) {
      notifications.show({ title: 'POD failed', message: e?.message ?? 'Failed', color: 'red' });
    } finally {
      setPodSaving(false);
    }
  }

  // ----------------------------
  // Panel sub-components
  // ----------------------------

  const CARGO_TYPES_EDIT = [
    { value: 'general', label: 'General' },
    { value: 'barrel', label: 'Barrel' },
    { value: 'box', label: 'Box' },
    { value: 'crate', label: 'Crate' },
    { value: 'pallet', label: 'Pallet' },
    { value: 'vehicle', label: 'Vehicle' },
    { value: 'machinery', label: 'Machinery' },
    { value: 'mixed', label: 'Mixed' },
    { value: 'other', label: 'Other' },
  ];

  function startCargoEdit() {
    const m = (detailShipment as any)?.cargo_meta ?? {};
    setEditCargoType((detailShipment as any)?.cargo_type ?? 'general');
    setEditQty(m.quantity != null ? Number(m.quantity) : null);
    setEditItems(
      Array.isArray(m.contents)
        ? m.contents.map((c: any) => ({
            category: c.category ?? 'Other',
            description: c.description ?? '',
            qty: c.qty ?? 1,
          }))
        : [],
    );
    setCargoEditing(true);
  }

  async function saveCargoEdit() {
    if (!detailShipment) return;
    setCargoSaving(true);
    try {
      const m = (detailShipment as any)?.cargo_meta ?? {};
      const showPacking = editCargoType === 'barrel' || editCargoType === 'box';

      // Preserve existing non-packing fields; overlay packing edits
      const cargoMeta: Record<string, unknown> = { ...m };
      if (showPacking && editQty != null) {
        cargoMeta.quantity = editQty;
      } else {
        delete cargoMeta.quantity;
      }
      if (showPacking) {
        const sanitised = editItems
          .filter(c => c.category)
          .map(c => ({
            category: c.category,
            description: c.description?.trim() || null,
            qty: Math.max(1, c.qty),
          }));
        if (sanitised.length > 0) cargoMeta.contents = sanitised;
        else delete cargoMeta.contents;
      } else {
        delete cargoMeta.contents;
      }

      const res = await fetch(`/api/shipments/${detailShipment.id}/cargo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargoType: editCargoType, cargoMeta }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        notifications.show({
          title: 'Save failed',
          message: json?.error ?? `Error ${res.status}`,
          color: 'red',
        });
        return;
      }
      notifications.show({ title: 'Cargo updated', message: 'Changes saved', color: 'green' });
      setCargoEditing(false);
      onReloadRequested();
      await loadDetail(detailShipment.id);
    } catch (e: any) {
      notifications.show({ title: 'Save failed', message: e?.message ?? 'Request failed', color: 'red' });
    } finally {
      setCargoSaving(false);
    }
  }

  function CargoDetailsPanel({ shipment }: { shipment: ShipmentDetail }) {
    const cargoType = (shipment as any)?.cargo_type ?? null;
    const meta = (shipment as any)?.cargo_meta ?? null;
    const m = meta && typeof meta === 'object' ? meta : {};

    const Row = ({ label, value }: { label: string; value: any }) => (
      <Group justify="space-between" gap="xs">
        <Text size="sm" c="dimmed">
          {label}
        </Text>
        <Text size="sm" fw={600}>
          {value ?? '-'}
        </Text>
      </Group>
    );

    const qty = (m as any).quantity;
    const contents: Array<{ category: string; description?: string; qty: number }> | null =
      Array.isArray((m as any).contents) && (m as any).contents.length > 0 ? (m as any).contents : null;
    const dims = (m as any).dimensions;
    const veh = (m as any).vehicle;

    const editShowPacking = editCargoType === 'barrel' || editCargoType === 'box';

    return (
      <Stack gap="sm">
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Text fw={700}>Cargo details</Text>
              {!cargoEditing && (
                <ActionIcon variant="subtle" size="sm" title="Edit cargo" onClick={startCargoEdit}>
                  <IconPencil size={14} />
                </ActionIcon>
              )}
            </Group>

            {/* ── Edit mode ── */}
            {cargoEditing ? (
              <Stack gap="sm" pt="xs">
                <Select
                  label="Cargo type"
                  value={editCargoType}
                  onChange={v => {
                    setEditCargoType(v ?? 'general');
                    setEditQty(null);
                    setEditItems([]);
                  }}
                  data={CARGO_TYPES_EDIT}
                />

                {editShowPacking && (
                  <NumberInput
                    label="Quantity"
                    min={0}
                    placeholder="e.g. 3"
                    value={editQty ?? ''}
                    onChange={v => setEditQty(typeof v === 'number' ? v : null)}
                  />
                )}

                {editShowPacking && (
                  <PackingListEditor items={editItems} onChange={setEditItems} />
                )}

                <Group justify="flex-end" gap="xs" pt="xs">
                  <Button
                    variant="default"
                    size="xs"
                    disabled={cargoSaving}
                    onClick={() => setCargoEditing(false)}
                  >
                    Cancel
                  </Button>
                  <Button size="xs" loading={cargoSaving} onClick={saveCargoEdit}>
                    Save
                  </Button>
                </Group>
              </Stack>
            ) : (
              /* ── Read-only mode ── */
              <>
                <Row label="Type" value={cargoType ? String(cargoType) : '-'} />
                {(m as any).pickup_address ? <Row label="Pickup address" value={(m as any).pickup_address} /> : null}
                {(m as any).pickup_contact_phone ? <Row label="Pickup contact" value={(m as any).pickup_contact_phone} /> : null}
                {(m as any).notes ? <Row label="Notes" value={(m as any).notes} /> : null}
                {qty != null ? <Row label="Quantity" value={String(qty)} /> : null}

                {contents ? (
                  <Paper withBorder p="xs" radius="md">
                    <Stack gap="xs">
                      <Text size="sm" fw={700}>Contents</Text>
                      <div style={{ overflowX: 'auto' }}>
                        <Table striped withTableBorder withColumnBorders fz="sm">
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Category</Table.Th>
                              <Table.Th>Description</Table.Th>
                              <Table.Th style={{ textAlign: 'right' }}>Qty</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {contents.map((c, i) => (
                              <Table.Tr key={i}>
                                <Table.Td>{c.category}</Table.Td>
                                <Table.Td c="dimmed">{c.description || '—'}</Table.Td>
                                <Table.Td style={{ textAlign: 'right' }}>{c.qty}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </div>
                    </Stack>
                  </Paper>
                ) : null}

                {dims && typeof dims === 'object' ? (
                  <Paper withBorder p="xs" radius="md">
                    <Stack gap="xs">
                      <Text size="sm" fw={700}>Dimensions</Text>
                      <Row label="Weight (kg)" value={(dims as any).weight_kg ?? '-'} />
                      <Row label="Length (cm)" value={(dims as any).length_cm ?? '-'} />
                      <Row label="Width (cm)" value={(dims as any).width_cm ?? '-'} />
                      <Row label="Height (cm)" value={(dims as any).height_cm ?? '-'} />
                      <Row
                        label="Forklift required"
                        value={(dims as any).forklift_required == null ? '-' : (dims as any).forklift_required ? 'Yes' : 'No'}
                      />
                      {(dims as any).handling_notes ? <Row label="Handling notes" value={(dims as any).handling_notes} /> : null}
                    </Stack>
                  </Paper>
                ) : null}

                {veh && typeof veh === 'object' ? (
                  <Paper withBorder p="xs" radius="md">
                    <Stack gap="xs">
                      <Text size="sm" fw={700}>Vehicle</Text>
                      {(veh as any).make ? <Row label="Make" value={(veh as any).make} /> : null}
                      {(veh as any).model ? <Row label="Model" value={(veh as any).model} /> : null}
                      {(veh as any).year ? <Row label="Year" value={(veh as any).year} /> : null}
                      {(veh as any).reg ? <Row label="Reg" value={(veh as any).reg} /> : null}
                      {(veh as any).vin ? <Row label="VIN" value={(veh as any).vin} /> : null}
                      <Row
                        label="Keys received"
                        value={(veh as any).keys_received == null ? '-' : (veh as any).keys_received ? 'Yes' : 'No'}
                      />
                      {(veh as any).handling_notes ? <Row label="Handling notes" value={(veh as any).handling_notes} /> : null}
                    </Stack>
                  </Paper>
                ) : null}

                {!cargoType && qty == null && !contents && !dims && !veh && !(m as any).pickup_address && !(m as any).pickup_contact_phone && !(m as any).notes ? (
                  <Text size="sm" c="dimmed">No cargo details recorded.</Text>
                ) : null}
              </>
            )}
          </Stack>
        </Paper>
      </Stack>
    );
  }

  function ProofPanel({ shipment: _shipment }: { shipment: ShipmentDetail }) {
    return (
      <Stack gap="sm">
        <PodCard
          existingPod={existingPod}
          podReceiver={podReceiver}
          setPodReceiver={setPodReceiver}
          podFile={podFile}
          setPodFile={setPodFile}
          podSaving={podSaving}
          onSavePod={savePod}
        />

        <Paper withBorder p="md" radius="md">
          <Title order={5}>Pickup photos</Title>

          {assetsLoading ? (
            <Text c="dimmed" size="sm">Loading…</Text>
          ) : (
            <>
              <SimpleGrid cols={3} mt="sm">
                {assets
                  .filter((a) => a.kind === 'pickup_photo' && a.url)
                  .map((a) => <Image key={a.id} src={a.url!} radius="md" />)}
              </SimpleGrid>

              {assets.some((a) => a.kind === 'pickup_signature' && a.url) ? (
                <>
                  <Title order={6} mt="md">Signature</Title>
                  {assets
                    .filter((a) => a.kind === 'pickup_signature' && a.url)
                    .map((a) => <Image key={a.id} src={a.url!} radius="md" />)}
                </>
              ) : null}

              {!assets.length ? (
                <Text c="dimmed" size="sm" mt="sm">No pickup assets yet.</Text>
              ) : null}
            </>
          )}
        </Paper>

        <MessageHistoryCard detailLogs={detailLogs} detailLogsLoading={detailLogsLoading} />
      </Stack>
    );
  }

  // ----------------------------
  // Custom Drawer header
  // ----------------------------

  const iconBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 7,
    background: '#f3f4f6', color: '#374151',
    border: 'none', cursor: 'pointer', flexShrink: 0,
    transition: 'background 0.1s',
  };

  const drawerTitle = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', width: '100%', gap: 8 }}>
      {/* Left: customer name + status + subtitle */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2, color: '#111827' }}>
            {detailShipment?.customers?.name ?? (detailLoading ? '…' : 'Shipment')}
          </span>
          {detailShipment && (
            <Badge
              color={statusBadgeColor(detailShipment.current_status as ShipmentStatus)}
              variant="light"
              size="sm"
            >
              {statusLabel(detailShipment.current_status as ShipmentStatus, detailShipment.destination)}
            </Badge>
          )}
        </div>
        {detailShipment && (
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3, lineHeight: 1.4 }}>
            {detailShipment.tracking_code}
            {detailShipment.destination
              ? ` · ${detailShipment.destination} ${destFlag(detailShipment.destination)}`
              : ''}
            {detailShipment.service_type
              ? ` · ${serviceLabel(detailShipment.service_type)}`
              : ''}
          </div>
        )}
      </div>

      {/* Right: action icon buttons */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'center', flexShrink: 0, marginTop: 2 }}>
        {/* Phone */}
        {detailShipment?.customers?.phone && (
          <a
            href={`tel:${detailShipment.customers.phone}`}
            title="Call customer"
            style={{ ...iconBtn, background: '#f0fdf4', color: '#16a34a', textDecoration: 'none' }}
          >
            <IconPhone size={14} />
          </a>
        )}

        {/* Copy tracking link */}
        <button
          onClick={copyLink}
          disabled={!trackingLink}
          title="Copy tracking link"
          style={{ ...iconBtn, opacity: trackingLink ? 1 : 0.4 }}
        >
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>

        {/* Print BOL */}
        <button
          onClick={() => detailShipment && window.open(`/shipments/print/${detailShipment.id}`, '_blank')}
          disabled={!detailShipment}
          title="Print BOL"
          style={{ ...iconBtn, opacity: detailShipment ? 1 : 0.4 }}
        >
          <IconPrinter size={14} />
        </button>

        {/* Close */}
        <button
          onClick={onClose}
          title="Close"
          style={iconBtn}
        >
          <IconX size={14} />
        </button>
      </div>
    </div>
  );

  // ----------------------------
  // Render
  // ----------------------------

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="min(100vw, 480px)"
      withCloseButton={false}
      title={drawerTitle}
    >
      {detailLoading ? (
        <Text c="dimmed">Loading…</Text>
      ) : !detailShipment ? (
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <Text c="dimmed">No shipment loaded</Text>
            <Text size="sm" c="dimmed">Tip: click a row again if you closed the drawer.</Text>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="sm">
          <Tabs value={tab} onChange={(v) => setTab((v as DrawerTab) ?? 'timeline')} keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="timeline">Timeline</Tabs.Tab>
              <Tabs.Tab value="cargo">Cargo details</Tabs.Tab>
              <Tabs.Tab value="proof">Proof of delivery</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="timeline" pt="sm">
              <Stack gap="sm">
                <StatusUpdateCard
                  currentStatus={detailShipment.current_status as ShipmentStatus}
                  templates={templates}
                  customerName={detailShipment.customers?.name ?? ''}
                  trackingCode={detailShipment.tracking_code}
                  destination={detailShipment.destination ?? ''}
                  publicTrackingToken={detailShipment.public_tracking_token ?? null}
                  enabledStatuses={destEnabledStatuses}
                  onSave={addEvent}
                  saving={eventSaving}
                />

                <TimelineCard
                  detailEvents={detailEvents}
                  trackingCode={detailShipment.tracking_code}
                  destination={detailShipment.destination}
                />
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="cargo" pt="sm">
              <CargoDetailsPanel shipment={detailShipment} />
            </Tabs.Panel>

            <Tabs.Panel value="proof" pt="sm">
              <ProofPanel shipment={detailShipment} />
            </Tabs.Panel>
          </Tabs>
        </Stack>
      )}
    </Drawer>
  );
}
