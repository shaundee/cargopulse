'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Drawer, Group, Paper, Stack, Switch, Text, TextInput, Textarea, Select } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { notifications } from '@mantine/notifications';

type ShipmentStatus =
  | 'received'
  | 'collected'
  | 'loaded'
  | 'departed_uk'
  | 'arrived_destination'
  | 'collected_by_customer'
  | 'out_for_delivery'
  | 'delivered';

type TemplateRow = {
  id: string;
  status: ShipmentStatus;
  body: string;
  enabled: boolean;
  created_at?: string;
  updated_at?: string;
};

const STATUS_OPTIONS = [
  { value: 'received', label: 'Received' },
  { value: 'collected', label: 'Collected' },
  { value: 'loaded', label: 'Loaded' },
  { value: 'departed_uk', label: 'Departed UK' },
 { value: 'arrived_destination', label: 'Arrived at destination' },
  { value: 'collected_by_customer', label: 'Collected by customer' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
] as const;

export function MessagesClient() {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [query, setQuery] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
const [paymentTpl, setPaymentTpl] = useState<{ id?: string; body: string; enabled: boolean } | null>(null);

  const [form, setForm] = useState({
    status: 'received' as ShipmentStatus,
    body: '',
    enabled: true,
  });

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch('/api/message-templates');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load templates');
      setTemplates(data.templates ?? []);
      const miscRes = await fetch('/api/message-templates-misc?key=payment_reminder');
const miscJson = await miscRes.json();
if (miscRes.ok) {
  const row = miscJson?.templates?.[0];
  if (row) setPaymentTpl({ id: row.id, body: row.body ?? '', enabled: !!row.enabled });
}

    } catch (e: any) {
      notifications.show({ title: 'Load failed', message: e?.message ?? 'Error', color: 'red' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTemplates();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return templates;

    return templates.filter((t) =>
      t.status.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q)
    );
  }, [templates, query]);

  function openNew() {
    setEditing(null);
    setForm({ status: 'received', body: '', enabled: true });
    setDrawerOpen(true);
  }

  function openEdit(t: TemplateRow) {
    setEditing(t);
    setForm({ status: t.status, body: t.body, enabled: t.enabled });
    setDrawerOpen(true);
  }
async function savePaymentTemplate() {
  if (!paymentTpl) return;

  const res = await fetch('/api/message-templates-misc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: paymentTpl.id,
      key: 'payment_reminder',
      body: paymentTpl.body,
      enabled: paymentTpl.enabled,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? 'Save failed');

  notifications.show({ title: 'Saved', message: 'Payment reminder template updated', color: 'green' });
}

  async function saveTemplate() {
    try {
      const endpoint = editing ? '/api/message-templates/update' : '/api/message-templates';
      const payload = editing ? { id: editing.id, ...form } : form;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const data = isJson ? await res.json() : await res.text();

      if (!res.ok) throw new Error(isJson ? (data?.error ?? 'Save failed') : 'Save failed');

      notifications.show({ title: 'Saved', message: 'Template updated', color: 'green' });
      setDrawerOpen(false);
      await loadTemplates();
    } catch (e: any) {
      notifications.show({ title: 'Save failed', message: e?.message ?? 'Error', color: 'red' });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Stack gap={2}>
          <Text fw={700} size="lg">Messages</Text>
          <Text c="dimmed" size="sm">Edit message templates for each shipment status.</Text>
        </Stack>

        <Button onClick={openNew}>New template</Button>
      </Group>

      <Paper p="md" withBorder radius="md">
        <Group mb="sm" justify="space-between" wrap="wrap">
          <TextInput
            placeholder="Search templates…"
            value={query}
            onChange={(e) => {
  const v = e.currentTarget.value;
  setQuery(v);
}}
            w={360}
          />
        </Group>


        <DataTable
          records={filtered}
          fetching={loading}
          withTableBorder
          withColumnBorders
          highlightOnHover
          idAccessor="id"
          columns={[
            { accessor: 'status', title: 'Status', render: (r) => <Badge variant="light">{r.status}</Badge> },
            { accessor: 'enabled', title: 'Enabled', render: (r) => (r.enabled ? 'Yes' : 'No') },
            { accessor: 'body', title: 'Body', render: (r) => <Text size="sm" lineClamp={2}>{r.body}</Text> },
          ]}
          onRowClick={({ record }) => openEdit(record)}
        />
      </Paper>

      <Drawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        position="right"
        size="lg"
        title={editing ? 'Edit template' : 'New template'}
      >
        <Stack gap="sm">
          <Select
            label="Status"
            data={STATUS_OPTIONS as any}
            value={form.status}
            onChange={(v) => setForm((f) => ({ ...f, status: (v ?? 'received') as ShipmentStatus }))}
            disabled={!!editing}
          />

          

          <Textarea
            label="Message body"
            value={form.body}
            onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((f) => ({ ...f, body: v }));
}}
            minRows={6}
            placeholder={
              'Hi {{customer_name}}, your shipment {{tracking_code}} is now {{status}}. Destination: {{destination}}.'
            }
          />

          <Switch
            checked={form.enabled}
           onChange={(e) => {
  const checked = e.currentTarget.checked;
  setForm((f) => ({ ...f, enabled: checked }));
}}
            label="Enabled"
          />

          <Button onClick={saveTemplate}>Save</Button>

   <Text size="sm" c="dimmed">
  Variables: {'{{name}}'} {'{{code}}'} {'{{customer_name}}'} {'{{tracking_code}}'} {'{{destination}}'} {'{{status}}'}
</Text>

        </Stack>
      </Drawer>
    </Stack>
  );
}
