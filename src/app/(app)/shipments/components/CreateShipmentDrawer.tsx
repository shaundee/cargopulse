'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Collapse,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { IconCheck, IconChevronDown, IconChevronRight } from '@tabler/icons-react';

import { notifications } from '@mantine/notifications';
import { DestinationPicker, type OrgDestination } from '@/app/(app)/_components/DestinationPicker';
import { countryFlag, getCountryCode } from '@/lib/countries';
import { type PackingItem } from '@/lib/offline/outbox';
import { PackingListEditor } from './PackingListEditor';

const CARGO_TYPES = [
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

// ── Phone field ────────────────────────────────────────────────────────────────

function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [touched, setTouched] = useState(false);
  const digitCount = (value.match(/\d/g) ?? []).length;
  const showWarn = touched && digitCount > 0 && digitCount < 7;

  return (
    <Stack gap={4}>
      <TextInput
        label="Phone"
        required
        type="tel"
        placeholder="+44 7956 123456"
        value={value}
        onChange={e => onChange(e.currentTarget.value.replace(/[^0-9 +\-()]/g, ''))}
        onBlur={() => setTouched(true)}
        styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)' } }}
      />
      {showWarn && <Text size="xs" c="yellow.7">Enter at least 7 digits</Text>}
      <Text size="xs" c="dimmed">Any format — include country code for international</Text>
    </Stack>
  );
}

// ── Service type cards ─────────────────────────────────────────────────────────

const SERVICE_OPTIONS = [
  { value: 'depot' as const, emoji: '🏢', label: 'Depot', description: 'Customer collects from depot' },
  { value: 'door_to_door' as const, emoji: '🏠', label: 'Door to Door', description: 'Delivered to their address' },
];

function ServiceTypeCards({
  value,
  onChange,
}: {
  value: 'depot' | 'door_to_door';
  onChange: (v: 'depot' | 'door_to_door') => void;
}) {
  return (
    <SimpleGrid cols={2} spacing="sm">
      {SERVICE_OPTIONS.map(opt => {
        const selected = value === opt.value;
        return (
          <UnstyledButton
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              border: `1.5px solid ${selected ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-3)'}`,
              borderRadius: 8,
              padding: 12,
              background: selected ? 'var(--mantine-color-blue-0)' : 'transparent',
              transition: 'border-color 0.1s, background 0.1s',
              textAlign: 'left',
            }}
          >
            <Group gap="sm" align="flex-start" wrap="nowrap">
              <Text size="xl" style={{ lineHeight: 1.2 }}>{opt.emoji}</Text>
              <Stack gap={2}>
                <Text size="sm" fw={600} c={selected ? 'blue' : undefined}>{opt.label}</Text>
                <Text size="xs" c="dimmed" lh={1.4}>{opt.description}</Text>
              </Stack>
            </Group>
          </UnstyledButton>
        );
      })}
    </SimpleGrid>
  );
}

// ── Success view ───────────────────────────────────────────────────────────────

