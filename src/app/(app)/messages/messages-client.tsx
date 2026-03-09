'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Collapse,
  Drawer,
  Group,
  Stack,
  Switch,
  Text,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import { IconChevronDown, IconChevronUp, IconEdit } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

// ── Types ──────────────────────────────────────────────────────────────────────

type ShipmentStatus =
  | 'received'
  | 'collected'
  | 'loaded'
  | 'departed_uk'
  | 'arrived_destination'
  | 'customs_processing'
  | 'customs_cleared'
  | 'awaiting_collection'
  | 'out_for_delivery'
  | 'delivered'
  | 'collected_by_customer';

type TemplateRow = {
  id: string;
  status: ShipmentStatus;
  body: string;
  enabled: boolean;
};

// ── Config ─────────────────────────────────────────────────────────────────────

const TEMPLATE_CONFIG: Record<ShipmentStatus, { label: string; emoji: string; optional: boolean }> = {
  received:             { label: 'Received',            emoji: '📦', optional: false },
  collected:            { label: 'Collected',           emoji: '🤝', optional: false },
  loaded:               { label: 'Loaded',              emoji: '🚚', optional: false },
  departed_uk:          { label: 'Departed UK',         emoji: '✈️', optional: false },
  arrived_destination:  { label: 'Arrived',             emoji: '🏁', optional: false },
  customs_processing:   { label: 'Customs processing',  emoji: '🏛️', optional: true  },
  customs_cleared:      { label: 'Customs cleared',     emoji: '✅', optional: true  },
  awaiting_collection:  { label: 'Awaiting collection', emoji: '⏳', optional: true  },
  out_for_delivery:     { label: 'Out for delivery',    emoji: '🛵', optional: false },
  delivered:            { label: 'Delivered',           emoji: '🎉', optional: false },
  collected_by_customer:{ label: 'Collected by customer', emoji: '👋', optional: false },
};

const PHASES: Array<{ label: string; statuses: ShipmentStatus[] }> = [
  { label: 'Pickup',         statuses: ['received', 'collected'] },
  { label: 'In transit',     statuses: ['loaded', 'departed_uk'] },
  { label: 'At destination', statuses: ['arrived_destination', 'customs_processing', 'customs_cleared', 'awaiting_collection'] },
  { label: 'Delivery',       statuses: ['out_for_delivery', 'delivered', 'collected_by_customer'] },
];

const PHASE_COLORS: Record<string, string> = {
  'Pickup':         'var(--mantine-color-orange-5)',
  'In transit':     'var(--mantine-color-blue-5)',
  'At destination': 'var(--mantine-color-violet-5)',
  'Delivery':       'var(--mantine-color-green-5)',
};

const VARIABLES = [
  { key: '{{name}}',         desc: 'Customer name' },
  { key: '{{code}}',         desc: 'Tracking code' },
  { key: '{{destination}}',  desc: 'Destination' },
  { key: '{{tracking_url}}', desc: 'Tracking link' },
];

