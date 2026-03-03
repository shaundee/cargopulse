'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Anchor,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Progress,
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
  IconLogout,
  IconMessage,
  IconUser,
} from '@tabler/icons-react';
import { PLAN_LIMITS, getPlanTier } from '@/lib/billing/plan';

type Org = { id: string; name: string; support_phone: string | null; logo_url: string | null };
type Billing = {
  status: string;
  plan_tier?: string | null;
  shipment_count?: number | null;
  billing_period_start?: string | null;
  current_period_end?: string | null;
  stripe_customer_id?: string | null;
} | null;

function planLabel(billing: Billing) {
  const status = billing?.status ?? 'inactive';
  const tier = getPlanTier(billing as any);
  if (status === 'past_due') return { label: 'Past due', color: 'orange' };
  if (status === 'canceled') return { label: 'Cancelled', color: 'red' };
  if (status === 'active' || status === 'trialing') {
    if (tier === 'starter') return { label: status === 'trialing' ? 'Starter Trial' : 'Starter', color: 'teal' };
    return { label: status === 'trialing' ? 'Pro Trial' : 'Pro', color: 'green' };
  }
  return { label: 'Free', color: 'gray' };
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
  const [loading, setLoading] = useState<string | null>(null);
  const status = billing?.status ?? 'inactive';
  const plan = planLabel(billing);
  const tier = getPlanTier(billing as any);
  const periodEnd = fmtDate(billing?.current_period_end);
  const isActive = status === 'active' || status === 'trialing';
  const shipmentCount = billing?.shipment_count ?? 0;
  const shipmentLimit = tier === 'pro' ? null : PLAN_LIMITS[tier].shipments;

  async function go(path: string, body?: object) {
    const key = path + JSON.stringify(body ?? {});
    setLoading(key);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error(json?.error ?? 'Billing error');
      window.location.href = json.url;
    } catch (e: any) {
      notifications.show({ title: 'Error', message: e?.message, color: 'red' });
      setLoading(null);
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

          {/* Shipment usage meter — free and starter only */}
          {isActive && shipmentLimit !== null && (
            <Stack gap={4}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Shipments this month</Text>
                <Text size="xs" fw={600}>
                  {shipmentCount} / {shipmentLimit}
                  {tier === 'starter' && shipmentCount > shipmentLimit && (
                    <Text span c="orange" size="xs"> (+{shipmentCount - shipmentLimit} overage)</Text>
                  )}
                </Text>
              </Group>
              <Progress
                value={Math.min((shipmentCount / shipmentLimit) * 100, 100)}
                color={shipmentCount >= shipmentLimit ? 'orange' : 'blue'}
                size="sm"
                radius="xl"
              />
            </Stack>
          )}

          {/* Upgrade options — shown when not on a paid plan */}
          {!isActive && (
            <Stack gap="xs">
              <Paper withBorder p="sm" radius="sm" bg="teal.0">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4} style={{ flex: 1 }}>
                    <Text size="sm" fw={600}>Starter — £19/month</Text>
                    <Text size="xs" c="dimmed">
                      75 shipments/month · WhatsApp updates · £0.40/shipment overage
                    </Text>
                  </Stack>
                  {isAdmin && (
                    <Button
                      size="xs"
                      variant="light"
                      color="teal"
                      onClick={() => go('/api/billing/checkout', { plan: 'starter' })}
                      loading={loading === '/api/billing/checkout{"plan":"starter"}'}
                    >
                      Subscribe
                    </Button>
                  )}
                </Group>
              </Paper>
              <Paper withBorder p="sm" radius="sm" bg="blue.0">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={4} style={{ flex: 1 }}>
                    <Text size="sm" fw={600}>Pro — £49/month</Text>
                    <Text size="xs" c="dimmed">
                      Unlimited shipments · Agent portal · BOL receipts · Multi-destination
                    </Text>
                  </Stack>
                  {isAdmin && (
                    <Button
                      size="xs"
                      onClick={() => go('/api/billing/checkout', { plan: 'pro' })}
                      loading={loading === '/api/billing/checkout{"plan":"pro"}'}
                    >
                      Subscribe
                    </Button>
                  )}
                </Group>
              </Paper>
            </Stack>
          )}

          {isAdmin && isActive && (
            <Group>
              <Button
                variant="light"
                leftSection={<IconExternalLink size={16} />}
                onClick={() => go('/api/billing/portal')}
                loading={loading !== null}
              >
                Manage billing
              </Button>
            </Group>
          )}

          {!isAdmin && (
            <Text size="xs" c="dimmed">Contact your admin to manage billing.</Text>
          )}
        </Stack>
      </Paper>

      {/* Plan comparison */}
      <Paper withBorder p="md" radius="md">
        <Text fw={700} mb="sm">Plan comparison</Text>
        <Stack gap="xs">
          {([
            ['Shipments/month', '10', '75 + overage', 'Unlimited'],
            ['WhatsApp updates', '—', '✓', '✓'],
            ['Tracking page', '—', '✓', '✓'],
            ['Agent portal', '—', '—', '✓'],
            ['BOL / PDF receipts', '—', '—', '✓'],
            ['Multi-destination', '—', '—', '✓'],
          ] as const).map(([feat, free, starter, pro]) => (
            <Group key={feat} justify="space-between" wrap="nowrap">
              <Text size="sm" style={{ flex: 1 }}>{feat}</Text>
              <Group gap="lg" wrap="nowrap">
                <Text size="xs" c="dimmed" w={60} ta="center">{free}</Text>
                <Text size="xs" c="dimmed" w={80} ta="center">{starter}</Text>
                <Text size="xs" c="dimmed" w={60} ta="center">{pro}</Text>
              </Group>
            </Group>
          ))}
          <Group justify="flex-end">
            <Group gap="lg" wrap="nowrap">
              <Text size="xs" fw={600} c="gray" w={60} ta="center">Free</Text>
              <Text size="xs" fw={600} c="teal" w={80} ta="center">Starter £19</Text>
              <Text size="xs" fw={600} c="green" w={60} ta="center">Pro £49</Text>
            </Group>
          </Group>
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
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

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
          <Divider />
          <Group>
            <Button
              variant="subtle"
              color="red"
              leftSection={<IconLogout size={16} />}
              onClick={signOut}
              loading={signingOut}
            >
              Sign out
            </Button>
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
      <Stack gap={2}>
        <Title order={3}>Settings</Title>
        <Text size="sm" c="dimmed">{org.name}</Text>
      </Stack>

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