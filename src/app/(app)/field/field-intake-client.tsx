'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Collapse,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCamera,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconRefresh,
  IconSignature,
} from '@tabler/icons-react';
import {
  safeUuid,
  type IntakePayload,
  outboxList,
  outboxPut,
  outboxUpdateStatus,
} from '@/lib/offline/outbox';
import { DestinationPicker, type OrgDestination } from '@/app/(app)/_components/DestinationPicker';
import { countryFlag, getCountryCode } from '@/lib/countries';

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const day = d.getDate();
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const time = d
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\b(am|pm)\b/, s => s.toUpperCase());
  return `${day} ${mon}, ${time}`;
}

function dataUrlToFile(dataUrl: string): File {
  const [header, data] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], 'signature.png', { type: mime });
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
    vehicleKeysReceived: null,
    keysReceived: null,
    occurredAtISO: null,
  };
}

// ── Signature modal ────────────────────────────────────────────────────────────

function SignatureModal({
  opened,
  onClose,
  onSave,
}: {
  opened: boolean;
  onClose: () => void;
  onSave: (file: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (!opened) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [opened]);

  function getPos(e: React.MouseEvent | React.TouchEvent, c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect();
    const sx = c.width / r.width;
    const sy = c.height / r.height;
    if ('touches' in e) {
      return { x: (e.touches[0].clientX - r.left) * sx, y: (e.touches[0].clientY - r.top) * sy };
    }
    return {
      x: ((e as React.MouseEvent).clientX - r.left) * sx,
      y: ((e as React.MouseEvent).clientY - r.top) * sy,
    };
  }

  function start(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const c = canvasRef.current;
    if (!c) return;
    drawing.current = true;
    const p = getPos(e, c);
    c.getContext('2d')!.beginPath();
    c.getContext('2d')!.moveTo(p.x, p.y);
  }

  function move(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    e.preventDefault();
    if (!drawing.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const p = getPos(e, c);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }

  function end() { drawing.current = false; }

  function clear() {
    const c = canvasRef.current;
    if (!c) return;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  }

  function save() {
    const c = canvasRef.current;
    if (!c) return;
    onSave(dataUrlToFile(c.toDataURL('image/png')));
    onClose();
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Add signature" size="sm" centered>
      <Stack>
        <Box
          style={{
            border: '1.5px solid var(--mantine-color-gray-3)',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fafafa',
          }}
        >
          <canvas
            ref={canvasRef}
            width={480}
            height={200}
            style={{ width: '100%', display: 'block', cursor: 'crosshair', touchAction: 'none' }}
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={end}
            onMouseLeave={end}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={end}
          />
        </Box>
        <Group justify="space-between">
          <Button variant="subtle" color="gray" size="sm" onClick={clear}>Clear</Button>
          <Button size="sm" onClick={save}>Confirm signature</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Outbox card ────────────────────────────────────────────────────────────────

function OutboxCard({
  item,
  canSync,
  busy,
  onSync,
}: {
  item: any;
  canSync: boolean;
  busy: boolean;
  onSync: (id: string) => void;
}) {
  const name = normStr(item.payload?.customerName);
  const dest = normStr(item.payload?.destination);
  const cc = getCountryCode(dest);
  const flag = countryFlag(cc);
  const isSynced = item.status === 'synced';
  const trackingCode: string | undefined = item.server?.trackingCode;

  return (
    <Card withBorder radius="md" py="sm" px="md">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0 }}>
          <Box
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--mantine-color-gray-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              fontSize: flag ? 18 : 11,
              fontWeight: 700,
              fontFamily: 'var(--mantine-font-family-monospace)',
              color: 'var(--mantine-color-gray-6)',
            }}
          >
            {flag || cc}
          </Box>
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={600} size="sm" truncate>{toTitleCase(name) || '—'}</Text>
            <Group gap={4} wrap="nowrap">
              <Text size="xs" c="dimmed" truncate>{dest || '—'}</Text>
              {trackingCode && (
                <>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>·</Text>
                  <Text size="xs" c="dimmed" ff="monospace" style={{ flexShrink: 0 }}>{trackingCode}</Text>
                </>
              )}
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>·</Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{fmtTs(item.created_at)}</Text>
            </Group>
            {item.error && (
              <Text size="xs" c="red" truncate>{String(item.error)}</Text>
            )}
          </Stack>
        </Group>

        {isSynced ? (
          <Badge
            variant="light"
            color="green"
            size="sm"
            leftSection={<IconCheck size={10} />}
            style={{ flexShrink: 0 }}
          >
            Synced
          </Badge>
        ) : (
          <Button
            size="xs"
            variant="light"
            onClick={() => onSync(item.id)}
            disabled={!canSync || busy}
            style={{ flexShrink: 0 }}
          >
            Sync
          </Button>
        )}
      </Group>
    </Card>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function FieldIntakeClient() {
  const [form, setForm] = useState<IntakePayload>(() => makeBlankForm());
  const [photos, setPhotos] = useState<File[]>([]);
  const [signature, setSignature] = useState<File | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [destinations, setDestinations] = useState<OrgDestination[]>([]);
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [sigOpen, setSigOpen] = useState(false);

  const photoRef = useRef<HTMLInputElement>(null);
  const syncingRef = useRef(false);
  const autoSyncArmedRef = useRef(false);

  const canSync = online === true;
  const showQuantity = form.cargoType === 'barrel' || form.cargoType === 'box';
  const showDims = form.cargoType === 'crate' || form.cargoType === 'pallet' || form.cargoType === 'machinery';
  const showVehicle = form.cargoType === 'vehicle';

  const pendingOnlyCount = items.filter((x) => x.status === 'pending').length;
  const failedCount = items.filter((x) => x.status === 'failed').length;
  const canSyncAll = canSync && (pendingOnlyCount > 0 || failedCount > 0) && !busy;

  // Load destinations
  useEffect(() => {
    fetch('/api/destinations')
      .then(r => r.json())
      .then(j => {
        const dests: OrgDestination[] = (j.destinations ?? []).map((d: any) => ({ id: d.id, name: String(d.name) }));
        if (dests.length) setDestinations(dests);
      })
      .catch(() => {});
  }, []);

  async function reloadOutbox() {
    try {
      const list = await outboxList('intake_create');
      setItems(list);
    } catch (e: any) {
      console.warn('[outboxList] failed', e?.message ?? e);
    }
  }

  async function syncOne(id: string, opts?: { manageBusy?: boolean; silent?: boolean }) {
    const manageBusy = opts?.manageBusy ?? true;
    const silent = opts?.silent ?? false;
    if (!canSync) return;
    if (manageBusy) setBusy(true);
    try {
      const target = (await outboxList('intake_create')).find(x => x.id === id);
      if (!target) return;
      await outboxUpdateStatus(id, { status: 'syncing', error: null });
      await reloadOutbox();
      const fd = new FormData();
      fd.set('clientEventId', String(target.id));
      fd.set('payload', JSON.stringify(target.payload ?? {}));
      for (const f of target.photos ?? []) fd.append('photos', f);
      if (target.signature) fd.set('signature', target.signature);
      const res = await fetch('/api/field/intake', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        const msg = json?.error || `Request failed (${res.status})`;
        await outboxUpdateStatus(id, { status: 'failed', error: msg });
        await reloadOutbox();
        if (!silent) notifications.show({ title: 'Sync failed', message: msg, color: 'red' });
        return;
      }
      await outboxUpdateStatus(id, {
        status: 'synced',
        server: { shipmentId: json.shipmentId, trackingCode: json.trackingCode },
        error: null,
      });
      await reloadOutbox();
      if (!silent) {
        notifications.show({
          title: 'Synced',
          message: `Created shipment ${json.trackingCode ?? ''}`.trim(),
          color: 'green',
        });
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Request failed';
      await outboxUpdateStatus(id, { status: 'failed', error: msg });
      await reloadOutbox();
      if (!silent) notifications.show({ title: 'Sync failed', message: msg, color: 'red' });
    } finally {
      if (manageBusy) setBusy(false);
    }
  }

  async function syncAll(opts?: { includeFailed?: boolean; silent?: boolean }) {
    const includeFailed = opts?.includeFailed ?? true;
    const silent = opts?.silent ?? false;
    if (!canSync) return;
    if (syncingRef.current) return;
    syncingRef.current = true;
    setBusy(true);
    try {
      const list = await outboxList('intake_create');
      const pend = list.filter(x => x.status === 'pending' || (includeFailed && x.status === 'failed'));
      autoSyncArmedRef.current = false;
      for (const it of pend) {
        await syncOne(it.id, { manageBusy: false, silent: true });
      }
      if (!silent && pend.length) {
        notifications.show({ title: 'Outbox sync complete', message: `Processed ${pend.length} item(s)`, color: 'green' });
      }
    } finally {
      setBusy(false);
      syncingRef.current = false;
    }
  }

  useEffect(() => {
    const apply = () => {
      const isOn = navigator.onLine;
      setOnline(isOn);
      if (isOn) {
        void reloadOutbox().then(() => { autoSyncArmedRef.current = true; });
      }
    };
    window.addEventListener('online', apply);
    window.addEventListener('offline', apply);
    apply();
    void reloadOutbox();
    return () => {
      window.removeEventListener('online', apply);
      window.removeEventListener('offline', apply);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!canSync || busy || syncingRef.current || pendingOnlyCount <= 0 || !autoSyncArmedRef.current) return;
    const t = window.setTimeout(() => { void syncAll({ includeFailed: false, silent: true }); }, 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync, busy, pendingOnlyCount]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')),
    [items]
  );

  async function saveToOutbox() {
    const customerName = normStr(form.customerName);
    const phone = normStr(form.phone);
    const destination = normStr(form.destination);

    if (customerName.length < 2) {
      notifications.show({ title: 'Missing info', message: 'Customer name is required', color: 'red' });
      return;
    }
    const digitCount = (phone.match(/\d/g) ?? []).length;
    if (digitCount < 7) {
      notifications.show({ title: 'Missing info', message: 'Enter at least 7 digits', color: 'red' });
      return;
    }
    if (destination.length < 2) {
      notifications.show({ title: 'Missing info', message: 'Destination is required', color: 'red' });
      return;
    }

    const keysReceivedBool =
      form.keysReceived === null || form.keysReceived === undefined ? null : Boolean(form.keysReceived);

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
      forkliftRequired: form.forkliftRequired === null || form.forkliftRequired === undefined ? null : Boolean(form.forkliftRequired),
      handlingNotes: normOptStr(form.handlingNotes),
      vehicleMake: normOptStr(form.vehicleMake),
      vehicleModel: normOptStr(form.vehicleModel),
      vehicleYear: normOptStr(form.vehicleYear),
      vehicleVin: normOptStr(form.vehicleVin),
      vehicleReg: normOptStr(form.vehicleReg),
      keysReceived: keysReceivedBool,
      vehicleKeysReceived: keysReceivedBool,
      occurredAtISO: form.occurredAtISO ?? new Date().toISOString(),
    };

    const id = safeUuid();
    await outboxPut({ id, kind: 'intake_create', status: 'pending', created_at: new Date().toISOString(), payload, photos: photos ?? [], signature });

    notifications.show({
      title: 'Saved to outbox',
      message: canSync ? 'Syncing…' : "Will sync when you're back online",
      color: 'teal',
    });

    setForm(makeBlankForm());
    setPhotos([]);
    setSignature(null);
    setShowOptional(false);
    await reloadOutbox();

    if (canSync) {
      autoSyncArmedRef.current = true;
      void syncOne(id);
    }
  }

  const pendingLabel = pendingOnlyCount + failedCount;

  return (
    <>
      <SignatureModal opened={sigOpen} onClose={() => setSigOpen(false)} onSave={setSignature} />
      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        style={{ display: 'none' }}
        onChange={e => {
          const files = Array.from(e.target.files ?? []);
          setPhotos(prev => [...prev, ...files].slice(0, 10));
          e.target.value = '';
        }}
      />

      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text fw={700} size="xl">New collection</Text>
            <Text size="sm" c="dimmed">Works offline — syncs when you're back online</Text>
          </Stack>
          <Badge
            variant="dot"
            color={online === true ? 'green' : online === false ? 'orange' : 'gray'}
            size="sm"
            style={{ marginTop: 4 }}
          >
            {online === true ? 'Online' : online === false ? 'Offline' : '…'}
          </Badge>
        </Group>

        {/* Form card */}
        <Card withBorder radius="md" p="md">
          <Stack gap="sm">
            <Text size="xs" fw={600} c="dimmed" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Customer info
            </Text>

            <TextInput
              label="Customer name"
              required
              placeholder="e.g. Andre Brown"
              value={form.customerName}
              onChange={e => setForm(p => ({ ...p, customerName: e.currentTarget.value }))}
            />

            {/* Phone — free-text, monospace, digit validation */}
            {(() => {
              const digitCount = (form.phone.match(/\d/g) ?? []).length;
              const showWarn = phoneBlurred && digitCount > 0 && digitCount < 7;
              return (
                <Stack gap={4}>
                  <TextInput
                    label="Phone"
                    required
                    type="tel"
                    placeholder="+44 7956 123456"
                    value={form.phone}
                    onChange={e => { const v = e.currentTarget.value.replace(/[^0-9 +\-()]/g, ''); setForm(p => ({ ...p, phone: v })); }}
                    onBlur={() => setPhoneBlurred(true)}
                    styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
                  />
                  {showWarn && <Text size="xs" c="yellow.7">Enter at least 7 digits</Text>}
                  <Text size="xs" c="dimmed">Any format — include country code for international</Text>
                </Stack>
              );
            })()}

            {/* Destination — shared picker with Other country */}
            <Stack gap={4}>
              <Group gap={4}>
                <Text size="sm" fw={500}>Destination</Text>
                <Text size="sm" c="red">*</Text>
              </Group>
              <DestinationPicker
                orgDestinations={destinations}
                value={form.destination}
                onChange={v => setForm(p => ({ ...p, destination: v }))}
              />
            </Stack>

            {/* Service / Cargo type */}
            <SimpleGrid cols={2} spacing="sm">
              <Select
                label="Service type"
                value={form.serviceType}
                onChange={v => setForm(p => ({ ...p, serviceType: (v ?? 'depot') as IntakePayload['serviceType'] }))}
                data={[
                  { value: 'depot', label: 'Depot' },
                  { value: 'door_to_door', label: 'Door to Door' },
                ]}
              />
              <Select
                label="Cargo type"
                value={form.cargoType}
                onChange={v => setForm(p => ({ ...p, cargoType: (v ?? 'general') as IntakePayload['cargoType'] }))}
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
            </SimpleGrid>

            {/* Quantity (barrel/box) */}
            {showQuantity && (
              <NumberInput
                label="Quantity"
                min={0}
                value={form.quantity ?? ''}
                onChange={v => setForm(p => ({ ...p, quantity: typeof v === 'number' ? v : null }))}
              />
            )}

            {/* Dimensions (crate/pallet/machinery) */}
            {showDims && (
              <Paper withBorder p="sm" radius="md">
                <Stack gap="sm">
                  <Text fw={600} size="sm">Cargo dimensions</Text>
                  <NumberInput
                    label="Weight (kg)"
                    min={0}
                    value={form.weightKg ?? ''}
                    onChange={v => setForm(p => ({ ...p, weightKg: typeof v === 'number' ? v : null }))}
                  />
                  <Group grow>
                    <NumberInput label="Length (cm)" min={0} value={form.lengthCm ?? ''} onChange={v => setForm(p => ({ ...p, lengthCm: typeof v === 'number' ? v : null }))} />
                    <NumberInput label="Width (cm)" min={0} value={form.widthCm ?? ''} onChange={v => setForm(p => ({ ...p, widthCm: typeof v === 'number' ? v : null }))} />
                    <NumberInput label="Height (cm)" min={0} value={form.heightCm ?? ''} onChange={v => setForm(p => ({ ...p, heightCm: typeof v === 'number' ? v : null }))} />
                  </Group>
                  <Checkbox label="Forklift required" checked={Boolean(form.forkliftRequired)} onChange={e => setForm(p => ({ ...p, forkliftRequired: e.currentTarget.checked }))} />
                  <Textarea label="Handling notes (optional)" minRows={2} value={form.handlingNotes ?? ''} onChange={e => setForm(p => ({ ...p, handlingNotes: e.currentTarget.value }))} />
                </Stack>
              </Paper>
            )}

            {/* Vehicle details */}
            {showVehicle && (
              <Paper withBorder p="sm" radius="md">
                <Stack gap="sm">
                  <Text fw={600} size="sm">Vehicle details</Text>
                  <Group grow>
                    <TextInput label="Make" value={form.vehicleMake ?? ''} onChange={e => setForm(p => ({ ...p, vehicleMake: e.currentTarget.value }))} />
                    <TextInput label="Model" value={form.vehicleModel ?? ''} onChange={e => setForm(p => ({ ...p, vehicleModel: e.currentTarget.value }))} />
                    <TextInput label="Year" value={form.vehicleYear ?? ''} onChange={e => setForm(p => ({ ...p, vehicleYear: e.currentTarget.value }))} />
                  </Group>
                  <Group grow>
                    <TextInput label="VIN" value={form.vehicleVin ?? ''} onChange={e => setForm(p => ({ ...p, vehicleVin: e.currentTarget.value }))} />
                    <TextInput label="Reg" value={form.vehicleReg ?? ''} onChange={e => setForm(p => ({ ...p, vehicleReg: e.currentTarget.value }))} />
                  </Group>
                  <Checkbox label="Keys received" checked={Boolean(form.keysReceived)} onChange={e => { const c = e.currentTarget.checked; setForm(p => ({ ...p, keysReceived: c, vehicleKeysReceived: c })); }} />
                  <Textarea label="Handling notes (optional)" minRows={2} value={form.handlingNotes ?? ''} onChange={e => setForm(p => ({ ...p, handlingNotes: e.currentTarget.value }))} />
                </Stack>
              </Paper>
            )}

            {/* Photo + Signature cards */}
            <SimpleGrid cols={2} spacing="sm">
              <UnstyledButton onClick={() => photoRef.current?.click()} style={{ display: 'block', width: '100%' }}>
                <Box
                  style={{
                    border: `2px ${photos.length > 0 ? 'solid' : 'dashed'} ${photos.length > 0 ? 'var(--mantine-color-green-5)' : 'var(--mantine-color-gray-4)'}`,
                    borderRadius: 8,
                    background: photos.length > 0 ? 'var(--mantine-color-green-0)' : 'transparent',
                    padding: '16px 8px',
                    minHeight: 90,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <IconCamera size={24} color={photos.length > 0 ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-5)'} />
                  {photos.length > 0 ? (
                    <>
                      <Text size="sm" fw={600} c="green">{photos.length} photo{photos.length > 1 ? 's' : ''}</Text>
                      <Text size="xs" c="dimmed">Tap to add more</Text>
                    </>
                  ) : (
                    <Text size="sm" c="dimmed">Add photos</Text>
                  )}
                </Box>
              </UnstyledButton>

              <UnstyledButton onClick={() => setSigOpen(true)} style={{ display: 'block', width: '100%' }}>
                <Box
                  style={{
                    border: `2px ${signature ? 'solid' : 'dashed'} ${signature ? 'var(--mantine-color-green-5)' : 'var(--mantine-color-gray-4)'}`,
                    borderRadius: 8,
                    background: signature ? 'var(--mantine-color-green-0)' : 'transparent',
                    padding: '16px 8px',
                    minHeight: 90,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                    cursor: 'pointer',
                  }}
                >
                  <IconSignature size={24} color={signature ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-gray-5)'} />
                  {signature ? (
                    <Text size="sm" fw={600} c="green">Signed</Text>
                  ) : (
                    <Text size="sm" c="dimmed">Add signature</Text>
                  )}
                </Box>
              </UnstyledButton>
            </SimpleGrid>

            {/* Optional fields toggle */}
            <UnstyledButton onClick={() => setShowOptional(v => !v)}>
              <Group gap={6}>
                <IconPlus size={14} color="var(--mantine-color-blue-6)" />
                <Text size="sm" c="blue">Pickup address, notes, contact phone</Text>
                {showOptional
                  ? <IconChevronUp size={14} color="var(--mantine-color-blue-6)" />
                  : <IconChevronDown size={14} color="var(--mantine-color-blue-6)" />}
              </Group>
            </UnstyledButton>

            <Collapse in={showOptional}>
              <Stack gap="sm" pt="xs">
                <TextInput
                  label="Pickup address"
                  placeholder="Street, city"
                  value={form.pickupAddress ?? ''}
                  onChange={e => setForm(p => ({ ...p, pickupAddress: e.currentTarget.value }))}
                />
                <Textarea
                  label="Notes"
                  minRows={2}
                  value={form.notes ?? ''}
                  onChange={e => setForm(p => ({ ...p, notes: e.currentTarget.value }))}
                />
                <TextInput
                  label="Pickup contact phone"
                  placeholder="If different from customer"
                  inputMode="tel"
                  value={form.pickupContactPhone ?? ''}
                  onChange={e => setForm(p => ({ ...p, pickupContactPhone: e.currentTarget.value }))}
                />
              </Stack>
            </Collapse>
          </Stack>
        </Card>

        {/* Action buttons */}
        <Button size="md" fullWidth onClick={saveToOutbox} disabled={busy}>
          Save to outbox
        </Button>
        <Button
          size="sm"
          fullWidth
          variant="default"
          leftSection={<IconRefresh size={14} />}
          onClick={() => void syncAll({ includeFailed: true })}
          loading={busy}
          disabled={!canSyncAll}
        >
          {busy ? 'Syncing…' : `Sync outbox (${pendingLabel} pending)`}
        </Button>

        {/* Recent collections */}
        {sortedItems.length > 0 && (
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={600} size="sm">Recent collections</Text>
              <Text size="xs" c="dimmed">{sortedItems.length} total</Text>
            </Group>
            {sortedItems.map(item => (
              <OutboxCard
                key={item.id}
                item={item}
                canSync={canSync}
                busy={busy}
                onSync={id => void syncOne(id)}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}
