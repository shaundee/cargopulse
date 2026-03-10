'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
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
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Table,
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
  IconTrash,
} from '@tabler/icons-react';
import {
  safeUuid,
  type IntakePayload,
  type CargoContentItem,
  type CollectPayload,
  outboxList,
  outboxPut,
  outboxUpdateStatus,
} from '@/lib/offline/outbox';
import { DestinationPicker, type OrgDestination } from '@/app/(app)/_components/DestinationPicker';
import { countryFlag, getCountryCode } from '@/lib/countries';
import { SignatureModal } from '@/components/SignatureCanvas';

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
    cargoContents: [],
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
  const trackingCode: string | undefined =
    item.server?.trackingCode ??
    (item.kind === 'collect_existing' ? (item.payload as any)?.trackingCode : undefined);

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

// ── Types ──────────────────────────────────────────────────────────────────────

type PendingPickup = {
  id: string;
  tracking_code: string;
  cargo_type: string;
  cargo_meta: Record<string, unknown> | null;
  created_at: string;
  customers: { name: string } | { name: string }[] | null;
};

type LookupResult =
  | { found: false }
  | {
      found: true;
      shipmentId: string;
      trackingCode: string;
      customerName: string;
      destination: string;
      serviceType: string;
      cargoType: string;
      cargoMeta: Record<string, unknown>;
    };

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

  // Pre-booked collection state
  const [collectMode, setCollectMode] = useState<'new' | 'pre_booked'>('new');
  const [codeInput, setCodeInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);

  // Pending pickups (door-to-door, received)
  const [pendingPickups, setPendingPickups] = useState<PendingPickup[]>([]);
  const [showPickups, setShowPickups] = useState(false);

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

  // Load destinations + pending pickups on mount
  useEffect(() => {
    fetch('/api/destinations')
      .then(r => r.json())
      .then(j => {
        const dests: OrgDestination[] = (j.destinations ?? []).map((d: any) => ({ id: d.id, name: String(d.name) }));
        if (dests.length) setDestinations(dests);
      })
      .catch(() => {});

    fetch('/api/field/pending-pickups', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (Array.isArray(j)) setPendingPickups(j); })
      .catch(() => {});
  }, []);

  async function reloadOutbox() {
    try {
      const list = await outboxList();
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
      const target = (await outboxList()).find(x => x.id === id);
      if (!target) return;
      await outboxUpdateStatus(id, { status: 'syncing', error: null });
      await reloadOutbox();
      const fd = new FormData();
      fd.set('clientEventId', String(target.id));
      fd.set('payload', JSON.stringify(target.payload ?? {}));
      for (const f of target.photos ?? []) fd.append('photos', f);
      if (target.signature) fd.set('signature', target.signature);
      const endpoint = target.kind === 'collect_existing' ? '/api/field/collect' : '/api/field/intake';
      const res = await fetch(endpoint, { method: 'POST', body: fd });
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
        const verb = target.kind === 'collect_existing' ? 'Collected' : 'Created shipment';
        notifications.show({
          title: 'Synced',
          message: `${verb} ${json.trackingCode ?? ''}`.trim(),
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
      const list = await outboxList();
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
      cargoContents: showQuantity
        ? (form.cargoContents ?? [])
            .filter((c: CargoContentItem) => c.category)
            .map((c: CargoContentItem) => ({
              category: c.category,
              description: c.description?.trim() || undefined,
              qty: c.qty > 0 ? c.qty : 1,
            }))
        : null,
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

  function handleModeChange(mode: 'new' | 'pre_booked') {
    setCollectMode(mode);
    setCodeInput('');
    setLookupResult(null);
    setPhotos([]);
    setSignature(null);
  }

  async function handleLookup() {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await fetch(`/api/field/lookup?code=${encodeURIComponent(code)}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        notifications.show({ title: 'Lookup failed', message: json?.error ?? `Error ${res.status}`, color: 'red' });
        return;
      }
      setLookupResult(json as LookupResult);
    } catch (e: any) {
      notifications.show({ title: 'Lookup failed', message: e?.message ?? 'Network error', color: 'red' });
    } finally {
      setLookupLoading(false);
    }
  }

  async function savePreBookedToOutbox() {
    if (!lookupResult?.found) {
      notifications.show({ title: 'No shipment selected', message: 'Look up a tracking code first', color: 'red' });
      return;
    }
    const r = lookupResult as Extract<LookupResult, { found: true }>;

    const payload: CollectPayload = {
      shipmentId: r.shipmentId,
      trackingCode: r.trackingCode,
      customerName: r.customerName,
      destination: r.destination,
      occurredAtISO: new Date().toISOString(),
    };

    const id = safeUuid();
    await outboxPut({
      id,
      kind: 'collect_existing',
      status: 'pending',
      created_at: new Date().toISOString(),
      payload,
      photos: photos ?? [],
      signature,
    });

    notifications.show({
      title: 'Saved to outbox',
      message: canSync ? 'Syncing…' : "Will sync when you're back online",
      color: 'teal',
    });

    setCodeInput('');
    setLookupResult(null);
    setPhotos([]);
    setSignature(null);
    await reloadOutbox();

    if (canSync) {
      autoSyncArmedRef.current = true;
      void syncOne(id);
    }
  }

  function pickupCustomerName(p: PendingPickup): string {
    const raw = p.customers;
    const c = Array.isArray(raw) ? raw[0] : raw;
    return c?.name ?? '—';
  }

  const pendingLabel = pendingOnlyCount + failedCount;

  // Shared photo + signature capture section (used in both modes)
  const photoSigSection = (
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
  );

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
            {/* Today's pickups — collapsible */}
            <UnstyledButton
              onClick={() => setShowPickups(v => !v)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Group gap={6}>
                <Text size="sm" fw={600}>Today's pickups</Text>
                <Badge size="sm" variant="light" color="blue">{pendingPickups.length}</Badge>
              </Group>
              {showPickups
                ? <IconChevronUp size={14} color="var(--mantine-color-gray-5)" />
                : <IconChevronDown size={14} color="var(--mantine-color-gray-5)" />}
            </UnstyledButton>

            <Collapse in={showPickups}>
              <Stack gap="xs" pb="xs">
                {pendingPickups.length === 0 ? (
                  <Text size="xs" c="dimmed">No pending pickups</Text>
                ) : (
                  pendingPickups.map(p => (
                    <UnstyledButton
                      key={p.id}
                      style={{ display: 'block', width: '100%' }}
                      onClick={() => {
                        setCollectMode('pre_booked');
                        setCodeInput(p.tracking_code);
                        setLookupResult(null);
                      }}
                    >
                      <Card withBorder radius="sm" p="sm" style={{ background: 'var(--mantine-color-gray-0)' }}>
                        <Group justify="space-between" wrap="nowrap">
                          <Stack gap={2} style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>{pickupCustomerName(p)}</Text>
                            <Text size="xs" c="dimmed" truncate>
                              {String((p.cargo_meta as any)?.pickup_address ?? 'No address')}
                            </Text>
                          </Stack>
                          <Badge size="xs" variant="light" color="gray" style={{ flexShrink: 0 }}>
                            {toTitleCase(p.cargo_type)}
                          </Badge>
                        </Group>
                      </Card>
                    </UnstyledButton>
                  ))
                )}
              </Stack>
            </Collapse>

            <SegmentedControl
              value={collectMode}
              onChange={v => handleModeChange(v as 'new' | 'pre_booked')}
              data={[
                { label: 'New collection', value: 'new' },
                { label: 'Collect pre-booked', value: 'pre_booked' },
              ]}
              fullWidth
            />

            {/* ── New collection ─────────────────────────────────────── */}
            {collectMode === 'new' && (<>
            <Text size="xs" fw={600} c="dimmed" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Customer info
            </Text>

            <TextInput
              label="Customer name"
              required
              placeholder="e.g. Andre Brown"
              value={form.customerName}
             onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, customerName: value }));
}}
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

            {/* Contents (barrel/box) */}
            {showQuantity && (
              <Paper withBorder p="sm" radius="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Text fw={600} size="sm">Contents</Text>
                    <Button
                      size="xs"
                      variant="light"
                      leftSection={<IconPlus size={12} />}
                      onClick={() =>
                        setForm(p => ({
                          ...p,
                          cargoContents: [
                            ...(p.cargoContents ?? []),
                            { category: 'Clothing', description: '', qty: 1 },
                          ],
                        }))
                      }
                    >
                      Add item
                    </Button>
                  </Group>

                  {(form.cargoContents ?? []).length === 0 && (
                    <Text size="xs" c="dimmed">No contents added. Tap "Add item" to list what's inside.</Text>
                  )}

                  {(form.cargoContents ?? []).map((item, i) => (
                    <Group key={i} align="flex-end" gap="xs" wrap="nowrap">
                      <Select
                        label="Category"
                        value={item.category}
                        onChange={v => {
                          const updated = [...(form.cargoContents ?? [])];
                          updated[i] = { ...updated[i], category: v ?? 'Clothing' };
                          setForm(p => ({ ...p, cargoContents: updated }));
                        }}
                        data={[
                          'Clothing',
                          'Food & Groceries',
                          'Electronics',
                          'Household Goods',
                          'Personal Care',
                          'Documents',
                          'Other',
                        ]}
                        style={{ flex: 2, minWidth: 0 }}
                      />
                      <TextInput
                        label="Description"
                        placeholder="e.g. jeans, tinned food"
                        value={item.description ?? ''}
                        onChange={e => {
                          const updated = [...(form.cargoContents ?? [])];
                          updated[i] = { ...updated[i], description: e.currentTarget.value };
                          setForm(p => ({ ...p, cargoContents: updated }));
                        }}
                        style={{ flex: 3, minWidth: 0 }}
                      />
                      <NumberInput
                        label="Qty"
                        min={1}
                        value={item.qty}
                        onChange={v => {
                          const updated = [...(form.cargoContents ?? [])];
                          updated[i] = { ...updated[i], qty: typeof v === 'number' && v > 0 ? v : 1 };
                          setForm(p => ({ ...p, cargoContents: updated }));
                        }}
                        style={{ width: 70, flexShrink: 0 }}
                      />
                      <ActionIcon
                        color="red"
                        variant="subtle"
                        mb={1}
                        onClick={() => {
                          const updated = (form.cargoContents ?? []).filter((_, idx) => idx !== i);
                          setForm(p => ({ ...p, cargoContents: updated }));
                        }}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  ))}
                </Stack>
              </Paper>
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
                  <Checkbox label="Forklift required" checked={Boolean(form.forkliftRequired)} onChange={e => {
  const checked = e.currentTarget.checked;
  setForm(p => ({ ...p, forkliftRequired: checked }));
}}/>
                  <Textarea label="Handling notes (optional)" minRows={2} value={form.handlingNotes ?? ''} onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, handlingNotes: value }));
}} />
                </Stack>
              </Paper>
            )}

            {/* Vehicle details */}
            {showVehicle && (
              <Paper withBorder p="sm" radius="md">
                <Stack gap="sm">
                  <Text fw={600} size="sm">Vehicle details</Text>
                  <Group grow>
                    <TextInput label="Make" value={form.vehicleMake ?? ''}onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, vehicleMake: value }));
}}/>
                    <TextInput label="Model" value={form.vehicleModel ?? ''}onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, vehicleMake: value }));
}}/>
                    <TextInput label="Year" value={form.vehicleYear ?? ''} onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, vehicleYear: value }));
}} />
                  </Group>
                  <Group grow>
                    <TextInput label="VIN" value={form.vehicleVin ?? ''} onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, vehicleVin: value }));
}} />
                    <TextInput label="Reg" value={form.vehicleReg ?? ''} onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, vehicleReg: value }));
}} />
                  </Group>
                  <Checkbox label="Keys received" checked={Boolean(form.keysReceived)} onChange={e => { const c = e.currentTarget.checked; setForm(p => ({ ...p, keysReceived: c, vehicleKeysReceived: c })); }} />
                  <Textarea label="Handling notes (optional)" minRows={2} value={form.handlingNotes ?? ''} onChange={e => setForm(p => ({ ...p, handlingNotes: e.currentTarget.value }))} />
                </Stack>
              </Paper>
            )}

            {/* Photo + Signature cards */}
            {photoSigSection}

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
                 onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, pickupAddress: value }));
}}
                />
                <Textarea
                  label="Notes"
                  minRows={2}
                  value={form.notes ?? ''}
                  onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, notes: value }));
}}
                />
                <TextInput
                  label="Pickup contact phone"
                  placeholder="If different from customer"
                  inputMode="tel"
                  value={form.pickupContactPhone ?? ''}
                 onChange={e => {
  const value = e.currentTarget.value;
  setForm(p => ({ ...p, pickupContactPhone: value }));
}}
                />
              </Stack>
            </Collapse>
            </>)}

            {/* ── Collect pre-booked ─────────────────────────────────── */}
            {collectMode === 'pre_booked' && (
              <Stack gap="sm">
                <Group gap="xs" align="flex-end">
                  <TextInput
                    label="Tracking code"
                    placeholder="SHP-XXXXXX"
                    value={codeInput}
                    onChange={e => setCodeInput(e.currentTarget.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') void handleLookup(); }}
                    styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', textTransform: 'uppercase' } }}
                    style={{ flex: 1 }}
                  />
                  <Button
                    loading={lookupLoading}
                    disabled={!codeInput.trim() || lookupLoading}
                    onClick={() => void handleLookup()}
                  >
                    Look up
                  </Button>
                </Group>

                {lookupResult && !lookupResult.found && (
                  <Text size="sm" c="red">No shipment found with that code.</Text>
                )}

                {lookupResult?.found && (
                  <Stack gap="sm">
                    <Paper withBorder p="sm" radius="md" style={{ background: 'var(--mantine-color-gray-0)' }}>
                      <Stack gap="xs">
                        <Text size="xs" fw={600} c="dimmed" style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                          Shipment details
                        </Text>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Customer</Text>
                          <Text size="sm" fw={600}>{lookupResult.customerName}</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Tracking</Text>
                          <Text size="sm" fw={600} ff="monospace">{lookupResult.trackingCode}</Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Destination</Text>
                          <Text size="sm" fw={600}>
                            {countryFlag(getCountryCode(lookupResult.destination))} {lookupResult.destination}
                          </Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Service</Text>
                          <Text size="sm" fw={600}>
                            {lookupResult.serviceType === 'door_to_door' ? 'Door to Door' : 'Depot'}
                          </Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm" c="dimmed">Cargo</Text>
                          <Text size="sm" fw={600}>{toTitleCase(lookupResult.cargoType)}</Text>
                        </Group>
                        {lookupResult.cargoMeta?.quantity != null && (
                          <Group justify="space-between">
                            <Text size="sm" c="dimmed">Quantity</Text>
                            <Text size="sm" fw={600}>{String(lookupResult.cargoMeta.quantity)}</Text>
                          </Group>
                        )}
                      </Stack>
                    </Paper>

                    {photoSigSection}
                  </Stack>
                )}
              </Stack>
            )}
          </Stack>
        </Card>

        {/* Action buttons */}
        {collectMode === 'new' ? (
          <Button size="md" fullWidth onClick={saveToOutbox} disabled={busy}>
            Save to outbox
          </Button>
        ) : (
          <Button
            size="md"
            fullWidth
            onClick={() => void savePreBookedToOutbox()}
            disabled={busy || !lookupResult?.found}
          >
            Save collection
          </Button>
        )}
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
