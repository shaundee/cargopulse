'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Drawer,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Select,
} from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

type ShipmentStatus =
  | 'received'
  | 'loaded'
  | 'departed_uk'
  | 'arrived_jamaica'
  | 'out_for_delivery'
  | 'delivered';

type ShipmentRow = {
  id: string;
  tracking_code: string;
  destination: string;
  current_status: ShipmentStatus;
  last_event_at: string;
  customers: { name: string; phone: string } | null;
};

function statusLabel(s: ShipmentStatus) {
  switch (s) {
    case 'received': return 'Received';
    case 'loaded': return 'Loaded';
    case 'departed_uk': return 'Departed UK';
    case 'arrived_jamaica': return 'Arrived Jamaica';
    case 'out_for_delivery': return 'Out for delivery';
    case 'delivered': return 'Delivered';
  }
}

function statusColor(s: ShipmentStatus) {
  switch (s) {
    case 'delivered': return 'green';
    case 'out_for_delivery': return 'teal';
    case 'arrived_jamaica': return 'cyan';
    case 'departed_uk': return 'blue';
    case 'loaded': return 'indigo';
    default: return 'gray';
  }
}

export function ShipmentsClient({ initialShipments }: { initialShipments: ShipmentRow[] }) {
      const router = useRouter();

  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    destination: '',
    serviceType: 'depot' as 'depot' | 'door_to_door',
  });

  const [saving, setSaving] = useState(false);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ShipmentRow[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const records = useMemo(() => {
    return initialShipments.filter((r) => {
      const q = query.toLowerCase().trim();
      if (!q) return true;

      return (
        r.tracking_code.toLowerCase().includes(q) ||
        (r.customers?.name ?? '').toLowerCase().includes(q) ||
        (r.customers?.phone ?? '').toLowerCase().includes(q) ||
        (r.destination ?? '').toLowerCase().includes(q)
      );
    });
  }, [initialShipments, query]);

async function createShipment(e: React.FormEvent) {
  e.preventDefault();
  setSaving(true);

  try {
    const res = await fetch('/api/shipments/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    const json = await res.json();

    if (!res.ok) {
      notifications.show({
        title: 'Create failed',
        message: json?.error ?? 'Unknown error',
        color: 'red',
      });
      return;
    }

    notifications.show({
      title: 'Shipment created',
      message: `Tracking: ${json.trackingCode}`,
      color: 'green',
    });

    setDrawerOpen(false);
    setForm({ customerName: '', phone: '', destination: '', serviceType: 'depot' });

    // Pull fresh server data (ShipmentsPage is server-rendered)
    router.refresh();
  } catch (err: any) {
    notifications.show({ title: 'Create failed', message: err?.message ?? 'Request failed', color: 'red' });
  } finally {
    setSaving(false);
  }
}


  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Stack gap={2}>
          <Text fw={700} size="lg">Shipments</Text>
          <Text c="dimmed" size="sm">Track shipments, send updates, and reduce “where is it?” calls.</Text>
        </Stack>

        <Button leftSection={<IconPlus size={16} />} onClick={() => setDrawerOpen(true)}>
          New shipment
        </Button>
      </Group>

      <Paper p="md" withBorder radius="md">
        <Group justify="space-between" mb="sm" wrap="wrap">
          <TextInput
            placeholder="Search tracking, phone, customer…"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={360}
          />
        </Group>

        <DataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          records={records}
          selectedRecords={selected}
          onSelectedRecordsChange={setSelected}
          idAccessor="id"
          columns={[
            { accessor: 'tracking_code', title: 'Tracking' },
            { accessor: 'customers.name', title: 'Customer', render: (r) => r.customers?.name ?? '-' },
            { accessor: 'customers.phone', title: 'Phone', render: (r) => r.customers?.phone ?? '-' },
            { accessor: 'destination', title: 'Destination' },
            {
              accessor: 'current_status',
              title: 'Status',
              render: (r) => (
                <Badge color={statusColor(r.current_status)} variant="light">
                  {statusLabel(r.current_status)}
                </Badge>
              ),
            },
            { accessor: 'last_event_at', title: 'Updated' },
          ]}
        />
      </Paper>

      <Drawer opened={drawerOpen} onClose={() => setDrawerOpen(false)} position="right" size="md" title="New shipment">
        <form onSubmit={createShipment}>
          <Stack gap="sm">
       <TextInput
  label="Customer name"
  placeholder="e.g., Andre Brown"
  value={form.customerName}
  onChange={(e) => setForm((f) => ({ ...f, customerName: e.currentTarget.value }))}
  required
/>

<TextInput
  label="Phone"
  placeholder="+44..."
  value={form.phone}
  onChange={(e) => setForm((f) => ({ ...f, phone: e.currentTarget.value }))}
  required
/>

<TextInput
  label="Destination"
  placeholder="Kingston / St Catherine"
  value={form.destination}
  onChange={(e) => setForm((f) => ({ ...f, destination: e.currentTarget.value }))}
  required
/>

<Select
  label="Service type"
  data={[
    { value: 'depot', label: 'Depot' },
    { value: 'door_to_door', label: 'Door to door' },
  ]}
  value={form.serviceType}
  onChange={(v) => setForm((f) => ({ ...f, serviceType: (v === 'door_to_door' ? 'door_to_door' : 'depot') }))}
  required
/>

<Button type="submit" loading={saving}>
  Create shipment
</Button>

          </Stack>
        </form>
      </Drawer>
    </Stack>
  );
}
