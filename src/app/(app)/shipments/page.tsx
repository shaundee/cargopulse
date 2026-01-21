'use client';

import { useMemo, useState } from 'react';
import { Badge, Button, Group, Paper, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconPlus, IconSearch } from '@tabler/icons-react';

type ShipmentStatus =
  | 'Received'
  | 'Loaded'
  | 'Departed UK'
  | 'Arrived Jamaica'
  | 'Out for delivery'
  | 'Delivered';

type ShipmentRow = {
  id: string;
  trackingCode: string;
  customerName: string;
  phone: string;
  destination: string;
  status: ShipmentStatus;
  updatedAt: string;
};

const demoRows: ShipmentRow[] = [
  {
    id: '1',
    trackingCode: 'JAM-6H2K9Q',
    customerName: 'Andre Brown',
    phone: '+44 7xxx xxx xxx',
    destination: 'Kingston',
    status: 'Departed UK',
    updatedAt: 'Today 14:12',
  },
  {
    id: '2',
    trackingCode: 'JAM-1P8D4M',
    customerName: 'Shanice Reid',
    phone: '+44 7xxx xxx xxx',
    destination: 'St Catherine',
    status: 'Received',
    updatedAt: 'Yesterday 18:03',
  },
];

function statusColor(status: ShipmentStatus) {
  switch (status) {
    case 'Delivered':
      return 'green';
    case 'Out for delivery':
      return 'teal';
    case 'Arrived Jamaica':
      return 'cyan';
    case 'Departed UK':
      return 'blue';
    case 'Loaded':
      return 'indigo';
    case 'Received':
    default:
      return 'gray';
  }
}

export default function ShipmentsPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'All' | ShipmentStatus>('All');
  const [selectedRecords, setSelectedRecords] = useState<ShipmentRow[]>([]);

  const records = useMemo(() => {
    return demoRows.filter((r) => {
      const matchesQuery =
        !query ||
        r.trackingCode.toLowerCase().includes(query.toLowerCase()) ||
        r.phone.toLowerCase().includes(query.toLowerCase()) ||
        r.customerName.toLowerCase().includes(query.toLowerCase());

      const matchesStatus = status === 'All' ? true : r.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [query, status]);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Stack gap={2}>
          <Text fw={700} size="lg">
            Shipments
          </Text>
          <Text c="dimmed" size="sm">
            Create shipments, update milestones, and reduce status-chasing calls.
          </Text>
        </Stack>

        <Button leftSection={<IconPlus size={16} />}>New shipment</Button>
      </Group>

      <Paper p="md" withBorder radius="md">
        <Group justify="space-between" mb="sm" wrap="wrap">
          <TextInput
            placeholder="Search tracking code, phone, or customer…"
            leftSection={<IconSearch size={16} />}
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            w={360}
          />

          <SegmentedControl
            value={status}
            onChange={(v) => setStatus(v as any)}
            data={[
              { label: 'All', value: 'All' },
              { label: 'Received', value: 'Received' },
              { label: 'Departed', value: 'Departed UK' },
              { label: 'Arrived', value: 'Arrived Jamaica' },
              { label: 'Delivered', value: 'Delivered' },
            ]}
          />
        </Group>

        <DataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          records={records}
          selectedRecords={selectedRecords}
          onSelectedRecordsChange={setSelectedRecords}
          idAccessor="id"
          columns={[
            { accessor: 'trackingCode', title: 'Tracking' },
            { accessor: 'customerName', title: 'Customer' },
            { accessor: 'phone', title: 'Phone' },
            { accessor: 'destination', title: 'Destination' },
            {
              accessor: 'status',
              title: 'Status',
              render: (r) => (
                <Badge color={statusColor(r.status)} variant="light">
                  {r.status}
                </Badge>
              ),
            },
            { accessor: 'updatedAt', title: 'Updated' },
          ]}
        />
      </Paper>
    </Stack>
  );
}
