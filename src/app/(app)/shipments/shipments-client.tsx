'use client';

import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Button, Group, Paper, Stack, Text, TextInput } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconPlus, IconSearch } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

import type { NewShipmentForm, ShipmentRow } from './shipment-types';
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

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailShipmentId, setDetailShipmentId] = useState<string | null>(null);

  const records = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return initialShipments;

    return initialShipments.filter((r) => {
      return (
        r.tracking_code.toLowerCase().includes(q) ||
        (r.customers?.name ?? '').toLowerCase().includes(q) ||
        (r.customers?.phone ?? '').toLowerCase().includes(q) ||
        (r.destination ?? '').toLowerCase().includes(q)
      );
    });
  }, [initialShipments, query]);

  function openShipmentDetail(shipmentId: string) {
    setDetailShipmentId(shipmentId);
    setDetailOpen(true);
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
          idAccessor="id"
          onRowClick={({ record }) => openShipmentDetail(record.id)}
          columns={[
            { accessor: 'tracking_code', title: 'Tracking' },
            { accessor: 'customers.name', title: 'Customer', render: (r) => r.customers?.name ?? '-' },
            { accessor: 'customers.phone', title: 'Phone', render: (r) => r.customers?.phone ?? '-' },
            { accessor: 'destination', title: 'Destination' },
            {
              accessor: 'current_status',
              title: 'Status',
              render: (r) => (
                <Badge color={statusBadgeColor(r.current_status)} variant="light">
                  {statusLabel(r.current_status)}
                </Badge>
              ),
            },
            { accessor: 'last_event_at', title: 'Updated', render: (r) => formatWhen(r.last_event_at) },
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