function SuccessView({
  trackingCode,
  destination,
  serviceType,
  onCreateAnother,
  onViewShipment,
}: {
  trackingCode: string;
  destination: string;
  serviceType: 'depot' | 'door_to_door';
  onCreateAnother: () => void;
  onViewShipment: () => void;
}) {
  const flag = countryFlag(getCountryCode(destination));
  const serviceLabel = serviceType === 'depot' ? 'Depot collection' : 'Door to Door';

  return (
    <Stack gap="lg" py="sm">
      <Stack align="center" gap="sm">
        <ThemeIcon size={56} radius="xl" color="green" variant="light">
          <IconCheck size={28} />
        </ThemeIcon>
        <Stack gap={4} align="center">
          <Text fw={700} size="lg">Shipment created</Text>
          <Text fw={600} ff="monospace" size="xl" style={{ letterSpacing: '0.08em' }}>
            {trackingCode}
          </Text>
        </Stack>
      </Stack>
      <Text size="sm" c="dimmed" ta="center">
        {flag} Shipping to {destination} · {serviceLabel}
      </Text>
      <Stack gap="sm">
        <Button fullWidth onClick={onCreateAnother}>Create another</Button>
        <Button fullWidth variant="default" onClick={onViewShipment}>View shipment</Button>
      </Stack>
    </Stack>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export interface CreateShipmentDrawerProps {
  opened: boolean;
  onClose: () => void;
  onCreated: (result: { trackingCode: string; shipmentId: string }) => void;
  onViewShipment?: (shipmentId: string) => void;
  /** Pre-fill the customer name when opened (e.g. from the customers page) */
  initialName?: string;
  /** Pre-fill the phone number when opened */
  initialPhone?: string;
}

export function CreateShipmentDrawer({
  opened,
  onClose,
  onCreated,
  onViewShipment,
  initialName,
  initialPhone,
}: CreateShipmentDrawerProps) {
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [destination, setDestination] = useState('');
  const [serviceType, setServiceType] = useState<'depot' | 'door_to_door'>('depot');
  const [cargoType, setCargoType] = useState('general');
  const [quantity, setQuantity] = useState<number | null>(null);
  const [packingItems, setPackingItems] = useState<PackingItem[]>([]);
  const [showCargo, setShowCargo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [orgDestinations, setOrgDestinations] = useState<OrgDestination[]>([]);
  const [destLoaded, setDestLoaded] = useState(false);
  const [success, setSuccess] = useState<{
    trackingCode: string;
    shipmentId: string;
    destination: string;
    serviceType: 'depot' | 'door_to_door';
  } | null>(null);

  const prevOpenedRef = useRef(false);

  // Pre-fill name/phone when modal transitions from closed → open
  useEffect(() => {
    if (opened && !prevOpenedRef.current) {
      setCustomerName(initialName ?? '');
      setPhone(initialPhone ?? '');
    }
    prevOpenedRef.current = opened;
  }, [opened, initialName, initialPhone]);

  // Fetch destinations once when modal first opens
  if (opened && !destLoaded) {
    setDestLoaded(true);
    fetch('/api/destinations')
      .then(r => r.json())
      .then(j => setOrgDestinations((j.destinations ?? []).map((d: any) => ({ id: d.id, name: d.name }))))
      .catch(() => {});
  }
  if (!opened && destLoaded) {
    setDestLoaded(false);
  }

  const digitCount = (phone.match(/\d/g) ?? []).length;
  const canCreate = customerName.trim().length >= 2 && digitCount >= 7 && destination.trim().length >= 2;

  const flag = destination ? countryFlag(getCountryCode(destination)) : '';
  const serviceLabel = serviceType === 'depot' ? 'Depot collection' : 'Door to Door';

  const showPacking = cargoType === 'barrel' || cargoType === 'box';

  async function handleCreate() {
    if (!canCreate || saving) return;
    setSaving(true);
    try {
      const cargoMeta: Record<string, unknown> = {};
      if (showPacking) {
        if (quantity != null) cargoMeta.quantity = quantity;
        const contents = packingItems
          .filter(c => c.category)
          .map(c => ({
            category: c.category,
            description: c.description?.trim() || null,
            qty: Math.max(1, c.qty),
          }));
        if (contents.length > 0) cargoMeta.contents = contents;
      }

      const res = await fetch('/api/shipments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          phone: phone.trim(),
          destination: destination.trim(),
          serviceType,
          phoneCountry: 'GB', // fallback; user is expected to include +CC in phone field
          cargoType,
          ...(Object.keys(cargoMeta).length > 0 ? { cargoMeta } : {}),
        }),
      });
      const ct = res.headers.get('content-type') ?? '';
      const payload = ct.includes('application/json') ? await res.json() : await res.text();
      if (!res.ok) {
        notifications.show({
          title: 'Create failed',
          message: typeof payload === 'object' ? (payload?.error ?? `Error ${res.status}`) : String(payload).slice(0, 140),
          color: 'red',
        });
        return;
      }
      const trackingCode: string = payload.tracking_code ?? payload.trackingCode ?? '—';
      const shipmentId: string = payload.id ?? payload.shipmentId ?? '';
      setSuccess({ trackingCode, shipmentId, destination, serviceType });
      onCreated({ trackingCode, shipmentId });
    } catch (err: any) {
      notifications.show({ title: 'Create failed', message: err?.message ?? 'Request failed', color: 'red' });
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    setSuccess(null);
    onClose();
  }

  function handleCreateAnother() {
    const keepDest = success?.destination ?? destination;
    const keepService = success?.serviceType ?? serviceType;
    setSuccess(null);
    setCustomerName('');
    setPhone('');
    setDestination(keepDest);
    setServiceType(keepService);
    setCargoType('general');
    setQuantity(null);
    setPackingItems([]);
    setShowCargo(false);
  }

  function handleViewShipment() {
    if (!success) return;
    const id = success.shipmentId;
    setSuccess(null);
    onClose();
    onViewShipment?.(id);
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="New shipment" size="sm" centered>
      {success ? (
        <SuccessView
          trackingCode={success.trackingCode}
          destination={success.destination}
          serviceType={success.serviceType}
          onCreateAnother={handleCreateAnother}
          onViewShipment={handleViewShipment}
        />
      ) : (
        <Stack gap="sm">
          <TextInput
            label="Customer name"
            required
            placeholder="e.g. Andre Brown"
            value={customerName}
            onChange={e => setCustomerName(e.currentTarget.value)}
          />

          <PhoneField value={phone} onChange={setPhone} />

          <Stack gap={4}>
            <Group gap={4}>
              <Text size="sm" fw={500}>Destination</Text>
              <Text size="sm" c="red">*</Text>
            </Group>
            <DestinationPicker
              orgDestinations={orgDestinations}
              value={destination}
              onChange={setDestination}
            />
          </Stack>

          <Stack gap={4}>
            <Group gap={4}>
              <Text size="sm" fw={500}>Service type</Text>
              <Text size="sm" c="red">*</Text>
            </Group>
            <ServiceTypeCards value={serviceType} onChange={setServiceType} />
          </Stack>

          <UnstyledButton
            onClick={() => setShowCargo(o => !o)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            {showCargo
              ? <IconChevronDown size={16} stroke={1.5} />
              : <IconChevronRight size={16} stroke={1.5} />}
            <Text size="sm" fw={500}>Cargo details</Text>
          </UnstyledButton>

          <Collapse in={showCargo}>
            <Stack gap="sm">
              <Select
                label="Cargo type"
                value={cargoType}
                onChange={v => {
                  setCargoType(v ?? 'general');
                  setQuantity(null);
                  setPackingItems([]);
                }}
                data={CARGO_TYPES}
              />

              {showPacking && (
                <NumberInput
                  label="Quantity"
                  min={0}
                  placeholder="e.g. 3"
                  value={quantity ?? ''}
                  onChange={v => setQuantity(typeof v === 'number' ? v : null)}
                />
              )}

              {showPacking && (
                <PackingListEditor items={packingItems} onChange={setPackingItems} />
              )}
            </Stack>
          </Collapse>

          <Stack gap={4} mt="xs">
            <Button fullWidth onClick={handleCreate} loading={saving} disabled={!canCreate}>
              Create shipment
            </Button>
            {destination && (
              <Text size="xs" c="dimmed" ta="center">
                {flag} Shipping to {destination} · {serviceLabel}
              </Text>
            )}
          </Stack>
        </Stack>
      )}
    </Modal>
  );
}
