'use client';

import { useState } from 'react';
import {
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBrandWhatsapp,
  IconBuilding,
  IconCheck,
  IconCreditCard,
  IconExternalLink,
  IconMessage,
  IconUser,
} from '@tabler/icons-react';

type Org = { id: string; name: string; support_phone: string | null; logo_url: string | null };
type Billing = { status: string; current_period_end?: string | null; stripe_customer_id?: string | null } | null;

function planLabel(status: string) {
  switch (status) {
    case 'active': return { label: 'Pro', color: 'green' };
    case 'trialing': return { label: 'Trial', color: 'blue' };
    case 'past_due': return { label: 'Past due', color: 'orange' };
    case 'canceled': return { label: 'Cancelled', color: 'red' };
    default: return { label: 'Free', color: 'gray' };
  }
}

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Org Profile Tab ──────────────────────────────────────────────────────────

function OrgProfileTab({ org, isAdmin }: { org: Org; isAdmin: boolean }) {
  const [name, setName] = useState(org.name ?? '');
  const [phone, setPhone] = useState(org.support_phone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/org/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, support_phone: phone }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Save failed');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      notifications.show({ title: 'Saved', message: 'Organisation profile updated', color: 'green' });
    } catch (e: any) {
      notifications.show({ title: 'Save failed', message: e?.message, color: 'red' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md"><IconBuilding size={16} /></ThemeIcon>
            <Text fw={700}>Organisation details</Text>
          </Group>

          <Text size="sm" c="dimmed">
            This name and phone appear on your customer tracking page and shipment receipts.
          </Text>

          <TextInput
            label="Organisation name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            disabled={!isAdmin}
            placeholder="e.g. Speedy Freight Ltd"
          />

          <TextInput
            label="Support phone (WhatsApp)"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            disabled={!isAdmin}
            placeholder="+44 7700 900000"
            description="Shown as a 'WhatsApp us' button on the customer tracking page"
          />

          {isAdmin && (
            <Group>
              <Button
                leftSection={saved ? <IconCheck size={16} /> : undefined}
                onClick={save}
                loading={saving}
                disabled={!name.trim()}
              >
                {saved ? 'Saved' : 'Save changes'}
              </Button>
            </Group>
          )}

          {!isAdmin && (
            <Text size="xs" c="dimmed">Only admin/staff can edit organisation details.</Text>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

function BillingTab({ billing, isAdmin }: { billing: Billing; isAdmin: boolean }) {
  const [loading, setLoading] = useState(false);
  const status = billing?.status ?? 'inactive';
  const plan = planLabel(status);
  const periodEnd = fmtDate(billing?.current_period_end);
  const isActive = status === 'active' || status === 'trialing';

  async function go(path: string) {
    setLoading(true);
    try {
      const res = await fetch(path, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Billing error');
      window.location.href = json.url;
    } catch (e: any) {
      notifications.show({ title: 'Error', message: e?.message, color: 'red' });
      setLoading(false);
    }
  }

  return (
    <Stack gap="md">
      {/* Current plan */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md"><IconCreditCard size={16} /></ThemeIcon>
            <Text fw={700}>Current plan</Text>
          </Group>

          <Group gap="sm" align="center">
            <Badge color={plan.color} variant="filled" size="lg">{plan.label}</Badge>
            {periodEnd && (
              <Text size="sm" c="dimmed">
                {status === 'canceled' ? 'Access until' : 'Renews'}: {periodEnd}
              </Text>
            )}
          </Group>

          {!isActive && (
            <Paper withBorder p="sm" radius="sm" bg="blue.0">
              <Stack gap={4}>
                <Text size="sm" fw={600}>Upgrade to Pro — £49/month</Text>
                <Text size="xs" c="dimmed">
                  Unlimited shipments · WhatsApp customer updates · Agent portal · PDF receipts · Priority support
                </Text>
              </Stack>
            </Paper>
          )}

          {isAdmin && (
            <Group>
              {!isActive ? (
                <Button
                  leftSection={<IconCreditCard size={16} />}
                  onClick={() => go('/api/billing/checkout')}
                  loading={loading}
                >
                  Subscribe — £49/mo
                </Button>
              ) : (
                <Button
                  variant="light"
                  leftSection={<IconExternalLink size={16} />}
                  onClick={() => go('/api/billing/portal')}
                  loading={loading}
                >
                  Manage billing
                </Button>
              )}
            </Group>
          )}

          {!isAdmin && (
            <Text size="xs" c="dimmed">Contact your admin to manage billing.</Text>
          )}
        </Stack>
      </Paper>

      {/* What's included */}
      <Paper withBorder p="md" radius="md">
        <Text fw={700} mb="sm">What&apos;s included in Pro</Text>
        <Stack gap="xs">
          {[
            'Unlimited shipments & customers',
            'WhatsApp status updates to customers',
            'Customer tracking page (shareable link)',
            'Agent portal with destination scoping',
            'Field intake with photo capture',
            'PDF shipment receipts (BOL)',
            'Bulk status updates',
            'Priority email support',
          ].map((f) => (
            <Group key={f} gap="xs">
              <ThemeIcon size="xs" color="green" variant="light" radius="xl">
                <IconCheck size={10} />
              </ThemeIcon>
              <Text size="sm">{f}</Text>
            </Group>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}

// ─── Messaging Tab ────────────────────────────────────────────────────────────

function MessagingTab({
  templateCount,
  miscTemplateCount,
  enabledTemplateCount,
}: {
  templateCount: number;
  miscTemplateCount: number;
  enabledTemplateCount: number;
}) {
  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md"><IconBrandWhatsapp size={16} /></ThemeIcon>
            <Text fw={700}>WhatsApp templates</Text>
          </Group>

          <Text size="sm" c="dimmed">
            Templates control what message customers receive when you update a shipment status.
            You have <strong>{templateCount}</strong> status templates
            ({enabledTemplateCount} enabled) and <strong>{miscTemplateCount}</strong> misc templates
            (tracking link, nudge).
          </Text>

          <Group>
            <Button
              variant="light"
              leftSection={<IconMessage size={16} />}
              component="a"
              href="/messages"
              rightSection={<IconExternalLink size={13} />}
            >
              Manage templates
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder p="md" radius="md">
        <Stack gap="xs">
          <Text fw={700} size="sm">Twilio / WhatsApp setup</Text>
          <Text size="sm" c="dimmed">
            WhatsApp sending requires Twilio credentials set in your environment variables:
          </Text>
          {['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'].map((k) => (
            <Text key={k} size="xs" ff="monospace" c="blue">{k}</Text>
          ))}
          <Text size="xs" c="dimmed">
            Without these, messages are logged (not sent) — useful for testing.{' '}
            <Anchor href="https://www.twilio.com/docs/whatsapp" target="_blank" size="xs">
              Twilio docs →
            </Anchor>
          </Text>
        </Stack>
      </Paper>
    </Stack>
  );
}

// ─── Account Tab ─────────────────────────────────────────────────────────────

function AccountTab({ userEmail, userRole }: { userEmail: string; userRole: string }) {
  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md"><IconUser size={16} /></ThemeIcon>
            <Text fw={700}>Your account</Text>
          </Group>

          <Group justify="space-between">
            <Text size="sm" c="dimmed">Email</Text>
            <Text size="sm" ff="monospace">{userEmail}</Text>
          </Group>
          <Divider />
          <Group justify="space-between">
            <Text size="sm" c="dimmed">Role</Text>
            <Badge variant="light">{userRole}</Badge>
          </Group>
        </Stack>
      </Paper>
    </Stack>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function SettingsClient({
  org,
  billing,
  templateCount,
  miscTemplateCount,
  enabledTemplateCount,
  isAdmin,
  userEmail,
  userRole,
}: {
  org: Org;
  billing: Billing;
  templateCount: number;
  miscTemplateCount: number;
  enabledTemplateCount: number;
  isAdmin: boolean;
  userEmail: string;
  userRole: string;
}) {
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Stack gap={2}>
          <Title order={3}>Settings</Title>
          <Text size="sm" c="dimmed">{org.name}</Text>
        </Stack>
        <Badge
          color={planLabel(billing?.status ?? 'inactive').color}
          variant="light"
          size="lg"
        >
          {planLabel(billing?.status ?? 'inactive').label}
        </Badge>
      </Group>

      <Tabs defaultValue="org" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="org" leftSection={<IconBuilding size={14} />}>Organisation</Tabs.Tab>
          <Tabs.Tab value="billing" leftSection={<IconCreditCard size={14} />}>Billing</Tabs.Tab>
          <Tabs.Tab value="messaging" leftSection={<IconBrandWhatsapp size={14} />}>Messaging</Tabs.Tab>
          <Tabs.Tab value="account" leftSection={<IconUser size={14} />}>Account</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="org" pt="md">
          <OrgProfileTab org={org} isAdmin={isAdmin} />
        </Tabs.Panel>
        <Tabs.Panel value="billing" pt="md">
          <BillingTab billing={billing} isAdmin={isAdmin} />
        </Tabs.Panel>
        <Tabs.Panel value="messaging" pt="md">
          <MessagingTab
            templateCount={templateCount}
            miscTemplateCount={miscTemplateCount}
            enabledTemplateCount={enabledTemplateCount}
          />
        </Tabs.Panel>
        <Tabs.Panel value="account" pt="md">
          <AccountTab userEmail={userEmail} userRole={userRole} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}