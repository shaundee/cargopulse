'use client';

import { Drawer, Paper, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

import type { ShipmentDetail, ShipmentEventRow, TemplateRow, MessageLogRow, ShipmentStatus } from '../shipment-types';
import { getExistingPod } from '../shipment-types';

import { ShipmentSummaryCard } from './ShipmentSummaryCard';
import { StatusUpdateCard } from './StatusUpdateCard';
import { SendUpdateCard } from './SendUpdateCard';
import { MessageHistoryCard } from './MessageHistoryCard';
import { PodCard } from './PodCard';
import { TimelineCard } from './TimelineCard';

export function ShipmentDetailDrawer({
  opened,
  shipmentId,
  onClose,
  onReloadRequested,
}: {
  opened: boolean;
  shipmentId: string | null;
  onClose: () => void;
  onReloadRequested: () => void;
}) {

     useEffect(() => {
  if (!opened) return;
  if (!shipmentId) return;
  void openShipmentDetail(shipmentId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [opened, shipmentId]);
  const router = useRouter();

  const [detailLoading, setDetailLoading] = useState(false);
  const [detailShipment, setDetailShipment] = useState<ShipmentDetail | null>(null);
  const [detailEvents, setDetailEvents] = useState<ShipmentEventRow[]>([]);
  const [detailLogs, setDetailLogs] = useState<MessageLogRow[]>([]);
  const [detailLogsLoading, setDetailLogsLoading] = useState(false);

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [sendTemplateId, setSendTemplateId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [eventStatus, setEventStatus] = useState<ShipmentStatus>('received');
  const [eventNote, setEventNote] = useState('');
  const [eventSaving, setEventSaving] = useState(false);
  const [autoLog, setAutoLog] = useState(true);

  const [podReceiver, setPodReceiver] = useState('');
  const [podFile, setPodFile] = useState<File | null>(null);
  const [podSaving, setPodSaving] = useState(false);

  const existingPod = getExistingPod(detailShipment);

  async function loadTemplatesAndSelect(currentStatus: ShipmentStatus) {
    try {
      const tRes = await fetch('/api/message-templates');
      const tCt = tRes.headers.get('content-type') || '';
      const tIsJson = tCt.includes('application/json');
      const tPayload = tIsJson ? await tRes.json() : await tRes.text();

      if (tRes.ok && tIsJson) {
        const list: TemplateRow[] = (tPayload.templates ?? []) as TemplateRow[];
        setTemplates(list);

        const match = list.find((t) => t.enabled && t.status === currentStatus);
        setSendTemplateId(match?.id ?? null);
      }
    } catch {
      // ignore
    }
  }

  async function loadLogs(shipmentId: string) {
    setDetailLogsLoading(true);
    try {
      const lRes = await fetch(`/api/messages/logs?shipment_id=${encodeURIComponent(shipmentId)}`);
      const lCt = lRes.headers.get('content-type') || '';
      const lIsJson = lCt.includes('application/json');
      const lPayload = lIsJson ? await lRes.json() : await lRes.text();

      if (lRes.ok && lIsJson) setDetailLogs(lPayload.logs ?? []);
      else setDetailLogs([]);
    } catch {
      setDetailLogs([]);
    } finally {
      setDetailLogsLoading(false);
    }
  }

  async function openShipmentDetail(shipmentId: string) {
    setDetailLoading(true);
    setDetailShipment(null);
    setDetailEvents([]);
    setDetailLogs([]);
    
 

    // reset send UI
    setTemplates([]);
    setSendTemplateId(null);

    try {
      const res = await fetch(`/api/shipments/detail?shipment_id=${encodeURIComponent(shipmentId)}`);
      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(isJson ? (payload?.error ?? `Failed to load (${res.status})`) : `Failed to load (${res.status})`);
      }

      setDetailShipment(payload.shipment);
      setDetailEvents(payload.events ?? []);
      setEventStatus(payload.shipment?.current_status ?? 'received');
      setEventNote('');

      await loadLogs(shipmentId);
      await loadTemplatesAndSelect((payload.shipment?.current_status ?? 'received') as ShipmentStatus);
    } catch (e: any) {
      notifications.show({
        title: 'Load failed',
        message: e?.message ?? 'Could not load shipment detail',
        color: 'red',
      });
      onClose();
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

      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(isJson ? (payload?.error ?? `Update failed (${res.status})`) : `Update failed (${res.status})`);
      }

      notifications.show({ title: 'Status updated', message: 'Timeline updated', color: 'green' });

      if (autoLog) {
        const match = templates.find((t) => t.enabled && t.status === eventStatus);
        if (match?.id) {
          await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId: detailShipment.id, templateId: match.id }),
          });
        }
      }

      onReloadRequested();
      await openShipmentDetail(detailShipment.id);
    } catch (e: any) {
      notifications.show({ title: 'Update failed', message: e?.message ?? 'Could not update status', color: 'red' });
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
        body: JSON.stringify({ shipmentId: detailShipment.id, templateId: sendTemplateId }),
      });

      const ct = res.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const payload = isJson ? await res.json() : await res.text();

      if (!res.ok) {
        throw new Error(isJson ? (payload?.error ?? `Send failed (${res.status})`) : `Send failed (${res.status})`);
      }

      notifications.show({ title: 'Sent (logged)', message: 'Message saved to logs', color: 'green' });

      await openShipmentDetail(detailShipment.id);
    } catch (e: any) {
      notifications.show({ title: 'Send failed', message: e?.message ?? 'Could not send message', color: 'red' });
    } finally {
      setSending(false);
    }
  }

  async function savePod() {
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

      // reload detail + list
      await openShipmentDetail(detailShipment.id);
      onReloadRequested();

      // auto-log delivered template if present (your existing behavior)
      try {
        const deliveredTpl = templates.find((t) => t.enabled && t.status === 'delivered');
        if (deliveredTpl?.id) {
          await fetch('/api/messages/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipmentId: detailShipment.id, templateId: deliveredTpl.id }),
          });
        }
      } catch {}
    } catch (e: any) {
      notifications.show({ title: 'POD failed', message: e?.message ?? 'Failed', color: 'red' });
    } finally {
      setPodSaving(false);
    }
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title={detailShipment ? `Shipment ${detailShipment.tracking_code}` : 'Shipment'}
    >
      <Stack gap="sm">
        {detailLoading ? (
          <Text c="dimmed">Loading…</Text>
        ) : !detailShipment ? (
          <Paper withBorder p="sm" radius="md">
            <Stack gap="xs">
              <Text c="dimmed">No shipment loaded</Text>

              {/* This button is optional but handy while wiring */}
              <Text size="sm" c="dimmed">
                Tip: click a row again if you closed the drawer.
              </Text>
            </Stack>
          </Paper>
        ) : (
          <>
            <ShipmentSummaryCard detailShipment={detailShipment} />

            <StatusUpdateCard
  currentStatus={detailShipment.current_status}
  eventStatus={eventStatus}
  setEventStatus={setEventStatus}
  eventNote={eventNote}
  setEventNote={setEventNote}
  autoLog={autoLog}
  setAutoLog={setAutoLog}
  onSave={addEvent}
  saving={eventSaving}
/>


          <SendUpdateCard
  templates={templates}
  sendTemplateId={sendTemplateId}
  setSendTemplateId={setSendTemplateId}
  onSend={sendUpdate}
  sending={sending}
  currentStatus={detailShipment.current_status}
/>

            <MessageHistoryCard detailLogs={detailLogs} detailLogsLoading={detailLogsLoading} />

            <PodCard
              existingPod={existingPod}
              podReceiver={podReceiver}
              setPodReceiver={setPodReceiver}
              podFile={podFile}
              setPodFile={setPodFile}
              podSaving={podSaving}
              onSavePod={savePod}
            />

            <TimelineCard detailEvents={detailEvents} />
          </>
        )}
      </Stack>
    </Drawer>
  );
}

function RegisterOpenFn({ register }: { register: () => void }) {
  // tiny helper component so we can run register on render
  register();
  return null;
}
