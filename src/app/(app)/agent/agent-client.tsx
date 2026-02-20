'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  Button,
  Table,
  Badge,
  Loader,
  Drawer,
  Divider,
  FileInput,
  Modal,
  Checkbox,
  Select,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { ShipmentStatus, TemplateRow } from '../shipments/shipment-types';

type AgentShipmentRow = {
  id: string;
  tracking_code: string;
  destination: string | null;
  current_status: string;
  last_event_at: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  public_tracking_token?: string | null;
};

type AgentActionStatus = 'arrived_destination' | 'collected_by_customer';

function renderTemplate(body: string, vars: Record<string, string>) {
  return String(body ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

function labelStatus(s: string) {
  const map: Record<string, string> = {
    received: 'Received (UK depot)',
    collected: 'Collected (UK)',
    loaded: 'Loaded',
    departed_uk: 'Departed (UK)',
    arrived_destination: 'Arrived (Destination)',
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
  const abortRef = useRef<AbortController | null>(null);

  // Templates (shared)
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [tplLoading, setTplLoading] = useState(false);

  const enabledTemplates = useMemo(() => templates.filter((t) => t.enabled), [templates]);

  const trackingUrl = useMemo(() => {
    const token = selected?.public_tracking_token ?? null;
    if (!token) return '';
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/t/${token}`;
  }, [selected?.public_tracking_token]);

  function notifyAutoMessage(auto_message: any) {
    if (!auto_message) return;
    if (auto_message.skipped) {
      const reason = String(auto_message.reason ?? 'skipped');
      notifications.show({
        title: 'Customer update skipped',
        message: reason,
        color: reason === 'already_notified' ? 'yellow' : 'gray',
      });
      return;
    }
    const mode = String(auto_message.mode ?? '');
    if (mode === 'sent') {
      notifications.show({ title: 'Customer update sent', message: 'WhatsApp queued/sent.', color: 'green' });
      return;
    }
    if (mode === 'logged_only') {
      notifications.show({ title: 'Customer update logged', message: 'Twilio not configured (demo-safe).', color: 'blue' });
      return;
    }
    if (mode === 'failed') {
      notifications.show({ title: 'Customer update failed', message: auto_message.error ?? 'Send failed', color: 'red' });
      return;
    }
  }

  const loadTemplates = useCallback(async () => {
    setTplLoading(true);
    try {
      const res = await fetch('/api/message-templates', { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? 'Failed to load templates');
      setTemplates(j?.templates ?? []);
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Templates failed', message: e?.message ?? 'Unknown error' });
      setTemplates([]);
    } finally {
      setTplLoading(false);
    }
  }, []);
  // POD modal
  const [podOpen, setPodOpen] = useState(false);
  const [receiverName, setReceiverName] = useState('');
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podBusy, setPodBusy] = useState(false);
  const filtered = useMemo(() => rows, [rows]);

  const load = useCallback(async (query: string) => {
    const qq = query.trim();

    // cancel previous request
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    try {
      const res = await fetch(`/api/agent/shipments/list?q=${encodeURIComponent(qq)}`, {
        cache: 'no-store',
        signal: ac.signal,
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load');

      setRows(json?.shipments ?? []);
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // normal while typing
      notifications.show({ color: 'red', title: 'Load failed', message: e?.message ?? 'Unknown error' });
      setRows([]);
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const delay = q.trim() ? 250 : 0; // debounce only when typing
    const t = window.setTimeout(() => {
      void load(q);
    }, delay);

    return () => window.clearTimeout(t);
  }, [q, load]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  // Status action modal
  const [actionOpen, setActionOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<AgentActionStatus | null>(null);
  const [actionSendUpdate, setActionSendUpdate] = useState(true);
  const [actionTemplateId, setActionTemplateId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const actionTemplates = useMemo(() => {
    if (!actionStatus) return [];
    return enabledTemplates.filter((t) => t.status === actionStatus);
  }, [actionStatus, enabledTemplates]);

  useEffect(() => {
    if (!actionOpen) return;
    const first = actionTemplates[0]?.id ?? null;
    setActionTemplateId(first);
  }, [actionOpen, actionTemplates]);

  const actionPreview = useMemo(() => {
    if (!actionOpen || !actionSendUpdate) return '';
    const tpl = actionTemplates.find((t) => t.id === actionTemplateId) ?? actionTemplates[0] ?? null;
    if (!tpl?.body) return '';
    return renderTemplate(tpl.body, {
      customer_name: selected?.customer_name ?? '',
      tracking_code: selected?.tracking_code ?? '',
      destination: selected?.destination ?? '',
      status: String(actionStatus ?? ''),
      note: '',
      tracking_url: trackingUrl,

      name: selected?.customer_name ?? '',
      code: selected?.tracking_code ?? '',
    });
  }, [actionOpen, actionSendUpdate, actionTemplates, actionTemplateId, selected?.customer_name, selected?.tracking_code, selected?.destination, actionStatus, trackingUrl]);


  function openRow(r: AgentShipmentRow) {
    setSelected(r);
    setDrawerOpen(true);
  }

  function openPodFromSelected() {
    if (!selected) return;
    setReceiverName('');
    setPodFile(null);
    setPodOpen(true);
  }

  function openStatusAction(nextStatus: AgentActionStatus) {
    if (!selected) return;
    setActionStatus(nextStatus);
    setActionSendUpdate(true);
    setActionOpen(true);
  }

  async function confirmStatusAction() {
    if (!selected || !actionStatus) return;

    setActionBusy(true);
    try {
      const res = await fetch('/api/shipments/events/add', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          shipmentId: selected.id,
          status: actionStatus,
          note: null,
          autoLog: actionSendUpdate,
          templateId: actionSendUpdate ? actionTemplateId : null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Update failed');

      notifications.show({ color: 'green', title: 'Updated', message: labelStatus(actionStatus) });
      notifyAutoMessage(json?.auto_message);

      setActionOpen(false);

      await load(q);

      setSelected((prev) =>
        prev ? { ...prev, current_status: actionStatus, last_event_at: new Date().toISOString() } : prev
      );
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Update failed', message: e?.message ?? 'Unknown error' });
    } finally {
      setActionBusy(false);
    }
  }

  async function submitPod() {
    if (!selected) return;

    if (!receiverName.trim()) {
      notifications.show({ title: 'Missing receiver name', message: 'Enter who received the shipment.', color: 'red' });
      return;
    }
    if (!podFile) {
      notifications.show({ title: 'Missing photo', message: 'Choose a POD photo.', color: 'red' });
      return;
    }

    setPodBusy(true);
    try {
      const fd = new FormData();
      fd.set('shipmentId', selected.id);
      fd.set('receiverName', receiverName.trim());
      fd.set('file', podFile);

      fd.set('sendUpdate', String(podSendUpdate));
      if (podSendUpdate && podTemplateId) fd.set('templateId', podTemplateId);

      const res = await fetch('/api/pod/complete', { method: 'POST', body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'POD failed');

      notifications.show({
        title: 'Delivered',
        message: `POD saved for ${selected.tracking_code}`,
        color: 'green',
      });

      setPodOpen(false);

      // refresh list + drawer
      await load(q);

      // optimistic update in case list endpoint lags
      setSelected((prev) =>
        prev ? { ...prev, current_status: 'delivered', last_event_at: new Date().toISOString() } : prev
      );

      notifyAutoMessage(j?.auto_message);
    } catch (e: any) {
      notifications.show({ title: 'POD failed', message: e?.message ?? 'Request failed', color: 'red' });
    } finally {
      setPodBusy(false);
    }
  }

  // POD message options
  const deliveredTemplates = useMemo(() => enabledTemplates.filter((t) => t.status === 'delivered'), [enabledTemplates]);
  const [podSendUpdate, setPodSendUpdate] = useState(true);
  const [podTemplateId, setPodTemplateId] = useState<string | null>(null);

  useEffect(() => {
    if (!podOpen) return;
    setPodSendUpdate(true);
    setPodTemplateId(deliveredTemplates[0]?.id ?? null);
  }, [podOpen, deliveredTemplates]);

  const podPreview = useMemo(() => {
    if (!podOpen || !podSendUpdate) return '';
    const tpl = deliveredTemplates.find((t) => t.id === podTemplateId) ?? deliveredTemplates[0] ?? null;
    if (!tpl?.body) return '';
    return renderTemplate(tpl.body, {
      customer_name: selected?.customer_name ?? '',
      tracking_code: selected?.tracking_code ?? '',
      destination: selected?.destination ?? '',
      status: 'delivered',
      note: '',
      tracking_url: trackingUrl,

      name: selected?.customer_name ?? '',
      code: selected?.tracking_code ?? '',
    });
  }, [podOpen, podSendUpdate, deliveredTemplates, podTemplateId, selected?.customer_name, selected?.tracking_code, selected?.destination, trackingUrl]);

  return (
    <Stack>
      <Paper withBorder p="md" radius="md">
        <Group justify="space-between" align="flex-end">
          <div>
            <Text fw={700}>Destination Agent Portal</Text>
            <Text c="dimmed" size="sm">
              Mark arrivals + customer collection + delivery POD.
            </Text>
          </div>

          <Group>
            <TextInput
              label="Search"
              placeholder="Tracking code (e.g. SHP-123...)"
              value={q}
              onChange={(e) => setQ(e.currentTarget.value)}
            />
            <Button onClick={() => void load(q)} loading={loading}>
              Refresh
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

            {selected.customer_name || selected.customer_phone ? (
              <Text size="sm" c="dimmed">
                Customer: {selected.customer_name ?? '-'} • {selected.customer_phone ?? '-'}
              </Text>
            ) : null}

            <Divider />

            <Text fw={600}>Actions</Text>

            <Button
              loading={actionBusy}
              disabled={actionBusy || selected.current_status === 'delivered'}
              onClick={() => openStatusAction('arrived_destination')}
            >
              Mark arrived (destination)
            </Button>

            <Button
              loading={actionBusy}
              disabled={actionBusy || selected.current_status === 'delivered'}
              onClick={() => openStatusAction('collected_by_customer')}
              variant="light"
            >
              Mark collected by customer
            </Button>

            <Button
              variant="default"
              disabled={selected.current_status === 'delivered'}
              onClick={openPodFromSelected}
            >
              Deliver + capture POD
            </Button>

            {selected.current_status === 'delivered' ? (
              <Text size="sm" c="dimmed">
                Delivered is terminal.
              </Text>
            ) : null}
          </Stack>
        )}
      </Drawer>

      <Modal opened={podOpen} onClose={() => setPodOpen(false)} title="Deliver + capture POD">
        <Stack gap="sm">
          <Text size="sm">{selected ? `${selected.tracking_code} • ${selected.destination ?? '-'}` : ''}</Text>

          <TextInput
            label="Receiver name"
            value={receiverName}
            onChange={(e) => setReceiverName(e.currentTarget.value)}
            placeholder="e.g., Marsha Brown"
          />

          <FileInput
            label="POD photo"
            value={podFile}
            onChange={setPodFile}
            accept="image/*"
            placeholder="Choose image..."
          />

          <Divider my="xs" />

          <Checkbox
            label="Send update to customer"
            checked={podSendUpdate}
            onChange={(e) => setPodSendUpdate(e.currentTarget.checked)}
            disabled={tplLoading}
          />

          {podSendUpdate ? (
            <>
              <Select
                label="Message template"
                data={deliveredTemplates.map((t) => ({ value: t.id, label: `Delivered` }))}
                value={podTemplateId}
                onChange={(v) => setPodTemplateId(v ?? null)}
                disabled={tplLoading || !deliveredTemplates.length}
                placeholder={tplLoading ? 'Loading templates...' : 'No templates'}
              />

              <Textarea label="Preview" value={podPreview} readOnly autosize minRows={3} />
              <Text size="xs" c="dimmed">
                If WhatsApp isn’t configured, this will be logged instead (demo-safe).
              </Text>
            </>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setPodOpen(false)} disabled={podBusy}>
              Cancel
            </Button>
            <Button onClick={submitPod} loading={podBusy}>
              Save POD
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={actionOpen}
        onClose={() => setActionOpen(false)}
        title={actionStatus ? `Confirm: ${labelStatus(actionStatus)}` : 'Confirm update'}
      >
        <Stack gap="sm">
          <Text size="sm">{selected ? `${selected.tracking_code} • ${selected.destination ?? '-'}` : ''}</Text>

          <Checkbox
            label="Send update to customer"
            checked={actionSendUpdate}
            onChange={(e) => setActionSendUpdate(e.currentTarget.checked)}
            disabled={tplLoading}
          />

          {actionSendUpdate ? (
            <>
              <Select
                label="Message template"
                data={actionTemplates.map((t) => ({ value: t.id, label: labelStatus(t.status as ShipmentStatus) }))}
                value={actionTemplateId}
                onChange={(v) => setActionTemplateId(v ?? null)}
                disabled={tplLoading || !actionTemplates.length}
                placeholder={tplLoading ? 'Loading templates...' : 'No templates'}
              />
              {!tplLoading && actionTemplates.length === 0 ? (
  <Text size="xs" c="dimmed">
    No enabled templates for this status yet. Confirm will still update the status; the message will be skipped.
    Create one in Messages → “New template”.
  </Text>
) : null}

              <Textarea label="Preview" value={actionPreview} readOnly autosize minRows={3} />
              <Text size="xs" c="dimmed">
                If WhatsApp isn’t configured, this will be logged instead (demo-safe).
              </Text>
            </>
          ) : null}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setActionOpen(false)} disabled={actionBusy}>
              Cancel
            </Button>
   <Button
  onClick={confirmStatusAction}
  loading={actionBusy}
  disabled={actionBusy || (actionSendUpdate && actionTemplates.length > 0 && !actionTemplateId)}
>
  Confirm
</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}


