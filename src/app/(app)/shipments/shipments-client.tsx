'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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
  Checkbox,
  FileInput
} from '@mantine/core';
import type { MantineColor } from '@mantine/core';

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

type NewShipmentForm = {
  customerName: string;
  phone: string;
  destination: string;
  serviceType: 'depot' | 'door_to_door';
};

function statusLabel(s: ShipmentStatus) {
  switch (s) {
    case 'received':
      return 'Received';
    case 'loaded':
      return 'Loaded';
    case 'departed_uk':
      return 'Departed UK';
    case 'arrived_jamaica':
      return 'Arrived Jamaica';
    case 'out_for_delivery':
      return 'Out for delivery';
    case 'delivered':
      return 'Delivered';
  }
}

function statusBadgeColor(status: ShipmentStatus): MantineColor {
  switch (status) {
    case 'delivered':
      return 'green';
    case 'out_for_delivery':
      return 'teal';
    case 'arrived_jamaica':
      return 'cyan';
    case 'departed_uk':
      return 'blue';
    case 'loaded':
      return 'indigo';
    default:
      return 'gray';
  }
}

function formatWhen(v: unknown) {
  const d = v ? new Date(String(v)) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '-';
}

type TemplateRow = {
  id: string;
  status: ShipmentStatus;
  name: string;
  body: string;
  enabled: boolean;
};

export function ShipmentsClient({ initialShipments }: { initialShipments: ShipmentRow[] }) {
  const router = useRouter();

  // --- Create shipment drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<NewShipmentForm>({
    customerName: '',
    phone: '',
    destination: '',
    serviceType: 'depot',
  });

  // --- Search + table selection
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ShipmentRow[]>([]);

  // --- Detail drawer state
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailShipment, setDetailShipment] = useState<any>(null);
  const [detailEvents, setDetailEvents] = useState<any[]>([]);
  const [detailLogs, setDetailLogs] = useState<any[]>([]);
  const [detailLogsLoading, setDetailLogsLoading] = useState(false);

  //POD State
  const [podReceiver, setPodReceiver] = useState('');
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podSaving, setPodSaving] = useState(false);


  // --- Add event state
  const [eventStatus, setEventStatus] = useState<ShipmentStatus>('received');
  const [eventNote, setEventNote] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  
  const [autoLog, setAutoLog] = useState(true);


  // --- Send update state
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sendTemplateId, setSendTemplateId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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

  async function createShipment(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/shipments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
      setForm({ customerName: '', phone: '', destination: '', serviceType: 'depot' });

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

// openShipmentsDetails
  async function openShipmentDetail(shipmentId: string) {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailLogs([]);


    // reset send UI each time drawer opens
    setTemplates([]);
    setSendTemplateId(null);

    try {
      // Load shipment detail + timeline
        const res = await fetch(`/api/shipments/detail?shipment_id=${encodeURIComponent(shipmentId)}`);
        
        const contentType = res.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');
        const payload = isJson ? await res.json() : await res.text();    
        
        setDetailShipment(payload.shipment);
        setDetailEvents(payload.events ?? []);

        // Load message logs
setDetailLogsLoading(true);
try {
  const lRes = await fetch(`/api/messages/logs?shipment_id=${encodeURIComponent(shipmentId)}`);

  const lCt = lRes.headers.get('content-type') || '';
  const lIsJson = lCt.includes('application/json');
  const lPayload = lIsJson ? await lRes.json() : await lRes.text();

  if (lRes.ok && lIsJson) {
    setDetailLogs(lPayload.logs ?? []);
  } else {
    setDetailLogs([]);
  }
} catch {
  setDetailLogs([]);
} finally {
  setDetailLogsLoading(false);
}


      {
        
        if (!res.ok) {
          throw new Error(
            isJson ? (payload?.error ?? `Failed to load (${res.status})`) : `Failed to load (${res.status})`
          );
        }

        setDetailShipment(payload.shipment);
        setDetailEvents(payload.events ?? []);
        setEventStatus(payload.shipment?.current_status ?? 'received');
        setEventNote('');

        // Load templates for Send update + auto-select best match
        try {
          const tRes = await fetch('/api/message-templates');
          const tCt = tRes.headers.get('content-type') || '';
          const tIsJson = tCt.includes('application/json');
          const tPayload = tIsJson ? await tRes.json() : await tRes.text();

          if (tRes.ok && tIsJson) {
            const list: TemplateRow[] = (tPayload.templates ?? []) as TemplateRow[];
            setTemplates(list);

            const status = String(payload.shipment?.current_status ?? '');
            const match = list.find((t) => t.enabled && t.status === status);
            setSendTemplateId(match?.id ?? null);
          }
        } catch {
          // ignore template load errors; user can still update status/timeline
        }
      }
    } catch (e: any) {
      notifications.show({
        title: 'Load failed',
        message: e?.message ?? 'Could not load shipment detail',
        color: 'red',
      });
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
    
  }

  async function addEvent() {
    if (!detailShipment?.id) return;

    setEventSaving(true);
    try {
      const res = await fetch('/api/shipments/events/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: detailShipment.id,
          status: eventStatus,
          note: eventNote || null,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(
          isJson ? (payload?.error ?? `Update failed (${res.status})`) : `Update failed (${res.status})`
        );
      }

      notifications.show({
        title: 'Status updated',
        message: 'Timeline updated',
        color: 'green',
      });

      if (autoLog) {
  const match = templates.find((t: any) => t.enabled && t.status === eventStatus);
  if (match?.id) {
    await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipmentId: detailShipment.id,
        templateId: match.id,
      }),
    });
  }
}

      router.refresh();

      await openShipmentDetail(detailShipment.id);

    } catch (e: any) {
      notifications.show({
        title: 'Update failed',
        message: e?.message ?? 'Could not update status',
        color: 'red',
      });
    } finally {
      setEventSaving(false);
    }
  }

  async function sendUpdate() {
    if (!detailShipment?.id || !sendTemplateId) return;

    setSending(true);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId: detailShipment.id,
          templateId: sendTemplateId,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(isJson ? (payload?.error ?? `Send failed (${res.status})`) : `Send failed (${res.status})`);
      }

      notifications.show({
        title: 'Sent (logged)',
        message: 'Message saved to logs',
        color: 'green',
      });

      await openShipmentDetail(detailShipment.id);

    } catch (e: any) {
      notifications.show({
        title: 'Send failed',
        message: e?.message ?? 'Could not send message',
        color: 'red',
      });
    } finally {
      setSending(false);
    }
  }

