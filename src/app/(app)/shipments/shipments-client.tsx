'use client';

import type { FormEvent } from 'react';
import { useMemo, useState, useEffect} from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Checkbox, Group, Paper, Select, Stack, Text, TextInput } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconDownload, IconPlus, IconPrinter, IconSearch, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { NewShipmentForm, ShipmentRow,ShipmentStatus } from './shipment-types';
import { formatWhen, statusBadgeColor, statusLabel } from './shipment-types';
import { CreateShipmentDrawer } from './components/CreateShipmentDrawer';
import { ShipmentDetailDrawer } from './components/ShipmentDetailDrawer';

export default function ShipmentsClient({ initialShipments }: { initialShipments: ShipmentRow[] }) {
  const router = useRouter();

  // Create shipment drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, _setForm] = useState<NewShipmentForm>({
    customerName: '',
    phone: '',
    destination: '',
    serviceType: 'depot',
  });

  const setForm = (updater: (prev: NewShipmentForm) => NewShipmentForm) => _setForm(updater);

  // Search
  const [query, setQuery] = useState('');

    // Filters (Segment 3)
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | 'all'>('all');
  const [destinationFilter, setDestinationFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'depot' | 'door_to_door'>('all');

  // Bulk actions
  const [selectedRecords, setSelectedRecords] = useState<ShipmentRow[]>([]);
  const [bulkStatus, setBulkStatus] = useState<ShipmentStatus>('loaded');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkAutoLog, setBulkAutoLog] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailShipmentId, setDetailShipmentId] = useState<string | null>(null);
 useEffect(() => {
    setSelectedRecords([]);
  }, [initialShipments]);

    const destinationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of initialShipments) {
      const d = String(s.destination ?? '').trim();
      if (d) set.add(d);
    }
    return ['all', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [initialShipments]);

      const records = useMemo(() => {
    let list = initialShipments;

    // Search
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((r) => {
        return (
          r.tracking_code.toLowerCase().includes(q) ||
          (r.customers?.name ?? '').toLowerCase().includes(q) ||
          (r.customers?.phone ?? '').toLowerCase().includes(q) ||
          (r.destination ?? '').toLowerCase().includes(q)
        );
      });
    }

    // Filters
    if (statusFilter !== 'all') {
      list = list.filter((r) => r.current_status === statusFilter);
    }
    if (destinationFilter !== 'all') {
      list = list.filter((r) => String(r.destination ?? '') === destinationFilter);
    }
    if (serviceFilter !== 'all') {
      list = list.filter((r) => String((r as any).service_type ?? '') === serviceFilter);
    }

    return list;
  }, [initialShipments, query, statusFilter, destinationFilter, serviceFilter]);



  function openShipmentDetail(shipmentId: string) {
    setDetailShipmentId(shipmentId);
    setDetailOpen(true);
  }

    function csvEscape(v: unknown) {
    const s = String(v ?? '');
    // wrap in quotes and escape quotes
    return `"${s.replace(/"/g, '""')}"`;
  }

  function downloadShipmentsCsv() {
    const header = [
      'tracking_code',
      'customer_name',
      'phone',
      'destination',
      'service_type',
      'status',
      'last_event_at',
      'created_at',
    ].join(',');

    const lines = records.map((r) =>
      [
        csvEscape(r.tracking_code),
        csvEscape(r.customers?.name ?? ''),
        csvEscape(r.customers?.phone ?? ''),
        csvEscape(r.destination ?? ''),
        csvEscape((r as any).service_type ?? ''),
        csvEscape(r.current_status),
        csvEscape(r.last_event_at ?? ''),
        csvEscape((r as any).created_at ?? ''),
      ].join(',')
    );

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `cargopulse_shipments_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function createShipment(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/shipments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.customerName,
          phone: form.phone,
          destination: form.destination,
          serviceType: form.serviceType,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        notifications.show({
          title: 'Create failed',
          message: isJson
            ? (payload?.error ?? `Request failed (${res.status})`)
            : `Request failed (${res.status}): ${String(payload).slice(0, 140)}…`,
          color: 'red',
        });
        return;
      }

      if (!isJson) {
        notifications.show({
          title: 'Create failed',
          message: `Unexpected non-JSON response (${res.status}): ${String(payload).slice(0, 140)}…`,
          color: 'red',
        });
        return;
      }

      notifications.show({
        title: 'Shipment created',
        message: `Tracking: ${payload.tracking_code ?? payload.trackingCode ?? '(missing)'}`,
        color: 'green',
      });

      setDrawerOpen(false);
      setForm(() => ({
        customerName: '',
        phone: '',
        destination: '',
        serviceType: 'depot',
      }));

      router.refresh();
    } catch (err: any) {
      notifications.show({
        title: 'Create failed',
        message: err?.message ?? 'Request failed',
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  }

    async function applyBulkStatus() {
    if (!selectedRecords.length) return;

    if (bulkAutoLog) {
      const ok = window.confirm(
        `This will update ${selectedRecords.length} shipments and ALSO message customers (if templates are enabled). Continue?`
      );
      if (!ok) return;
    }

    setBulkSaving(true);
    try {
      const res = await fetch('/api/shipments/bulk/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentIds: selectedRecords.map((r) => r.id),
          status: bulkStatus,
          note: bulkNote.trim() || null,
          autoLog: bulkAutoLog,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Bulk update failed');

      notifications.show({
        title: 'Bulk update complete',
        message: `Updated ${json.updated ?? 0}, skipped ${json.skipped ?? 0}`,
        color: 'green',
      });

      setSelectedRecords([]);
      setBulkNote('');
      router.refresh();
    } catch (e: any) {
      notifications.show({
        title: 'Bulk update failed',
        message: e?.message ?? 'Request failed',
        color: 'red',
      });
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Stack gap={2}>
          <Text fw={700} size="lg">
            Shipments
          </Text>
          <Text c="dimmed" size="sm">
            Track shipments, send updates, and reduce “where is it?” calls.
          </Text>
        </Stack>

        <Button leftSection={<IconPlus size={16} />} onClick={() => setDrawerOpen(true)}>
          New shipment
        </Button>
      </Group>

      <Paper p="md" withBorder radius="md">
    <Group justify="space-between" mb="sm" wrap="wrap">
  <Group wrap="wrap">
    <TextInput
      placeholder="Search tracking, phone, customer…"
      leftSection={<IconSearch size={16} />}
      value={query}
      onChange={(e) => setQuery(e.currentTarget.value)}
      w={320}
    />

    <Select
      label="Status"
      value={statusFilter}
      onChange={(v) => setStatusFilter(((v ?? 'all') as any))}
      data={[
        { value: 'all', label: 'All statuses' },
        { value: 'received', label: statusLabel('received') },
        { value: 'collected', label: statusLabel('collected') },
        { value: 'loaded', label: statusLabel('loaded') },
        { value: 'departed_uk', label: statusLabel('departed_uk') },
        { value: 'arrived_jamaica', label: statusLabel('arrived_jamaica') },
        { value: 'out_for_delivery', label: statusLabel('out_for_delivery') },
      ]}
      w={220}
    />

    <Select
      label="Destination"
      value={destinationFilter}
      onChange={(v) => setDestinationFilter(v ?? 'all')}
      data={destinationOptions.map((d) => ({ value: d, label: d === 'all' ? 'All destinations' : d }))}
      w={220}
    />

    <Select
      label="Service"
      value={serviceFilter}
      onChange={(v) => setServiceFilter((v ?? 'all') as any)}
      data={[
        { value: 'all', label: 'All services' },
        { value: 'depot', label: 'Depot' },
        { value: 'door_to_door', label: 'Door to door' },
      ]}
      w={180}
    />

    <Button
      variant="subtle"
      leftSection={<IconX size={16} />}
      onClick={() => {
        setQuery('');
        setStatusFilter('all');
        setDestinationFilter('all');
        setServiceFilter('all');
      }}
    >
      Clear
    </Button>
  </Group>

  <Button
    variant="light"
    leftSection={<IconDownload size={16} />}
    onClick={downloadShipmentsCsv}
  >
    Export CSV
  </Button>
</Group>

{selectedRecords.length ? (
  <Paper withBorder p="sm" radius="md" mb="sm">
    <Group justify="space-between" wrap="wrap">
      <Text fw={700}>Selected: {selectedRecords.length}</Text>

      <Group wrap="wrap">
        <Select
          label="Bulk status"
          value={bulkStatus}
          onChange={(v) => setBulkStatus((v ?? 'loaded') as ShipmentStatus)}
          data={[
            { value: 'received', label: statusLabel('received') },
            { value: 'collected', label: statusLabel('collected') },
            { value: 'loaded', label: statusLabel('loaded') },
            { value: 'departed_uk', label: statusLabel('departed_uk') },
            { value: 'arrived_jamaica', label: statusLabel('arrived_jamaica') },
            { value: 'out_for_delivery', label: statusLabel('out_for_delivery') },
          ]}
          w={220}
        />

        <TextInput
          label="Note (optional)"
          value={bulkNote}
          onChange={(e) => setBulkNote(e.currentTarget.value)}
          placeholder="e.g., Loaded onto container 12"
          w={260}
        />

        <Checkbox
          label="Auto message (template)"
          checked={bulkAutoLog}
          onChange={(e) => setBulkAutoLog(e.currentTarget.checked)}
        />

        <Button loading={bulkSaving} onClick={applyBulkStatus}>
          Apply
        </Button>

        <Button variant="subtle" onClick={() => setSelectedRecords([])}>
          Clear selection
        </Button>
      </Group>
    </Group>
  </Paper>
) : null}



        <DataTable
          withTableBorder
  withColumnBorders
  highlightOnHover
  records={records}
  idAccessor="id"
  selectedRecords={selectedRecords}
  onSelectedRecordsChange={setSelectedRecords}
  onRowClick={({ record }) => openShipmentDetail(record.id)}
  columns={[
            { accessor: 'tracking_code', title: 'Tracking' },
            { accessor: 'customers.name', title: 'Customer', render: (r) => r.customers?.name ?? '-' },
            { accessor: 'customers.phone', title: 'Phone', render: (r) => r.customers?.phone ?? '-' },
            { accessor: 'destination', title: 'Destination' },
            { accessor: 'service_type', title: 'Service', render: (r) => (r as any).service_type ?? '-' },
            { accessor: 'current_status',
              title: 'Status',
              render: (r) => (
                <Badge color={statusBadgeColor(r.current_status)} variant="light">
                  {statusLabel(r.current_status)}
                </Badge>
              ),
            },
             
            { accessor: 'last_event_at', title: 'Updated', render: (r) => formatWhen(r.last_event_at) },
            {
  accessor: 'actions',
  title: '',
  width: 90,
  render: (r) => (
    <Button
      size="xs"
      variant="subtle"
      leftSection={<IconPrinter size={14} />}
      onClick={(e) => {
        e.stopPropagation();
        window.open(`/shipments/print/${r.id}`, '_blank');
      }}
    >
      Print
    </Button>
  ),
},

          ]}
        />
      </Paper>

      <CreateShipmentDrawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        saving={saving}
        form={form}
        setForm={setForm}
        onSubmit={createShipment}
      />

      <ShipmentDetailDrawer
        opened={detailOpen}
        shipmentId={detailShipmentId}
        onClose={() => {
          setDetailOpen(false);
          setDetailShipmentId(null);
        }}
        onReloadRequested={() => router.refresh()}
      />
    </Stack>
  );
}
