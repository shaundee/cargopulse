'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Drawer,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

import type {
  MessageLogRow,
  ShipmentDetail,
  ShipmentEventRow,
  ShipmentStatus,
  TemplateRow,
} from '../shipment-types';
import { getExistingPod } from '../shipment-types';

import { ShipmentSummaryCard } from './ShipmentSummaryCard';
import { StatusUpdateCard } from './StatusUpdateCard';
import { MessageHistoryCard } from './MessageHistoryCard';
import { PodCard } from './PodCard';
import { TimelineCard } from './TimelineCard';

type DrawerTab = 'logistics' | 'cargo' | 'proof';

export function ShipmentDetailDrawer({
  opened,
  shipmentId,
  initialTab = 'logistics',
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
    setTab(initialTab ?? 'logistics');
  }, [opened, shipmentId, initialTab]);

  // Data
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailShipment, setDetailShipment] = useState<ShipmentDetail | null>(null);
  const [detailEvents, setDetailEvents] = useState<ShipmentEventRow[]>([]);
  const [detailLogs, setDetailLogs] = useState<MessageLogRow[]>([]);
  const [detailLogsLoading, setDetailLogsLoading] = useState(false);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);

  // Status update form state
  const [eventStatus, setEventStatus] = useState<ShipmentStatus>('received');
  const [eventNote, setEventNote] = useState('');
  const [eventSaving, setEventSaving] = useState(false);

  // POD
  const [podReceiver, setPodReceiver] = useState('');
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podSaving, setPodSaving] = useState(false);

  // Pickup assets
  const [assets, setAssets] = useState<Array<{ id: string; kind: string; url: string | null; created_at: string }>>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);

  const existingPod = useMemo(() => getExistingPod(detailShipment), [detailShipment]);

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
    setEventNote('');
    setPodReceiver('');
    setPodFile(null);

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
      setEventStatus((payload.shipment?.current_status ?? 'received') as ShipmentStatus);

      // Load “side” data in parallel (logs, templates, assets)
      await Promise.all([
        loadLogs(id),
        loadTemplates(),
        loadAssets(id),
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

  async function addEvent(opts?: { sendUpdate?: boolean; templateId?: string | null }) {
    if (!detailShipment?.id) return;

    setEventSaving(true);
    try {
      const sendUpdate = Boolean(opts?.sendUpdate ?? false);
      const templateId = (opts?.templateId ?? null) ? String(opts?.templateId) : null;

      const res = await fetch('/api/shipments/events/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: detailShipment.id,
          status: eventStatus,
          note: eventNote || null,
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

      // Surface message outcome (sent/logged/skipped/failed)
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
  // Render helpers
  // ----------------------------

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
    const dims = (m as any).dimensions;
    const veh = (m as any).vehicle;

    return (
      <Stack gap="sm">
        <Paper withBorder p="sm" radius="md">
          <Stack gap="xs">
            <Text fw={700}>Cargo details</Text>

            <Row label="Type" value={cargoType ? String(cargoType) : '-'} />
            {(m as any).pickup_address ? <Row label="Pickup address" value={(m as any).pickup_address} /> : null}
            {(m as any).pickup_contact_phone ? <Row label="Pickup contact" value={(m as any).pickup_contact_phone} /> : null}
            {(m as any).notes ? <Row label="Notes" value={(m as any).notes} /> : null}
            {qty != null ? <Row label="Quantity" value={String(qty)} /> : null}

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

            {!cargoType && qty == null && !dims && !veh && !(m as any).pickup_address && !(m as any).pickup_contact_phone && !(m as any).notes ? (
              <Text size="sm" c="dimmed">No cargo details recorded.</Text>
            ) : null}
          </Stack>
        </Paper>

      </Stack>
    );
  }

  function ProofPanel({ shipment }: { shipment: ShipmentDetail }) {
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
  // Render
  // ----------------------------

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title={detailShipment ? `Shipment ${detailShipment.tracking_code}` : 'Shipment'}
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
          {/* Keep a compact summary at top (fast context) */}
          <ShipmentSummaryCard detailShipment={detailShipment} onReloadRequested={onReloadRequested} />

          <Tabs value={tab} onChange={(v) => setTab((v as DrawerTab) ?? 'logistics')} keepMounted={false}>
            <Tabs.List>
              <Tabs.Tab value="logistics">Logistics</Tabs.Tab>
              <Tabs.Tab value="cargo">Cargo</Tabs.Tab>
              <Tabs.Tab value="proof">Proof</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="logistics" pt="sm">
              <Stack gap="sm">
                <StatusUpdateCard
                  currentStatus={detailShipment.current_status as ShipmentStatus}
                  eventStatus={eventStatus}
                  setEventStatus={setEventStatus}
                  eventNote={eventNote}
                  setEventNote={setEventNote}
                  templates={templates}
                  customerName={detailShipment.customers?.name ?? ''}
                  trackingCode={detailShipment.tracking_code}
                  destination={detailShipment.destination ?? ''}
                  publicTrackingToken={detailShipment.public_tracking_token ?? null}
                  onSave={addEvent}
                  saving={eventSaving}
                  stickyPrimaryAction
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