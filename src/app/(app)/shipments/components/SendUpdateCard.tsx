'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Group, Paper, Select, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';

type TemplateRow = {
  id: string;
  status: string;
  body: string;
  enabled: boolean;
};

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

export function SendUpdateCard({
  disabled,
  shipmentId,
  currentStatus,
  templates,
  customerName,
  customerPhone,
  trackingCode,
  destination,
  publicTrackingToken,
  onSent,
}: {
  disabled: boolean;
  shipmentId: string;
  currentStatus: string;
  templates: TemplateRow[];
  customerName: string;
  customerPhone: string;
  trackingCode: string;
  destination: string;
  publicTrackingToken?: string | null;
  onSent?: () => void;
}) {
  const [sending, setSending] = useState(false);
  const enabledTemplates = useMemo(() => templates.filter((t) => t.enabled), [templates]);

  // Pick template based on current status
  const [templateId, setTemplateId] = useState<string | null>(null);

  useEffect(() => {
    const match = enabledTemplates.find((t) => String(t.status) === String(currentStatus));
    setTemplateId(match?.id ?? null);
  }, [currentStatus, enabledTemplates]);

  const selected = useMemo(
    () => enabledTemplates.find((t) => t.id === templateId) ?? null,
    [enabledTemplates, templateId]
  );

  const trackingUrl = useMemo(() => {
    if (!publicTrackingToken) return '';
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/t/${publicTrackingToken}`;
  }, [publicTrackingToken]);

  const preview = useMemo(() => {
    if (!selected?.body) return '';
    return renderTemplate(selected.body, {
      customer_name: customerName ?? '',
      name: customerName ?? '',
      tracking_code: trackingCode ?? '',
      code: trackingCode ?? '',
      destination: destination ?? '',
      status: currentStatus ?? '',
      tracking_url: trackingUrl ?? '',
    });
  }, [selected?.body, customerName, trackingCode, destination, currentStatus, trackingUrl]);

  async function send() {
    if (!templateId) return;

    setSending(true);
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId, templateId }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Send failed');

      if (json?.skipped) {
        const reason = String(json?.reason ?? 'skipped');
        notifications.show({
          title: 'Skipped',
          message: reason === 'duplicate_delivered' ? 'Delivered update already logged.' : reason,
          color: 'yellow',
        });
      } else if (json?.mode === 'sent') {
        notifications.show({
          title: 'Sent',
          message: 'WhatsApp update sent and logged.',
          color: 'green',
        });
      } else {
        const phoneNote = json?.phone_ok ? '' : ' (phone not valid for WhatsApp)';
        notifications.show({
          title: 'Logged',
          message: `Update logged${phoneNote}.`,
          color: 'blue',
        });
      }

      onSent?.();
    } catch (e: any) {
      notifications.show({ title: 'Send failed', message: e?.message ?? 'Request failed', color: 'red' });
    } finally {
      setSending(false);
    }
  }


  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text fw={800}>Send update</Text>
            <Text size="sm" c="dimmed">
              {customerPhone ? `To: ${customerPhone}` : 'No customer phone on file.'}
            </Text>
            {trackingUrl ? (
              <Text size="sm" c="dimmed">
                <a href={trackingUrl} target="_blank" rel="noreferrer">
                  Open tracking link
                </a>
              </Text>
            ) : null}
          </Stack>
          <Text size="sm" c="dimmed">
            Status: {currentStatus}
          </Text>
        </Group>

        <Select
          label="Template"
          placeholder="Choose a template"
          value={templateId}
          onChange={setTemplateId}
          data={enabledTemplates.map((t) => ({
            value: t.id,
            label: `${t.status}`,
          }))}
          disabled={disabled || enabledTemplates.length === 0}
        />

        <Textarea
          label="Preview"
          value={preview}
          readOnly
          minRows={3}
          autosize
          placeholder="Select a template to preview the rendered message."
        />

        <Group justify="flex-end">
          <Button
            onClick={send}
            loading={sending}
            disabled={disabled || !customerPhone || !templateId}
          >
            Send
          </Button>
        </Group>

        <Text size="xs" c="dimmed">
          Sends via WhatsApp (Twilio) when configured; otherwise logs only.
        </Text>
      </Stack>
    </Paper>
  );
}