const SAMPLE: Record<string, string> = {
  name:         'Andre Brown',
  code:         'SM-AB1234',
  destination:  'Jamaica',
  tracking_url: 'https://track.cargopulse.app/t/abc123',
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function renderPreview(body: string): string {
  return body
    .replace(/\{\{name\}\}/g, SAMPLE.name)
    .replace(/\{\{code\}\}/g, SAMPLE.code)
    .replace(/\{\{destination\}\}/g, SAMPLE.destination)
    .replace(/\{\{tracking_url\}\}/g, SAMPLE.tracking_url);
}

/** Render body with {{variables}} highlighted in blue */
function BodyHighlighted({ body, size = 'sm' }: { body: string; size?: string }) {
  const parts = body.split(/(\{\{[^}]+\}\})/g);
  return (
    <Text size={size as any} lh={1.6} style={{ wordBreak: 'break-word' }}>
      {parts.map((part, i) =>
        /^\{\{.+\}\}$/.test(part) ? (
          <Text key={i} component="span" size={size as any} c="blue.5" fw={500}>{part}</Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

// ── Template card ──────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  phaseColor,
  onToggle,
  onEdit,
}: {
  template: TemplateRow;
  phaseColor: string;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (t: TemplateRow) => void;
}) {
  const cfg = TEMPLATE_CONFIG[template.status];

  return (
    <Box
      style={{
        border: '1px solid var(--mantine-color-gray-2)',
        borderRadius: 8,
        overflow: 'hidden',
        opacity: template.enabled ? 1 : 0.45,
        transition: 'opacity 0.2s',
        background: 'var(--mantine-color-white)',
      }}
    >
      {/* Header row */}
      <Group justify="space-between" px="md" py="sm">
        <Group gap="xs">
          <Text style={{ fontSize: 18, lineHeight: 1 }}>{cfg.emoji}</Text>
          <Text fw={600} size="sm">{cfg.label}</Text>
          {cfg.optional && (
            <Badge variant="light" color="yellow" size="xs" style={{ letterSpacing: '0.04em' }}>
              Optional
            </Badge>
          )}
        </Group>
        <Group gap="xs">
          <Switch
            size="sm"
            checked={template.enabled}
            onChange={e => onToggle(template.id, e.currentTarget.checked)}
          />
          <Button
            variant="subtle"
            size="xs"
            leftSection={<IconEdit size={12} />}
            onClick={() => onEdit(template)}
          >
            Edit
          </Button>
        </Group>
      </Group>

      {/* Message preview */}
      <Box px="md" pb="md">
        <Box
          style={{
            borderLeft: `3px solid ${phaseColor}`,
            paddingLeft: 10,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          <BodyHighlighted body={template.body} />
        </Box>
      </Box>
    </Box>
  );
}

// ── Edit drawer ────────────────────────────────────────────────────────────────

function EditDrawer({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateRow | null;
  onClose: () => void;
  onSaved: (updated: TemplateRow) => void;
}) {
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (template) setBody(template.body);
  }, [template]);

  const charCount = body.length;
  const charColor = charCount >= 500 ? (charCount >= 1000 ? 'red' : 'yellow.7') : 'dimmed';

  function insertVariable(v: string) {
    const el = textareaRef.current;
    if (!el) {
      setBody(b => b + v);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + v + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + v.length, start + v.length);
    });
  }

  async function handleSave() {
    if (!template) return;
    setSaving(true);
    try {
      const res = await fetch('/api/message-templates/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: template.id, body, enabled: template.enabled }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? 'Save failed');
      notifications.show({ title: 'Saved', message: 'Template updated', color: 'green' });
      onSaved({ ...template, body });
      onClose();
    } catch (e: any) {
      notifications.show({ title: 'Save failed', message: e?.message ?? 'Error', color: 'red' });
    } finally {
      setSaving(false);
    }
  }

  const cfg = template ? TEMPLATE_CONFIG[template.status] : null;
  const preview = renderPreview(body);

  return (
    <Drawer
      opened={!!template}
      onClose={onClose}
      position="right"
      size="md"
      title={
        cfg ? (
          <Group gap="xs">
            <Text style={{ fontSize: 18 }}>{cfg.emoji}</Text>
            <Text fw={600}>Edit — {cfg.label}</Text>
          </Group>
        ) : 'Edit template'
      }
    >
      <Stack gap="md" h="100%" style={{ display: 'flex', flexDirection: 'column' }}>
        {/* Quick-insert buttons */}
        <Stack gap={6}>
          <Text size="xs" fw={600} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Insert variable
          </Text>
          <Group gap="xs" wrap="wrap">
            {VARIABLES.map(v => (
              <Button
                key={v.key}
                size="xs"
                variant="light"
                color="blue"
                onClick={() => insertVariable(v.key)}
                style={{ fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11 }}
              >
                {v.key}
              </Button>
            ))}
          </Group>
        </Stack>

        {/* Textarea */}
        <Stack gap={4} style={{ flex: 1 }}>
          <Textarea
            ref={textareaRef}
            label="Message body"
            value={body}
            onChange={e => { const v = e.currentTarget.value; setBody(v); }}
            minRows={6}
            autosize
            styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 13 } }}
          />
          <Group justify="flex-end">
            <Text size="xs" c={charColor}>
              {charCount} characters{charCount >= 500 ? ' — consider shortening' : ''}
            </Text>
          </Group>
        </Stack>

        {/* WhatsApp preview */}
        <Stack gap={6}>
          <Text size="xs" fw={600} c="dimmed" style={{ textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Preview
          </Text>
          <Box
            style={{
              background: '#e5ddd5',
              borderRadius: 8,
              padding: '12px 12px 8px',
            }}
          >
            <Box
              style={{
                background: '#dcf8c6',
                borderRadius: '8px 8px 2px 8px',
                padding: '8px 10px',
                maxWidth: '85%',
                marginLeft: 'auto',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
              }}
            >
              <Text size="sm" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5, color: '#111' }}>
                {preview || <Text component="span" c="dimmed" size="sm">Start typing to see preview…</Text>}
              </Text>
              <Text size="xs" ta="right" style={{ color: '#667', marginTop: 2 }}>
                12:34 ✓✓
              </Text>
            </Box>
          </Box>
        </Stack>

        {/* Actions */}
        <Group gap="sm" mt="auto">
          <Button onClick={handleSave} loading={saving} style={{ flex: 1 }}>Save</Button>
          <Button variant="default" onClick={onClose} style={{ flex: 1 }}>Cancel</Button>
        </Group>
      </Stack>
    </Drawer>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

export function MessagesClient() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<TemplateRow | null>(null);
  const [showVars, setShowVars] = useState(false);

  async function loadTemplates() {
    setLoading(true);
    try {
      const res = await fetch('/api/message-templates');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Failed to load');
      setTemplates(data.templates ?? []);
    } catch (e: any) {
      notifications.show({ title: 'Load failed', message: e?.message, color: 'red' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadTemplates(); }, []);

  async function handleToggle(id: string, enabled: boolean) {
    // Optimistic update
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, enabled } : t));
    try {
      const res = await fetch('/api/message-templates/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) {
        // Revert on failure
        setTemplates(prev => prev.map(t => t.id === id ? { ...t, enabled: !enabled } : t));
        notifications.show({ message: 'Failed to update', color: 'red' });
      }
    } catch {
      setTemplates(prev => prev.map(t => t.id === id ? { ...t, enabled: !enabled } : t));
    }
  }

  function handleSaved(updated: TemplateRow) {
    setTemplates(prev => prev.map(t => t.id === updated.id ? updated : t));
  }

  const byStatus = Object.fromEntries(templates.map(t => [t.status, t]));

  return (
    <>
      <EditDrawer
        template={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
      />

      <Stack gap="lg">
        {/* Header */}
        <Stack gap={4}>
          <Text fw={700} size="xl">Message templates</Text>
          <Text c="dimmed" size="sm">
            Customise the WhatsApp messages your customers receive at each stage. Every template uses your business name automatically.
          </Text>
        </Stack>

        {/* Variables toggle */}
        <Box>
          <UnstyledButton onClick={() => setShowVars(v => !v)}>
            <Group gap="xs">
              <Text size="sm" c="blue">Show available variables</Text>
              {showVars ? <IconChevronUp size={14} color="var(--mantine-color-blue-6)" /> : <IconChevronDown size={14} color="var(--mantine-color-blue-6)" />}
            </Group>
          </UnstyledButton>
          <Collapse in={showVars}>
            <Box
              mt="xs"
              p="sm"
              style={{
                background: 'var(--mantine-color-gray-0)',
                border: '1px solid var(--mantine-color-gray-2)',
                borderRadius: 8,
              }}
            >
              <Stack gap="xs">
                {VARIABLES.map(v => (
                  <Group key={v.key} gap="sm">
                    <Text size="sm" ff="monospace" fw={600} c="blue.6">{v.key}</Text>
                    <Text size="sm" c="dimmed">— {v.desc}</Text>
                  </Group>
                ))}
              </Stack>
            </Box>
          </Collapse>
        </Box>

        {/* Template groups */}
        {loading ? (
          <Text c="dimmed" size="sm">Loading templates…</Text>
        ) : (
          PHASES.map(phase => {
            const phaseTemplates = phase.statuses
              .map(s => byStatus[s])
              .filter(Boolean) as TemplateRow[];

            if (phaseTemplates.length === 0) return null;

            return (
              <Stack key={phase.label} gap="xs">
                <Text
                  size="xs"
                  fw={700}
                  c="dimmed"
                  style={{ textTransform: 'uppercase', letterSpacing: '0.08em' }}
                >
                  {phase.label}
                </Text>
                {phaseTemplates.map(t => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    phaseColor={PHASE_COLORS[phase.label]}
                    onToggle={handleToggle}
                    onEdit={setEditing}
                  />
                ))}
              </Stack>
            );
          })
        )}
      </Stack>
    </>
  );
}
