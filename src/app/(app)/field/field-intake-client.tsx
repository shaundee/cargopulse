'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Checkbox,
  FileInput,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCloud,
  IconCloudUpload,
  IconDeviceFloppy,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';

import {
  safeUuid,
  type IntakePayload,
  outboxDelete,
  outboxList,
  outboxPut,
  outboxUpdateStatus,
} from '@/lib/offline/outbox';

function fmtWhenStable(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  // stable across server/client (UTC)
  return d.toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

function toFileArray(v: unknown): File[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x): x is File => x instanceof File);
  if (v instanceof File) return [v];
  return [];
}

function toSingleFile(v: unknown): File | null {
  const arr = toFileArray(v);
  return arr[0] ?? null;
}

function normStr(v: unknown): string {
  return String(v ?? '').trim();
}

function normOptStr(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s ? s : null;
}

function numOrNull(v: unknown): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function makeBlankForm(): IntakePayload {
  return {
    customerName: '',
    phone: '',
    destination: '',
    serviceType: 'depot',
    cargoType: 'general',

    pickupAddress: null,
    pickupContactPhone: null,
    notes: null,

    quantity: null,

    weightKg: null,
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    forkliftRequired: null,
    handlingNotes: null,

    vehicleMake: null,
    vehicleModel: null,
    vehicleYear: null,
    vehicleVin: null,
    vehicleReg: null,
    keysReceived: null,

    occurredAtISO: null,
  };
}

