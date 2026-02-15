'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Divider,
  FileInput,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';

import type { IntakePayload, OutboxItem } from '@/lib/offline/outbox';
import { outboxDelete, outboxGet, outboxList, outboxPatch, outboxPut, safeUuid } from '@/lib/offline/outbox';

const CARGO_OPTIONS = [
  { value: 'general', label: 'General' },
  { value: 'barrel', label: 'Barrel' },
  { value: 'box', label: 'Box' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'machinery', label: 'Machinery' },
  { value: 'mixed', label: 'Mixed' },
  { value: 'other', label: 'Other' },
] as const;

function fmtWhen(iso: string) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '-';
}

// Mantine FileInput (multiple) can be typed as File | File[] | null depending on version
type FileValue = File | File[] | null;

function toFileArray(v: FileValue): File[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

export function FieldIntakeClient() {
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<OutboxItem[]>([]);

  const [form, setForm] = useState<IntakePayload>({
    customerName: '',
    phone: '',
    destination: '',
    serviceType: 'depot',
    cargoType: 'general',
    pickupAddress: '',
    pickupContactPhone: '',
    notes: '',
    occurredAtISO: new Date().toISOString(),
  });

  // IMPORTANT: match Mantine's value typing
  const [photos, setPhotos] = useState<File[]>([]);
  const [signature, setSignature] = useState<File | null>(null);

  async function reloadOutbox() {
    const list = await outboxList();
    setItems(list);
  }

  useEffect(() => {
    const apply = () => setOnline(navigator.onLine);
    apply();
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    void reloadOutbox();

    return () => {
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
    };
  }, []);

  const canSave = useMemo(() => {
    return (
      form.customerName.trim().length >= 2 &&
      form.phone.trim().length >= 6 &&
      form.destination.trim().length >= 2
    );
  }, [form]);

  async function saveToOutbox(andSync: boolean) {
    if (!canSave) return;

    const id = safeUuid();
    const item: OutboxItem = {
      id,
      kind: 'intake_create',
      status: 'pending',
      created_at: new Date().toISOString(),
      payload: {
        ...form,
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        destination: form.destination.trim(),
        pickupAddress: (form.pickupAddress ?? '').trim() || null,
        pickupContactPhone: (form.pickupContactPhone ?? '').trim() || null,
        notes: (form.notes ?? '').trim() || null,
        occurredAtISO: form.occurredAtISO ?? new Date().toISOString(),
      },
      photos,
      signature: signature ?? null,
      server: null,
      error: null,
    };

    await outboxPut(item);
    await reloadOutbox();

    notifications.show({
      title: 'Saved',
      message: online && andSync ? 'Saved and syncing…' : 'Saved offline (outbox)',
      color: 'green',
    });

    // reset form
    setForm((p) => ({
      ...p,
      customerName: '',
      phone: '',
      destination: '',
      cargoType: 'general',
      pickupAddress: '',
      pickupContactPhone: '',
      notes: '',
      occurredAtISO: new Date().toISOString(),
    }));
    setPhotos([]);
    setSignature(null);

    if (andSync) {
      await syncOne(id);
      await reloadOutbox();
    }
  }

  async function syncOne(id: string) {
    const target = items.find((i) => i.id === id) ?? (await outboxGet(id));
    if (!target) return;

    if (!navigator.onLine) {
      notifications.show({ title: 'Offline', message: 'Connect to the internet to sync', color: 'yellow' });
      return;
    }

    setBusy(true);
    await outboxPatch(id, { status: 'syncing', error: null });
    await reloadOutbox();

    try {
      const fd = new FormData();
      fd.append('clientEventId', target.id);
      fd.append('payload', JSON.stringify(target.payload));

      for (const file of target.photos ?? []) {
        fd.append('photos', file, file.name || `photo-${Date.now()}.jpg`);
      }

      if (target.signature) {
        fd.append('signature', target.signature, target.signature.name || `signature-${Date.now()}.jpg`);
      }

      const res = await fetch('/api/field/intake', {
        method: 'POST',
        body: fd,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Sync failed');

      await outboxPatch(id, {
        status: 'synced',
        server: { shipmentId: String(json.shipmentId), trackingCode: String(json.trackingCode) },
        error: null,
      });
await reloadOutbox();
      notifications.show({
        title: 'Synced',
        message: `Created shipment ${String(json.trackingCode)}`,
        color: 'green',
      });
    } catch (e: any) {
      await outboxPatch(id, { status: 'failed', error: e?.message ?? 'Sync failed' });
      await reloadOutbox();
      notifications.show({ title: 'Sync failed', message: e?.message ?? 'Error', color: 'red' });
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    if (!navigator.onLine) {
      notifications.show({ title: 'Offline', message: 'Connect to the internet to sync', color: 'yellow' });
      return;
    }

    const pending = items.filter((i) => i.status === 'pending' || i.status === 'failed');
    if (!pending.length) {
      notifications.show({ title: 'Nothing to sync', message: 'Outbox is empty', color: 'gray' });
      return;
    }

    for (const it of pending) {
      // eslint-disable-next-line no-await-in-loop
      await syncOne(it.id);
    }
    await reloadOutbox();
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text fw={900} size="xl">
            Field intake
          </Text>
          <Text size="sm" c="dimmed">
            Offline-first collections: save to outbox when offline, then sync when online.
          </Text>
        </Stack>
        <Badge variant="light" color={online ? 'green' : 'orange'}>
          {online ? 'Online' : 'Offline'}
        </Badge>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={700}>New collection</Text>

          <Group grow align="flex-end">
            <TextInput
              label="Customer name"
              placeholder="e.g., Andre Brown"
              value={form.customerName}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((p) => ({ ...p, customerName: v }));
              }}
            />
            <TextInput
              label="Customer phone"
              placeholder="e.g., 079..."
              value={form.phone}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((p) => ({ ...p, phone: v }));
              }}
            />
          </Group>

          <Group grow align="flex-end">
            <TextInput
              label="Destination"
              placeholder="e.g., Jamaica / Barbados / St Lucia"
              value={form.destination}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((p) => ({ ...p, destination: v }));
              }}
            />
            <Select
              label="Service type"
              value={form.serviceType}
              onChange={(v) => setForm((p) => ({ ...p, serviceType: (v as any) ?? 'depot' }))}
              data={[
                { value: 'depot', label: 'Depot' },
                { value: 'door_to_door', label: 'Door to door' },
              ]}
            />
            <Select
              label="Cargo type"
              value={form.cargoType}
              onChange={(v) => setForm((p) => ({ ...p, cargoType: (v as any) ?? 'general' }))}
              data={CARGO_OPTIONS as any}
            />
          </Group>

          <Group grow align="flex-end">
            <TextInput
              label="Pickup address (optional)"
              placeholder="Street, city"
              value={String(form.pickupAddress ?? '')}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((p) => ({ ...p, pickupAddress: v }));
              }}
            />
            <TextInput
              label="Pickup contact phone (optional)"
              placeholder="If different"
              value={String(form.pickupContactPhone ?? '')}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((p) => ({ ...p, pickupContactPhone: v }));
              }}
            />
          </Group>

          <Textarea
            label="Notes (optional)"
            minRows={2}
            value={String(form.notes ?? '')}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setForm((p) => ({ ...p, notes: v }));
            }}
          />

          <Group grow align="flex-end">
            <FileInput
              label="Pickup photos (optional)"
              placeholder="Take / choose photos"
              accept="image/*"
              multiple
              value={photos}
              onChange={(v) => setPhotos(v)}
            />

            <FileInput
              label="Signature photo (optional)"
              placeholder="Choose image…"
              accept="image/*"
              value={signature}
              onChange={setSignature}
            />
          </Group>

          <Group justify="flex-end">
            <Button variant="light" onClick={() => void saveToOutbox(false)} disabled={!canSave}>
              Save offline
            </Button>
            <Button onClick={() => void saveToOutbox(true)} disabled={!canSave || !online} loading={busy}>
              Save + Sync now
            </Button>
          </Group>

          {!online ? (
            <Text size="sm" c="dimmed">
              You’re offline — “Save + Sync” is disabled. Use “Save offline” and sync later.
            </Text>
          ) : null}
        </Stack>
      </Paper>

      <Divider />

      <Group justify="space-between">
        <Text fw={700}>Outbox</Text>
        <Group>
          <Button variant="light" onClick={() => void reloadOutbox()} loading={busy}>
            Refresh
          </Button>
          <Button onClick={() => void syncAll()} loading={busy} disabled={!online}>
            Sync pending
          </Button>
        </Group>
      </Group>

      <Paper withBorder p="md" radius="md">
        {items.length === 0 ? (
          <Text size="sm" c="dimmed">
            No offline items yet.
          </Text>
        ) : (
          <Table withRowBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>When</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Destination</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{fmtWhen(it.created_at)}</Table.Td>
                  <Table.Td>{it.payload.customerName}</Table.Td>
                  <Table.Td>{it.payload.destination}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={it.status === 'synced' ? 'green' : it.status === 'failed' ? 'red' : it.status === 'syncing' ? 'blue' : 'gray'}
                    >
                      {it.status}
                    </Badge>
                    {it.server?.trackingCode ? <Text size="xs" c="dimmed">{it.server.trackingCode}</Text> : null}
                    {it.error ? <Text size="xs" c="red">{it.error}</Text> : null}
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end" gap="xs">
                      <Button size="xs" variant="light" onClick={() => void syncOne(it.id)} disabled={!online || it.status === 'synced' || busy}>
                        Sync
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={async () => {
                          await outboxDelete(it.id);
                          await reloadOutbox();
                        }}
                        disabled={busy}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
