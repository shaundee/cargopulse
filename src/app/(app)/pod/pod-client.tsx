'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCamera,
  IconCheck,
  IconEye,
  IconPencil,
  IconPhoto,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { countryFlag, getCountryCode } from '@/lib/countries';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PodRecord = {
  shipment_id: string;
  receiver_name: string | null;
  delivered_at: string | null;
  photo_url: string | null;
};

export type PodShipment = {
  id: string;
  tracking_code: string;
  destination: string;
  service_type: string | null;
  last_event_at: string;
  customers: { name: string } | null;
  pod: PodRecord | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toTitleCase(str: string): string {
  if (str !== str.toUpperCase()) return str;
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isOverdue(deliveryDate: string): boolean {
  return Date.now() - new Date(deliveryDate).getTime() > SEVEN_DAYS_MS;
}

function daysAgo(deliveryDate: string): number {
  return Math.floor((Date.now() - new Date(deliveryDate).getTime()) / 86_400_000);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ── Overdue banner ────────────────────────────────────────────────────────────

function OverdueBanner({ count }: { count: number }) {
  return (
    <Box
      style={{
        background: 'var(--mantine-color-red-0)',
        border: '1px solid var(--mantine-color-red-3)',
        borderRadius: 10,
        padding: '12px 16px',
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <IconAlertCircle size={16} color="var(--mantine-color-red-6)" style={{ flexShrink: 0 }} />
        <Text size="sm">
          <Text component="span" fw={700} c="red.7">
            {count} shipment{count !== 1 ? 's' : ''} delivered over a week ago without proof
          </Text>
          {' '}— capture photos or signatures to protect yourself from disputes
        </Text>
      </Group>
    </Box>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  active,
  hasAlert,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  hasAlert?: boolean;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        border: `1.5px solid ${active ? `var(--mantine-color-${color}-4)` : 'var(--mantine-color-gray-2)'}`,
        borderRadius: 10,
        padding: '14px 16px',
        background: active ? `var(--mantine-color-${color}-0)` : 'var(--mantine-color-white)',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <Group gap={6} align="center" mb={4}>
        <Text fw={700} size="xl" c={active ? `${color}.6` : undefined} lh={1}>
          {value}
        </Text>
        {hasAlert && value > 0 && (
          <IconAlertCircle size={16} color="var(--mantine-color-orange-5)" />
        )}
      </Group>
      <Text size="xs" c="dimmed">{label}</Text>
    </UnstyledButton>
  );
}

// ── Capture modal (photo) ─────────────────────────────────────────────────────

function CaptureModal({
  shipment,
  onClose,
  onSaved,
}: {
  shipment: PodShipment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [receiverName, setReceiverName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null) {
    setFile(f);
    if (f) {
      const reader = new FileReader();
      reader.onload = e => setPreview(String(e.target?.result ?? ''));
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }

  async function handleSave() {
    if (!file) return;
    if (!receiverName.trim()) { setNameError('Receiver name is required'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('shipmentId', shipment.id);
      fd.append('receiverName', receiverName.trim());
      fd.append('file', file);
      const res = await fetch('/api/pod/complete', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Upload failed');
      notifications.show({ title: 'Proof captured', message: 'Photo saved', color: 'green' });
      onSaved();
    } catch (e: any) {
      notifications.show({ title: 'Upload failed', message: e?.message, color: 'red' });
    } finally {
      setSaving(false);
    }
  }

  const name = toTitleCase(shipment.customers?.name ?? 'Unknown');

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <Stack gap={0}>
          <Text fw={700} size="sm">Add photos</Text>
          <Text size="xs" c="dimmed" ff="monospace">{shipment.tracking_code} · {name}</Text>
        </Stack>
      }
      size="sm"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Receiver name"
          placeholder="Who received the package?"
          required
          value={receiverName}
          onChange={e => { setReceiverName(e.currentTarget.value); setNameError(''); }}
          error={nameError || undefined}
        />

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files?.[0] ?? null)}
        />

        {preview ? (
          <Box style={{ position: 'relative' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Preview"
              style={{ width: '100%', borderRadius: 8, maxHeight: 280, objectFit: 'cover', display: 'block' }}
            />
            <Button
              size="xs"
              variant="filled"
              color="red"
              style={{ position: 'absolute', top: 8, right: 8 }}
              onClick={() => handleFile(null)}
            >
              Remove
            </Button>
          </Box>
        ) : (
          <UnstyledButton
            onClick={() => fileRef.current?.click()}
            style={{
              border: '2px dashed var(--mantine-color-gray-3)',
              borderRadius: 10,
              padding: '28px 16px',
              width: '100%',
              textAlign: 'center',
            }}
          >
            <Stack gap="xs" align="center">
              <IconCamera size={28} color="var(--mantine-color-gray-5)" />
              <Text size="sm" c="dimmed">Tap to take photo or choose from gallery</Text>
            </Stack>
          </UnstyledButton>
        )}

        <Group gap="sm">
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!file}
            style={{ flex: 1 }}
            leftSection={<IconCamera size={14} />}
          >
            Save proof
          </Button>
          <Button variant="default" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── Signature modal ───────────────────────────────────────────────────────────

function SignatureModal({
  shipment,
  onClose,
  onSaved,
}: {
  shipment: PodShipment;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [receiverName, setReceiverName] = useState('');
  const [saving, setSaving] = useState(false);
  const [hasSig, setHasSig] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [nameError, setNameError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function getPos(e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * sx,
        y: (e.touches[0].clientY - rect.top) * sy,
      };
    }
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setDrawing(true);
    setHasSig(true);
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d')!;
    const pos = getPos(e, canvas);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function clearSig() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSig(false);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasSig) return;
    if (!receiverName.trim()) { setNameError('Receiver name is required'); return; }
    setSaving(true);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const [header, b64] = dataUrl.split(',');
      const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png';
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const file = new File([arr], 'signature.png', { type: mime });

      const fd = new FormData();
      fd.append('shipmentId', shipment.id);
      fd.append('receiverName', receiverName.trim());
      fd.append('file', file);
      const res = await fetch('/api/pod/complete', { method: 'POST', body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Save failed');
      notifications.show({ title: 'Signature saved', message: 'Signature saved successfully', color: 'green' });
      onSaved();
    } catch (e: any) {
      notifications.show({ title: 'Save failed', message: e?.message, color: 'red' });
    } finally {
      setSaving(false);
    }
  }

  const name = toTitleCase(shipment.customers?.name ?? 'Unknown');

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <Stack gap={0}>
          <Text fw={700} size="sm">Signature</Text>
          <Text size="xs" c="dimmed" ff="monospace">{shipment.tracking_code} · {name}</Text>
        </Stack>
      }
      size="sm"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Receiver name"
          placeholder="Who signed for the package?"
          required
          value={receiverName}
          onChange={e => { setReceiverName(e.currentTarget.value); setNameError(''); }}
          error={nameError || undefined}
        />

        <Stack gap={4}>
          <Group justify="space-between" align="center">
            <Text size="xs" fw={600} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Draw signature
            </Text>
            {hasSig && (
              <Button size="xs" variant="subtle" color="red" onClick={clearSig}>Clear</Button>
            )}
          </Group>
          <Box
            style={{
              border: '1.5px solid var(--mantine-color-gray-3)',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fafafa',
              touchAction: 'none',
            }}
          >
            <canvas
              ref={canvasRef}
              width={480}
              height={160}
              style={{ width: '100%', height: 'auto', display: 'block', cursor: 'crosshair' }}
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={() => setDrawing(false)}
              onMouseLeave={() => setDrawing(false)}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={() => setDrawing(false)}
            />
          </Box>
          {!hasSig && (
            <Text size="xs" c="dimmed" ta="center">Draw signature above</Text>
          )}
        </Stack>

        <Group gap="sm">
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!hasSig}
            style={{ flex: 1 }}
            leftSection={<IconPencil size={14} />}
          >
            Save signature
          </Button>
          <Button variant="default" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ── View modal ────────────────────────────────────────────────────────────────

function ViewModal({
  shipment,
  onClose,
}: {
  shipment: PodShipment;
  onClose: () => void;
}) {
  const pod = shipment.pod!;
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!pod.photo_url);

  useEffect(() => {
    if (!pod.photo_url) { setLoading(false); return; }
    fetch('/api/pod/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: pod.photo_url }),
    })
      .then(r => r.json())
      .then(j => setPhotoUrl(j.url ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pod.photo_url]);

  const name = toTitleCase(shipment.customers?.name ?? 'Unknown');
  const flag = countryFlag(getCountryCode(shipment.destination));
  const deliveryDate = formatDate(pod.delivered_at ?? shipment.last_event_at);

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon size={24} radius="xl" color="green" variant="light">
            <IconCheck size={14} />
          </ThemeIcon>
          <Stack gap={0}>
            <Text fw={700} size="sm">{name}</Text>
            <Text size="xs" c="dimmed" ff="monospace">{shipment.tracking_code}</Text>
          </Stack>
        </Group>
      }
      size="md"
      centered
    >
      <Stack gap="md">
        <Group gap={6} wrap="wrap">
          <Text size="sm">{flag}</Text>
          <Text size="sm" c="dimmed">{shipment.destination}</Text>
          <Text size="sm" c="dimmed">·</Text>
          <Text size="sm" c="dimmed">Delivered {deliveryDate}</Text>
          {pod.receiver_name && (
            <>
              <Text size="sm" c="dimmed">·</Text>
              <Text size="sm" c="dimmed">Received by <Text component="span" fw={600} c="dark">{pod.receiver_name}</Text></Text>
            </>
          )}
        </Group>

        {loading ? (
          <Box
            style={{
              background: 'var(--mantine-color-gray-0)',
              borderRadius: 8,
              height: 200,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text size="sm" c="dimmed">Loading…</Text>
          </Box>
        ) : photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Proof of delivery"
            style={{ width: '100%', borderRadius: 8, maxHeight: 420, objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <Box
            style={{
              background: 'var(--mantine-color-gray-0)',
              borderRadius: 8,
              padding: '32px',
              textAlign: 'center',
            }}
          >
            <Text c="dimmed" size="sm">No photo on file</Text>
          </Box>
        )}

        <Button variant="default" onClick={onClose} fullWidth>Close</Button>
      </Stack>
    </Modal>
  );
}

// ── Pending card ──────────────────────────────────────────────────────────────

function PendingCard({
  shipment,
  onAddPhotos,
  onSignature,
}: {
  shipment: PodShipment;
  onAddPhotos: () => void;
  onSignature: () => void;
}) {
  const name = toTitleCase(shipment.customers?.name ?? 'Unknown');
  const overdue = isOverdue(shipment.last_event_at);
  const days = daysAgo(shipment.last_event_at);
  const flag = countryFlag(getCountryCode(shipment.destination));
  const svcLabel = shipment.service_type === 'door_to_door' ? 'Door to Door' : 'Depot';

  return (
    <Box
      style={{
        border: `1px solid ${overdue ? 'var(--mantine-color-red-3)' : 'var(--mantine-color-gray-2)'}`,
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--mantine-color-white)',
      }}
    >
      {/* Overdue stripe */}
      {overdue && (
        <Box
          style={{
            background: 'var(--mantine-color-red-0)',
            borderBottom: '1px solid var(--mantine-color-red-2)',
            padding: '5px 14px',
          }}
        >
          <Group gap={6}>
            <IconAlertCircle size={13} color="var(--mantine-color-red-6)" />
            <Text size="xs" fw={600} c="red.7">
              Delivered {days} days ago — no proof captured
            </Text>
          </Group>
        </Box>
      )}

      <Group justify="space-between" p="md" wrap="nowrap" align="center" gap="sm">
        {/* Left */}
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size={32} radius="xl" color="orange" variant="light" style={{ flexShrink: 0 }}>
            <IconAlertCircle size={16} />
          </ThemeIcon>
          <Stack gap={3} style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap" align="center">
              <Text fw={600} size="sm">{name}</Text>
              <Text size="xs" fw={600} ff="monospace" c="dimmed">{shipment.tracking_code}</Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <Text size="xs">{flag}</Text>
              <Text size="xs" c="dimmed">{shipment.destination}</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{svcLabel}</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">Delivered {formatDate(shipment.last_event_at)}</Text>
            </Group>
          </Stack>
        </Group>

        {/* Actions */}
        <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
          <Button
            size="xs"
            leftSection={<IconCamera size={12} />}
            onClick={onAddPhotos}
          >
            Add photos
          </Button>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconPencil size={12} />}
            onClick={onSignature}
          >
            Signature
          </Button>
        </Group>
      </Group>
    </Box>
  );
}

// ── Captured card ─────────────────────────────────────────────────────────────

function CapturedCard({
  shipment,
  onView,
}: {
  shipment: PodShipment;
  onView: () => void;
}) {
  const name = toTitleCase(shipment.customers?.name ?? 'Unknown');
  const pod = shipment.pod!;
  const flag = countryFlag(getCountryCode(shipment.destination));
  const svcLabel = shipment.service_type === 'door_to_door' ? 'Door to Door' : 'Depot';
  const hasPhoto = !!pod.photo_url;
  const hasSig = !!pod.receiver_name;

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-gray-2)',
        borderRadius: 10,
        background: 'var(--mantine-color-white)',
      }}
    >
      <Group justify="space-between" p="md" wrap="nowrap" align="center" gap="sm">
        {/* Left */}
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon size={32} radius="xl" color="green" variant="light" style={{ flexShrink: 0 }}>
            <IconCheck size={16} />
          </ThemeIcon>
          <Stack gap={3} style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap" align="center">
              <Text fw={600} size="sm">{name}</Text>
              <Text size="xs" fw={600} ff="monospace" c="dimmed">{shipment.tracking_code}</Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <Text size="xs">{flag}</Text>
              <Text size="xs" c="dimmed">{shipment.destination}</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">{svcLabel}</Text>
              <Text size="xs" c="dimmed">·</Text>
              <Text size="xs" c="dimmed">Delivered {formatDate(shipment.last_event_at)}</Text>
            </Group>
          </Stack>
        </Group>

        {/* Right: indicators + view */}
        <Group gap="xs" wrap="nowrap" align="center" style={{ flexShrink: 0 }}>
          {hasPhoto && (
            <Group gap={3} wrap="nowrap">
              <IconPhoto size={13} color="var(--mantine-color-green-6)" />
              <Text size="xs" c="green.7" fw={500}>Photo</Text>
            </Group>
          )}
          {hasSig && (
            <Group gap={3} wrap="nowrap">
              <IconPencil size={13} color="var(--mantine-color-green-6)" />
              <Text size="xs" c="green.7" fw={500}>Signed</Text>
            </Group>
          )}
          <Button size="xs" variant="default" leftSection={<IconEye size={12} />} onClick={onView}>
            View
          </Button>
        </Group>
      </Group>
    </Box>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function PodClient({ shipments }: { shipments: PodShipment[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'pending' | 'captured'>('all');
  const [capturing, setCapturing] = useState<PodShipment | null>(null);
  const [signing, setSigning] = useState<PodShipment | null>(null);
  const [viewing, setViewing] = useState<PodShipment | null>(null);

  const sorted = useMemo(() => {
    return [...shipments].sort((a, b) => {
      const aPending = !a.pod;
      const bPending = !b.pod;
      if (aPending !== bPending) return aPending ? -1 : 1;
      // Pending: oldest first (most urgent at top)
      if (aPending && bPending) {
        return new Date(a.last_event_at).getTime() - new Date(b.last_event_at).getTime();
      }
      // Captured: most recent first
      return new Date(b.last_event_at).getTime() - new Date(a.last_event_at).getTime();
    });
  }, [shipments]);

  const pending = sorted.filter(s => !s.pod);
  const captured = sorted.filter(s => !!s.pod);
  const overdueCount = pending.filter(s => isOverdue(s.last_event_at)).length;

  const filtered =
    filter === 'pending' ? pending :
    filter === 'captured' ? captured :
    sorted;

  function handleSaved() {
    setCapturing(null);
    setSigning(null);
    router.refresh();
  }

  return (
    <>
      {/* Modals */}
      {capturing && (
        <CaptureModal shipment={capturing} onClose={() => setCapturing(null)} onSaved={handleSaved} />
      )}
      {signing && (
        <SignatureModal shipment={signing} onClose={() => setSigning(null)} onSaved={handleSaved} />
      )}
      {viewing && (
        <ViewModal shipment={viewing} onClose={() => setViewing(null)} />
      )}

      <Stack gap="lg">
        {/* Header */}
        <Stack gap={4}>
          <Text fw={700} size="xl">Proof of delivery</Text>
          <Text c="dimmed" size="sm">Capture photos and signatures for delivered shipments</Text>
        </Stack>

        {/* Overdue alert */}
        {overdueCount > 0 && <OverdueBanner count={overdueCount} />}

        {/* Stat filter cards */}
        <SimpleGrid cols={3} spacing="sm">
          <StatCard
            label="Total delivered"
            value={shipments.length}
            color="blue"
            active={filter === 'all'}
            onClick={() => setFilter(f => f === 'all' ? 'all' : 'all')}
          />
          <StatCard
            label="Needs proof"
            value={pending.length}
            color="orange"
            active={filter === 'pending'}
            hasAlert={pending.length > 0}
            onClick={() => setFilter(f => f === 'pending' ? 'all' : 'pending')}
          />
          <StatCard
            label="Captured"
            value={captured.length}
            color="green"
            active={filter === 'captured'}
            onClick={() => setFilter(f => f === 'captured' ? 'all' : 'captured')}
          />
        </SimpleGrid>

        {/* Cards list */}
        {filtered.length === 0 ? (
          filter === 'pending' ? (
            <Stack align="center" py="xl" gap="sm">
              <Text style={{ fontSize: 36 }}>🎉</Text>
              <Text fw={700} size="lg">All caught up!</Text>
              <Text c="dimmed" size="sm">All delivered shipments have proof captured.</Text>
            </Stack>
          ) : (
            <Text c="dimmed" size="sm">No shipments found.</Text>
          )
        ) : (
          <Stack gap="sm">
            {filtered.map(s =>
              s.pod ? (
                <CapturedCard key={s.id} shipment={s} onView={() => setViewing(s)} />
              ) : (
                <PendingCard
                  key={s.id}
                  shipment={s}
                  onAddPhotos={() => setCapturing(s)}
                  onSignature={() => setSigning(s)}
                />
              ),
            )}
          </Stack>
        )}
      </Stack>
    </>
  );
}