export function FieldIntakeClient() {
  const [form, setForm] = useState<IntakePayload>(() => makeBlankForm());
  const [photos, setPhotos] = useState<File[]>([]);
  const [signature, setSignature] = useState<File | null>(null);

  const [online, setOnline] = useState<boolean | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const canSync = online === true;

  async function reloadOutbox() {
    try {
      const list = await outboxList('intake_create');
      setItems(list);
    } catch (e: any) {
      console.warn('[outboxList] failed', e?.message ?? e);
    }
  }

  useEffect(() => {
    // Avoid hydration mismatch by not rendering Online/Offline until after mount.
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

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  }, [items]);

  async function saveToOutbox() {
    const customerName = normStr(form.customerName);
    const phone = normStr(form.phone);
    const destination = normStr(form.destination);

    if (customerName.length < 2) {
      notifications.show({ title: 'Missing info', message: 'Customer name is required', color: 'red' });
      return;
    }
    if (phone.length < 6) {
      notifications.show({ title: 'Missing info', message: 'Phone is required', color: 'red' });
      return;
    }
    if (destination.length < 2) {
      notifications.show({ title: 'Missing info', message: 'Destination is required', color: 'red' });
      return;
    }

    const payload: IntakePayload = {
      ...form,
      customerName,
      phone,
      destination,
      pickupAddress: normOptStr(form.pickupAddress),
      pickupContactPhone: normOptStr(form.pickupContactPhone),
      notes: normOptStr(form.notes),

      quantity: numOrNull(form.quantity),

      weightKg: numOrNull(form.weightKg),
      lengthCm: numOrNull(form.lengthCm),
      widthCm: numOrNull(form.widthCm),
      heightCm: numOrNull(form.heightCm),
      forkliftRequired:
        form.forkliftRequired === null || form.forkliftRequired === undefined
          ? null
          : Boolean(form.forkliftRequired),
      handlingNotes: normOptStr(form.handlingNotes),

      vehicleMake: normOptStr(form.vehicleMake),
      vehicleModel: normOptStr(form.vehicleModel),
      vehicleYear: normOptStr(form.vehicleYear),
      vehicleVin: normOptStr(form.vehicleVin),
      vehicleReg: normOptStr(form.vehicleReg),
      keysReceived:
        form.keysReceived === null || form.keysReceived === undefined ? null : Boolean(form.keysReceived),

      occurredAtISO: form.occurredAtISO ?? new Date().toISOString(),
    };

    const id = safeUuid();

    await outboxPut({
      id,
      kind: 'intake_create',
      status: 'pending',
      created_at: new Date().toISOString(),
      payload,
      photos: photos ?? [],
      signature,
    });

    notifications.show({
      title: 'Saved',
      message: canSync ? 'Saved to outbox. Syncing…' : 'Saved to outbox. You can sync when online.',
      color: 'green',
    });

    setForm(makeBlankForm());
    setPhotos([]);
    setSignature(null);

    await reloadOutbox();

    if (canSync) void syncOne(id);
  }

  async function syncOne(id: string) {
    setBusy(true);

    try {
      const target = (await outboxList('intake_create')).find((x) => x.id === id);
      if (!target) return;

      await outboxUpdateStatus(id, { status: 'syncing', error: null });
      await reloadOutbox();

      const fd = new FormData();
      fd.set('clientEventId', String(target.id));
      fd.set('payload', JSON.stringify(target.payload ?? {}));

      for (const f of toFileArray(target.photos)) fd.append('photos', f);
      const sig = toSingleFile(target.signature);
      if (sig) fd.set('signature', sig);

      const res = await fetch('/api/field/intake', { method: 'POST', body: fd });
      const json = await res.json().catch(() => null);

      if (!res.ok) throw new Error(json?.error ?? `Sync failed (${res.status})`);

      await outboxUpdateStatus(id, {
        status: 'synced',
        error: null,
        server: {
          shipmentId: json?.shipmentId ?? null,
          trackingCode: json?.trackingCode ?? null,
        },
      });

      notifications.show({
        title: 'Synced',
        message: json?.trackingCode ? `Created ${json.trackingCode}` : 'Synced successfully',
        color: 'green',
      });

      await reloadOutbox();
    } catch (e: any) {
      await outboxUpdateStatus(id, { status: 'failed', error: e?.message ?? 'Sync failed' });
      await reloadOutbox();

      notifications.show({
        title: 'Sync failed',
        message: e?.message ?? 'Request failed',
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  }

  async function syncAll() {
    if (!canSync) return;

    setBusy(true);
    try {
      const list = await outboxList('intake_create');
      const pend = list.filter((x) => x.status === 'pending' || x.status === 'failed');
      for (const it of pend) {
        // eslint-disable-next-line no-await-in-loop
        await syncOne(it.id);
      }
    } finally {
      setBusy(false);
    }
  }

  const showQuantity = form.cargoType === 'barrel' || form.cargoType === 'box';
  const showDims = form.cargoType === 'crate' || form.cargoType === 'pallet' || form.cargoType === 'machinery';
  const showVehicle = form.cargoType === 'vehicle';
const pendingCount = items.filter(
  (x) => x.status === 'pending' || x.status === 'failed'
).length;

const canSyncAll = online === true && pendingCount > 0 && !busy;

  return (
    <Stack gap="md">
    <Group justify="space-between" align="center" wrap="wrap">
  <Stack gap={2}>
    <Text fw={700} size="lg">Field intake</Text>
    <Text c="dimmed" size="sm">
      Offline-first collections: save to outbox when offline, then sync when online.
    </Text>
  </Stack>

  <Group gap="xs" ml="auto">
    <Badge variant="light" color={online === true ? 'green' : online === false ? 'orange' : 'gray'}>
      {online === true ? 'ONLINE' : online === false ? 'OFFLINE' : '…'}
    </Badge>

    <Button
      size="xs"
      variant="light"
      leftSection={<IconCloudUpload size={14} />}
      onClick={syncAll}
      disabled={!canSyncAll}
      loading={busy}
    >
      Sync outbox
    </Button>

  
  </Group>
</Group>


      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Text fw={700}>New collection</Text>

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
            label="Phone"
            placeholder="e.g., 07956…"
            value={form.phone}
            onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, phone: v }));
}}

          />

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
              onChange={(v) =>
                setForm((p) => ({
                  ...p,
                  serviceType: (v ?? 'depot') as IntakePayload['serviceType'],
                }))
              }
              data={[
                { value: 'depot', label: 'Depot' },
                { value: 'door_to_door', label: 'Door to door' },
              ]}
            />
          </Group>

          <Select
            label="Cargo type"
            value={form.cargoType}
            onChange={(v) =>
              setForm((p) => ({
                ...p,
                cargoType: (v ?? 'general') as IntakePayload['cargoType'],
              }))
            }
            data={[
              { value: 'general', label: 'General' },
              { value: 'barrel', label: 'Barrel' },
              { value: 'box', label: 'Box' },
              { value: 'crate', label: 'Crate' },
              { value: 'pallet', label: 'Pallet' },
              { value: 'vehicle', label: 'Vehicle' },
              { value: 'machinery', label: 'Machinery' },
              { value: 'mixed', label: 'Mixed' },
              { value: 'other', label: 'Other' },
            ]}
          />

          {showQuantity ? (
            <NumberInput
              label="Quantity"
              min={0}
              value={form.quantity ?? ''}
              onChange={(v) => setForm((p) => ({ ...p, quantity: typeof v === 'number' ? v : null }))}
            />
          ) : null}

          {showDims ? (
            <Paper withBorder p="sm" radius="md">
              <Stack gap="sm">
                <Text fw={600}>Cargo dimensions</Text>

                <NumberInput
                  label="Weight (kg)"
                  min={0}
                  value={form.weightKg ?? ''}
                  onChange={(v) => setForm((p) => ({ ...p, weightKg: typeof v === 'number' ? v : null }))}
                />

                <Group grow>
                  <NumberInput
                    label="Length (cm)"
                    min={0}
                    value={form.lengthCm ?? ''}
                    onChange={(v) => setForm((p) => ({ ...p, lengthCm: typeof v === 'number' ? v : null }))}
                  />
                  <NumberInput
                    label="Width (cm)"
                    min={0}
                    value={form.widthCm ?? ''}
                    onChange={(v) => setForm((p) => ({ ...p, widthCm: typeof v === 'number' ? v : null }))}
                  />
                  <NumberInput
                    label="Height (cm)"
                    min={0}
                    value={form.heightCm ?? ''}
                    onChange={(v) => setForm((p) => ({ ...p, heightCm: typeof v === 'number' ? v : null }))}
                  />
                </Group>

                <Checkbox
                  label="Forklift required"
                  checked={Boolean(form.forkliftRequired)}
           onChange={(e) => {
  const checked = e.currentTarget.checked;
  setForm((p) => ({ ...p, forkliftRequired: checked }));
}}

                />

                <Textarea
                  label="Handling notes (optional)"
                  minRows={2}
                  value={form.handlingNotes ?? ''}
                 onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, handlingNotes: v }));
}}

                  placeholder="Fragile parts, lifting points, strap notes…"
                />
              </Stack>
            </Paper>
          ) : null}

          {showVehicle ? (
            <Paper withBorder p="sm" radius="md">
              <Stack gap="sm">
                <Text fw={600}>Vehicle details</Text>

                <Group grow>
                  <TextInput
                    label="Make"
                    value={form.vehicleMake ?? ''}
                   onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, vehicleMake: v }));
}}

                  />
                  <TextInput
                    label="Model"
                    value={form.vehicleModel ?? ''}
                    onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, vehicleModel: v }));
}}

                  />
                  <TextInput
                    label="Year"
                    value={form.vehicleYear ?? ''}
                   onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, vehicleYear: v }));
}}

                  />
                </Group>

                <Group grow>
                  <TextInput
                    label="VIN"
                    value={form.vehicleVin ?? ''}
                   onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, vehicleVin: v }));
}}

                  />
                  <TextInput
                    label="Reg"
                    value={form.vehicleReg ?? ''}
                   onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, vehicleReg: v }));
}}

                  />
                </Group>

                <Checkbox
                  label="Keys received"
                  checked={Boolean(form.keysReceived)}
                 onChange={(e) => {
  const checked = e.currentTarget.checked;
  setForm((p) => ({ ...p, keysReceived: checked }));
}}

                />

                <Textarea
                  label="Handling notes (optional)"
                  minRows={2}
                  value={form.handlingNotes ?? ''}
                 onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, vehicleHandlingNotes: v }));
}}

                />
              </Stack>
            </Paper>
          ) : null}

          <TextInput
            label="Pickup address (optional)"
            placeholder="Street, city"
            value={form.pickupAddress ?? ''}
           onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, pickupAddress: v }));
}}

          />

          <TextInput
            label="Pickup contact phone (optional)"
            placeholder="If different from customer"
            value={form.pickupContactPhone ?? ''}
            onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, pickupContactPhone: v }));
}}

          />

          <Textarea
            label="Notes (optional)"
            minRows={2}
            value={form.notes ?? ''}
           onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((p) => ({ ...p, notes: v }));
}}

          />

          <FileInput
            multiple
            label="Pickup photos (optional)"
            placeholder="Take / choose photos"
            value={photos}
            onChange={(v) => setPhotos(toFileArray(v))}
          />

          <FileInput
            label="Signature (optional)"
            placeholder="Capture signature"
            value={signature}
            onChange={(v) => setSignature(toSingleFile(v))}
          />

          <Group justify="flex-end">
              <Button
      size="xs"
      variant="light"
      onClick={syncAll}
      disabled={!canSyncAll}
      loading={busy}
    >
      Sync all{pendingCount ? ` (${pendingCount})` : ''}
    </Button>
            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={saveToOutbox} disabled={busy}>
              Save to outbox
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" mb="sm">
          <Text fw={700}>Outbox</Text>
          <Button leftSection={<IconRefresh size={16} />} variant="subtle" onClick={reloadOutbox} disabled={busy}>
            Refresh
          </Button>
        </Group>

        {sortedItems.length ? (
          <Table withRowBorders withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>When</Table.Th>
                <Table.Th>Customer</Table.Th>
                <Table.Th>Destination</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Server</Table.Th>
                <Table.Th style={{ width: 220 }} />
              </Table.Tr>
            </Table.Thead>

            <Table.Tbody>
              {sortedItems.map((it) => (
                <Table.Tr key={it.id}>
                  <Table.Td>{fmtWhenStable(it.created_at)}</Table.Td>
                  <Table.Td>{it.payload?.customerName ?? '—'}</Table.Td>
                  <Table.Td>{it.payload?.destination ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge
                      variant="light"
                      color={it.status === 'synced' ? 'green' : it.status === 'failed' ? 'red' : it.status === 'syncing' ? 'blue' : 'gray'}
                    >
                      {String(it.status)}
                    </Badge>
                    {it.server?.trackingCode ? (
                      <Text size="xs" c="dimmed">
                        {it.server.trackingCode}
                      </Text>
                    ) : null}
                    {it.error ? (
                      <Text size="xs" c="red">
                        {String(it.error)}
                      </Text>
                    ) : null}
                  </Table.Td>
                  <Table.Td>
                    {it.server?.trackingCode ? (
                      <Text size="xs" c="dimmed">
                        {it.server.trackingCode}
                      </Text>
                    ) : (
                      <Text size="xs" c="dimmed">
                        —
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Group justify="flex-end" gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        onClick={() => void syncOne(it.id)}
                        disabled={!canSync || it.status === 'synced' || busy}
                      >
                        Sync
                      </Button>
                      <Button
                        size="xs"
                        variant="subtle"
                        color="red"
                        leftSection={<IconTrash size={14} />}
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
        ) : (
          <Text c="dimmed" size="sm">
            Nothing in the outbox yet.
          </Text>
        )}
      </Paper>
    </Stack>
  );
}
