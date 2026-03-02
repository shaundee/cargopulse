'use client';

import { Anchor, Badge, Button, Group, Paper, Select, Stack, Text, TextInput, Textarea } from '@mantine/core';
import { IconBrandWhatsapp } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import type { ShipmentStatus, TemplateRow } from '../shipment-types';
import { statusLabel, statusOrder } from '../shipment-types';

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
  stickyPrimaryAction,
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
  stickyPrimaryAction?: boolean;
}) {
  const isDelivered = currentStatus === 'delivered';

  const enabledTemplates = useMemo(() => templates.filter((t) => t.enabled), [templates]);
  const matchingTemplates = useMemo(
    () => enabledTemplates.filter((t) => t.status === eventStatus),
    [enabledTemplates, eventStatus]
  );

  const [templateId, setTemplateId] = useState<string | null>(null);

  // Auto-select best template when status changes
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
    if (!selectedTemplate?.body) return '';
    return renderTemplate(selectedTemplate.body, {
      customer_name: customerName ?? '',
      tracking_code: trackingCode ?? '',
      destination: destination ?? '',
      status: String(eventStatus ?? ''),
      note: eventNote ?? '',
      tracking_url: trackingUrl,
      name: customerName ?? '',
      code: trackingCode ?? '',
    });
  }, [customerName, destination, eventNote, eventStatus, selectedTemplate?.body, trackingCode, trackingUrl]);

  const hasTemplate = Boolean(templateId);
  const templateList = matchingTemplates.length ? matchingTemplates : enabledTemplates;
  const noTemplatesAvailable = templateList.length === 0;

  // Only offer statuses that are forward-moving (or same) from current
  const currentIdx = statusOrder.indexOf(currentStatus);
  const statusOptions = [
    { value: 'collected', label: statusLabel('collected') },
    { value: 'received', label: statusLabel('received') },
    { value: 'loaded', label: statusLabel('loaded') },
    { value: 'departed_uk', label: statusLabel('departed_uk') },
    { value: 'arrived_destination', label: statusLabel('arrived_destination') },
    { value: 'collected_by_customer', label: statusLabel('collected_by_customer') },
    { value: 'out_for_delivery', label: statusLabel('out_for_delivery') },
  ].map((opt) => {
    const optIdx = statusOrder.indexOf(opt.value as ShipmentStatus);
    return { ...opt, disabled: optIdx < currentIdx };
  });

  const actions = (
    <Group gap="xs" align="center">
      <Button
        leftSection={<IconBrandWhatsapp size={16} />}
        onClick={() => onSave({ sendUpdate: true, templateId })}
        loading={saving}
        disabled={isDelivered || !hasTemplate}
        flex={1}
      >
        Update &amp; Notify
      </Button>

      <Anchor
        component="button"
        size="sm"
        c="dimmed"
        onClick={() => onSave({ sendUpdate: false, templateId: null })}
        style={{ whiteSpace: 'nowrap', opacity: saving ? 0.5 : 1 }}
        aria-disabled={saving || isDelivered}
      >
        Save only
      </Anchor>
    </Group>
  );

  return (
    <Paper withBorder p="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Text fw={700}>Status update</Text>
          {!isDelivered && noTemplatesAvailable && (
            <Badge color="orange" variant="light" size="sm">No templates — save only</Badge>
          )}
        </Group>

        {isDelivered ? (
          <Text size="sm" c="dimmed">
            Delivered — status is locked. Use &ldquo;Replace POD&rdquo; to update the photo.
          </Text>
        ) : null}

        <Select
          label="New status"
          data={statusOptions}
          value={eventStatus}
          onChange={(v) => setEventStatus((v ?? currentStatus) as ShipmentStatus)}
          disabled={isDelivered}
        />

        <TextInput
          label="Note (optional)"
          value={eventNote}
          onChange={(e) => setEventNote(e.currentTarget.value)}
          placeholder="e.g., Loaded onto container #12"
          disabled={isDelivered}
        />

        {!noTemplatesAvailable && !isDelivered && (
          <>
            <Select
              label="Template"
              data={templateList.map((t) => ({
                value: t.id,
                label: t.name ?? statusLabel(t.status),
              }))}
              value={templateId}
              onChange={(v) => setTemplateId(v ?? null)}
            />

            {preview && (
              <Textarea
                label="Message preview"
                value={preview}
                readOnly
                autosize
                minRows={2}
                styles={{ input: { fontSize: 'var(--mantine-font-size-sm)', color: 'var(--mantine-color-dimmed)' } }}
              />
            )}

            <Text size="xs" c="dimmed">
              WhatsApp sends if configured — otherwise logged for demo/testing.
            </Text>
          </>
        )}

        {stickyPrimaryAction ? (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              background: 'var(--mantine-color-body)',
              paddingTop: 8,
              paddingBottom: 8,
              zIndex: 5,
              borderTop: '1px solid var(--mantine-color-gray-2)',
            }}
          >
            {actions}
          </div>
        ) : (
          actions
        )}
      </Stack>
    </Paper>
  );
}