'use client';

import { useEffect, useMemo, useState } from 'react';
import { Paper, Stack, Group, Text, TextInput, Button, Table, Badge, Loader, Drawer, Divider } from '@mantine/core';
import { notifications } from '@mantine/notifications';

type AgentShipmentRow = {
  id: string;
  tracking_code: string;
  destination: string | null;
  current_status: string;
  last_event_at: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
};

function labelStatus(s: string) {
  const map: Record<string, string> = {
    received: 'Received (UK depot)',
    collected: 'Collected (UK)',
    loaded: 'Loaded',
    departed_uk: 'Departed (UK)',
    arrived_jamaica: 'Arrived (Destination)',
    out_for_delivery: 'Out for delivery',
    collected_by_customer: 'Collected by customer',
    delivered: 'Delivered',
  };

  return map[s] ?? s;
}

export function AgentClient() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AgentShipmentRow[]>([]);
  const [selected, setSelected] = useState<AgentShipmentRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [acting, setActing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/agent/shipments/list?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load');
      setRows(json.shipments ?? []);
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Load failed', message: e?.message ?? 'Unknown error' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => rows, [rows]);

  function openRow(r: AgentShipmentRow) {
    setSelected(r);
    setDrawerOpen(true);
  }

  async function setStatus(nextStatus: 'arrived_jamaica' | 'collected_by_customer') {
    if (!selected) return;
    setActing(true);
    try {
      const res = await fetch('/api/agent/shipments/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shipmentId: selected.id,
          status: nextStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'Update failed');

      notifications.show({ color: 'green', title: 'Updated', message: labelStatus(nextStatus) });

      // refresh list + keep drawer data fresh
      await load();
      setSelected((prev) => (prev ? { ...prev, current_status: nextStatus, last_event_at: new Date().toISOString() } : prev));
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Update failed', message: e?.message ?? 'Unknown error' });
    } finally {
      setActing(false);
    }
  }

  return (
    <Stack>
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="flex-end">
          <div>
            <Text fw={700}>Destination Agent Portal</Text>
            <Text c="dimmed" size="sm">
              Mark arrivals + customer collection.
            </Text>
          </div>

          <Group>
            <TextInput
              label="Search"
              placeholder="Tracking code (e.g. SHP-123...)"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
            <Button onClick={load} loading={loading}>
              Search
            </Button>
          </Group>
        </Group>

        <Divider my="md" />

        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tracking</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th>Destination</Table.Th>
                <Table.Th>Last update</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((r) => (
                <Table.Tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openRow(r)}>
                  <Table.Td style={{ fontWeight: 600 }}>{r.tracking_code}</Table.Td>
                  <Table.Td>
                    <Badge variant="light">{labelStatus(r.current_status)}</Badge>
                  </Table.Td>
                  <Table.Td>{r.destination ?? '-'}</Table.Td>
                  <Table.Td>{r.last_event_at ? new Date(r.last_event_at).toLocaleString() : '-'}</Table.Td>
                </Table.Tr>
              ))}
              {filtered.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={4}>
                    <Text c="dimmed" size="sm">
                      No shipments found.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Drawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        position="right"
        size="md"
        title={selected ? selected.tracking_code : 'Shipment'}
      >
        {!selected ? null : (
          <Stack>
            <Group justify="space-between">
              <Text fw={600}>Status</Text>
              <Badge variant="light">{labelStatus(selected.current_status)}</Badge>
            </Group>

            <Text size="sm" c="dimmed">
              Destination: {selected.destination ?? '-'}
            </Text>

            <Divider />

            <Text fw={600}>Actions</Text>

            <Button
              loading={acting}
              disabled={acting || selected.current_status === 'delivered'}
              onClick={() => setStatus('arrived_jamaica')}
            >
              Mark arrived (destination)
            </Button>

            <Button
              loading={acting}
              disabled={acting || selected.current_status === 'delivered'}
              onClick={() => setStatus('collected_by_customer')}
              variant="light"
            >
              Mark collected by customer
            </Button>

            {selected.current_status === 'delivered' ? (
              <Text size="sm" c="dimmed">
                Delivered is terminal.
              </Text>
            ) : null}
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}

