'use client';

import { Button, Checkbox, Paper, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { ShipmentStatus, TemplateRow } from '../shipment-types';
import { statusLabel } from '../shipment-types';

function renderTemplate(body: string, vars: Record<string, string>) {
  return String(body ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

export function StatusUpdateCard({
  currentStatus,
  eventStatus,
  setEventStatus,
  eventNote,
  setEventNote,
  templates,
  customerName,
  trackingCode,
  destination,
  publicTrackingToken,
  onSave,
  saving,
}: {
  currentStatus: ShipmentStatus;
  eventStatus: ShipmentStatus;
  setEventStatus: (v: ShipmentStatus) => void;
  eventNote: string;
  setEventNote: (v: string) => void;
  templates: TemplateRow[];
  customerName: string;
  trackingCode: string;
  destination: string;
  publicTrackingToken?: string | null;
  onSave: (opts: { sendUpdate: boolean; templateId: string | null }) => void;
  saving: boolean;
}) {
  const isDelivered = currentStatus === 'delivered';

  const enabledTemplates = useMemo(() => templates.filter((t) => t.enabled), [templates]);
  const matchingTemplates = useMemo(
    () => enabledTemplates.filter((t) => t.status === eventStatus),
    [enabledTemplates, eventStatus]
  );

  const [sendUpdate, setSendUpdate] = useState(true);
  const [templateId, setTemplateId] = useState<string | null>(null);

  // Keep template selection aligned with status
  useEffect(() => {
    const list = matchingTemplates.length ? matchingTemplates : enabledTemplates;
    setTemplateId(list[0]?.id ?? null);
  }, [enabledTemplates, matchingTemplates, eventStatus]);

  const selectedTemplate = useMemo(() => {
    const list = matchingTemplates.length ? matchingTemplates : enabledTemplates;
    return list.find((t) => t.id === templateId) ?? null;
  }, [enabledTemplates, matchingTemplates, templateId]);

  const trackingUrl = useMemo(() => {
    if (!publicTrackingToken) return '';
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/t/${publicTrackingToken}`;
  }, [publicTrackingToken]);

  const preview = useMemo(() => {
    if (!sendUpdate) return '';
    if (!selectedTemplate?.body) return '';
    return renderTemplate(selectedTemplate.body, {
      customer_name: customerName ?? '',
      tracking_code: trackingCode ?? '',
      destination: destination ?? '',
      status: String(eventStatus ?? ''),
      note: eventNote ?? '',
      tracking_url: trackingUrl,

      // backwards compat
      name: customerName ?? '',
      code: trackingCode ?? '',
    });
  }, [customerName, destination, eventNote, eventStatus, selectedTemplate?.body, sendUpdate, trackingCode, trackingUrl]);

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Text fw={700}>Add status update</Text>

        {isDelivered ? (
          <Text size="sm" c="dimmed">
            Delivered — status is locked. (Use “Replace POD” if you need to update the photo.)
          </Text>
        ) : null}

        <Select
          label="Status"
          data={[
            { value: 'collected', label: statusLabel('collected') },
            { value: 'received', label: statusLabel('received') },
            { value: 'loaded', label: statusLabel('loaded') },
            { value: 'departed_uk', label: statusLabel('departed_uk') },
            { value: 'arrived_destination', label: statusLabel('arrived_destination') },
            { value: 'collected_by_customer', label: statusLabel('collected_by_customer') },
            { value: 'out_for_delivery', label: statusLabel('out_for_delivery') },
          ]}
          value={eventStatus}
          onChange={(v) => setEventStatus((v ?? 'received') as ShipmentStatus)}
          disabled={isDelivered}
        />

        <TextInput
          label="Note (optional)"
          value={eventNote}
          onChange={(e) => setEventNote(e.currentTarget.value)}
          placeholder="e.g., Loaded onto container #12"
          disabled={isDelivered}
        />

        <Checkbox
          label="Send update to customer"
          checked={sendUpdate}
          onChange={(e) => setSendUpdate(e.currentTarget.checked)}
          disabled={isDelivered}
        />

        {sendUpdate ? (
          <>
            <Select
              label="Message template"
              data={(matchingTemplates.length ? matchingTemplates : enabledTemplates).map((t) => ({
                value: t.id,
                label: t.name ? `${t.name}` : `${statusLabel(t.status)}`,
              }))}
              value={templateId}
              onChange={(v) => setTemplateId(v ?? null)}
              disabled={isDelivered || !(matchingTemplates.length ? matchingTemplates : enabledTemplates).length}
              placeholder="No templates available"
            />

            <Textarea
              label="Preview"
              value={preview}
              readOnly
              autosize
              minRows={3}
              disabled={isDelivered}
            />
            <Text size="xs" c="dimmed">
              If WhatsApp isn’t configured, this will be logged instead (so you can still demo).
            </Text>
          </>
        ) : null}

        <Button
          onClick={() => onSave({ sendUpdate, templateId })}
          loading={saving}
          disabled={isDelivered || (sendUpdate && !templateId)}
        >
          {sendUpdate ? 'Save status & send' : 'Save status'}
        </Button>
      </Stack>
    </Paper>
  );
}