const existingPod = Array.isArray(detailShipment?.pod)
  ? detailShipment.pod[0]
  : detailShipment?.pod;

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
          selectedRecords={selected}
          onSelectedRecordsChange={setSelected}
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

      {/* Create shipment drawer */}
      <Drawer opened={drawerOpen} onClose={() => setDrawerOpen(false)} position="right" size="md" title="New shipment">
        <form onSubmit={createShipment}>
          <Stack gap="sm">
            <TextInput
              label="Customer name"
              placeholder="e.g., Andre Brown"
              value={form.customerName}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((f) => ({ ...f, customerName: v }));
              }}
              required
            />

            <TextInput
              label="Phone"
              placeholder="+44..."
              value={form.phone}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((f) => ({ ...f, phone: v }));
              }}
              required
            />

            <TextInput
              label="Destination"
              placeholder="Kingston / St Catherine"
              value={form.destination}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setForm((f) => ({ ...f, destination: v }));
              }}
              required
            />

            <Select
              label="Service type"
              data={[
                { value: 'depot', label: 'Depot' },
                { value: 'door_to_door', label: 'Door to door' },
              ]}
              value={form.serviceType}
              onChange={(v) =>
                setForm((f) => ({
                  ...f,
                  serviceType: (v ?? 'depot') as NewShipmentForm['serviceType'],
                }))
              }
              required
            />

            <Button type="submit" loading={saving}>
              Create shipment
            </Button>
          </Stack>
        </form>
      </Drawer>

      {/* Shipment detail drawer */}
      <Drawer
        opened={detailOpen}
        onClose={() => setDetailOpen(false)}
        position="right"
        size="lg"
        title={detailShipment ? `Shipment ${detailShipment.tracking_code}` : 'Shipment'}
      >
        <Stack gap="sm">
          {detailLoading ? (
            <Text c="dimmed">Loading…</Text>
          ) : !detailShipment ? (
            <Text c="dimmed">No shipment loaded</Text>
          ) : (
            <>
              {/* Summary */}
              <Paper withBorder p="sm" radius="md">
                <Stack gap={4}>
                  <Text fw={700}>
                    {detailShipment.customers?.name ?? '—'} • {detailShipment.customers?.phone ?? '—'}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Destination: {detailShipment.destination}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Service: {detailShipment.service_type ?? detailShipment.serviceType ?? '-'}
                  </Text>
                  <Group gap="xs">
                    <Text size="sm" c="dimmed">
                      Status:
                    </Text>
                    <Badge color={statusBadgeColor(detailShipment.current_status as ShipmentStatus)} variant="light">
                      {statusLabel(detailShipment.current_status as ShipmentStatus)}
                    </Badge>
                  </Group>
                </Stack>
              </Paper>

              {/* Add status update */}
              <Paper withBorder p="sm" radius="md">
                <Stack gap="xs">
                  <Text fw={700}>Add status update</Text>

                  <Select
                    label="Status"
                    data={[
                      { value: 'received', label: 'Received' },
                      { value: 'loaded', label: 'Loaded' },
                      { value: 'departed_uk', label: 'Departed UK' },
                      { value: 'arrived_jamaica', label: 'Arrived Jamaica' },
                      { value: 'out_for_delivery', label: 'Out for delivery' },
                      { value: 'delivered', label: 'Delivered' },
                    ]}
                    value={eventStatus}
                    onChange={(v) => setEventStatus((v ?? 'received') as ShipmentStatus)}
                  />

                  <TextInput
                    label="Note (optional)"
                    value={eventNote}
                    onChange={(e) => setEventNote(e.currentTarget.value)}
                    placeholder="e.g., Loaded onto container #12"
                  />
                  <Checkbox
                   label="Log message using template for this status"
                   checked={autoLog}
                   onChange={(e) => setAutoLog(e.currentTarget.checked)}
                 />

                  

                  <Button onClick={addEvent} loading={eventSaving}>
                    Save update
                  </Button>
                </Stack>
              </Paper>

              {/* Send update */}
              <Paper withBorder p="sm" radius="md">
                <Stack gap="xs">
                  <Text fw={700}>Send update</Text>

                  <Select
                    label="Template"
                    data={templates
                      .filter((t) => t.enabled)
                      .map((t) => ({ value: t.id, label: statusLabel(t.status) }))}
                    value={sendTemplateId}
                    onChange={(v) => setSendTemplateId(v)}
                    placeholder="Choose a template"
                  />

                  <Button onClick={sendUpdate} loading={sending} disabled={!sendTemplateId}>
                    Send (log)
                  </Button>

                  <Text size="sm" c="dimmed">
                    This logs the rendered message in message_logs. WhatsApp sending comes next.
                  </Text>
                </Stack>
              </Paper>

              {/* message history*/}

              <Paper withBorder p="sm" radius="md">
  <Group justify="space-between" mb="xs">
    <Text fw={700}>Message history</Text>
    <Text size="sm" c="dimmed">
      Last 20
    </Text>
  </Group>

  {detailLogsLoading ? (
    <Text size="sm" c="dimmed">Loading…</Text>
  ) : detailLogs.length === 0 ? (
    <Text size="sm" c="dimmed">No messages logged yet</Text>
  ) : (
    <Stack gap="xs">
      {detailLogs.map((log) => (
        <Paper key={log.id} withBorder p="sm" radius="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={2} style={{ flex: 1 }}>
              <Group gap="xs">
                <Badge variant="light">{String(log.send_status ?? 'unknown')}</Badge>
                <Badge variant="light" color="gray">{String(log.provider ?? 'provider')}</Badge>
                {log.status ? (
                  <Badge variant="light" color="blue">{statusLabel(log.status)}</Badge>
                ) : null}
              </Group>

              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {String(log.body ?? '')}
              </Text>

              {log.error ? (
                <Text size="sm" c="red">
                  {String(log.error)}
                </Text>
              ) : null}

              <Text size="xs" c="dimmed">
                To: {String(log.to_phone ?? '-') }
              </Text>
            </Stack>

            <Text size="sm" c="dimmed">
              {formatWhen(log.created_at)}
            </Text>
          </Group>
        </Paper>
      ))}
    </Stack>
  )}
</Paper>

  {/* POD */}
  
{existingPod ? (
  <Paper withBorder p="sm" radius="md">
    <Group justify="space-between" mb="xs">
      <Text fw={700}>Proof of delivery</Text>
      <Badge color="green" variant="light">Saved</Badge>
    </Group>

    <Text size="sm" c="dimmed">
      Receiver: {existingPod.receiver_name ?? '-'}
    </Text>
    <Text size="sm" c="dimmed">
      Delivered: {formatWhen(existingPod.delivered_at)}
    </Text>

    <Text size="sm" c="dimmed">
      Photo path: {existingPod.photo_url ?? '-'}
    </Text>
  </Paper>
) : null}


            
              <Paper withBorder p="sm" radius="md">
  <Text fw={700} mb="xs">Proof of delivery</Text>

  <Stack gap="sm">
    <TextInput
      label="Receiver name"
      value={podReceiver}
      onChange={(e) => setPodReceiver(e.currentTarget.value)}
      placeholder="e.g., Marsha Brown"
    />

    <FileInput
      label="Photo"
      placeholder="Choose image…"
      accept="image/*"
      value={podFile}
      onChange={setPodFile}
    />

    <Button
      loading={podSaving}
      disabled={!detailShipment?.id || !podReceiver || !podFile}
      onClick={async () => {
        if (!detailShipment?.id || !podFile) return;

        setPodSaving(true);
        try {
          const fd = new FormData();
          fd.append('shipmentId', detailShipment.id);
          fd.append('receiverName', podReceiver);
          fd.append('file', podFile);

          const res = await fetch('/api/pod/complete', { method: 'POST', body: fd });

          const ct = res.headers.get('content-type') || '';
          const isJson = ct.includes('application/json');
          const payload = isJson ? await res.json() : await res.text();

          if (!res.ok) {
            throw new Error(isJson ? (payload?.error ?? `Failed (${res.status})`) : `Failed (${res.status})`);
          }

          notifications.show({ title: 'POD saved', message: 'Shipment marked delivered', color: 'green' });

          setPodReceiver('');
          setPodFile(null);

          await openShipmentDetail(detailShipment.id);
          router.refresh();
        } catch (e: any) {
          notifications.show({ title: 'POD failed', message: e?.message ?? 'Failed', color: 'red' });
        } finally {
          setPodSaving(false);
        }

        try {
  const deliveredTpl = templates.find((t: any) => t.enabled && t.status === 'delivered');
  if (deliveredTpl?.id) {
    await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipmentId: detailShipment.id,
        templateId: deliveredTpl.id,
      }),
    });
  }
} catch {}
      }}
    >
      Save POD
    </Button>

    <Text size="sm" c="dimmed">
      Uploads a photo, saves receiver name, and marks the shipment as delivered.
    </Text>
  </Stack>
</Paper>

 

              {/* Timeline */}
              <Paper withBorder p="sm" radius="md">
                <Text fw={700} mb="xs">
                  Timeline
                </Text>

                <Stack gap="xs">
                  {detailEvents.length === 0 ? (
                    <Text c="dimmed" size="sm">
                      No events
                    </Text>
                  ) : (
                    detailEvents.map((ev) => (
                      <Paper key={ev.id} withBorder p="sm" radius="md">
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={2}>
                            <Text fw={600}>{statusLabel(ev.status as ShipmentStatus)}</Text>
                            {ev.note ? (
                              <Text size="sm" c="dimmed">
                                {ev.note}
                              </Text>
                            ) : null}
                          </Stack>
                          <Text size="sm" c="dimmed">
                            {formatWhen(ev.occurred_at)}
                          </Text>
                        </Group>
                      </Paper>
                    ))
                  )}
                </Stack>
              </Paper>
            </>
          )}
        </Stack>
      </Drawer>
    </Stack>
  );
}