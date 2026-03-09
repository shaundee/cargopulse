'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  ActionIcon,
  Alert,
  Anchor,
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  FileButton,
  Group,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconBolt,
  IconBrandWhatsapp,
  IconBuilding,
  IconCheck,
  IconCopy,
  IconCreditCard,
  IconExternalLink,
  IconGift,
  IconLink,
  IconLock,
  IconLogout,
  IconMap,
  IconMessage,
  IconPackage,
  IconPhoto,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { PLAN_LIMITS, canUseAgentPortal, getPlanTier, getDisplayPlanTier } from '@/lib/billing/plan';
import AgentsSettingsPage from './agents/page';

type Org = { id: string; name: string; support_phone: string | null; logo_url: string | null; origin_country: string | null };
type Billing = {
  status: string;
  plan_tier?: string | null;
  shipment_count?: number | null;
  billing_period_start?: string | null;
  current_period_end?: string | null;
  stripe_customer_id?: string | null;
} | null;

const DISPLAY_PRICING = {
  starter: {
    price: '£39',
    suffix: '/month',
    shipments: '75 shipments/mo',
    overage: '+£0.40 per extra shipment',
  },
  pro: {
    price: '£99',
    suffix: '/month',
    shipments: '250 shipments/mo',
    overage: '+£0.15 per extra shipment after 250',
  },
  flex: {
    price: '£9',
    suffix: '/month + £0.90 per shipment',
  },
} as const;

// ─── Org Profile Tab ──────────────────────────────────────────────────────────

const COUNTRY_OPTIONS = [
  { value: 'GB', label: '🇬🇧 United Kingdom' },
  { value: 'US', label: '🇺🇸 United States' },
  { value: 'CA', label: '🇨🇦 Canada' },
  { value: 'CN', label: '🇨🇳 China' },
  { value: 'IN', label: '🇮🇳 India' },
  { value: 'AE', label: '🇦🇪 UAE' },
  { value: 'DE', label: '🇩🇪 Germany' },
  { value: 'FR', label: '🇫🇷 France' },
  { value: 'NL', label: '🇳🇱 Netherlands' },
  { value: 'NG', label: '🇳🇬 Nigeria' },
  { value: 'GH', label: '🇬🇭 Ghana' },
  { value: 'JM', label: '🇯🇲 Jamaica' },
  { value: 'BB', label: '🇧🇧 Barbados' },
  { value: 'TT', label: '🇹🇹 Trinidad & Tobago' },
  { value: 'GY', label: '🇬🇾 Guyana' },
  { value: 'LC', label: '🇱🇨 Saint Lucia' },
  { value: 'VC', label: '🇻🇨 St Vincent' },
];

function OrgProfileTab({ org, isAdmin }: { org: Org; isAdmin: boolean }) {
  const supabase = createSupabaseBrowserClient();
  const [name, setName] = useState(org.name ?? '');
  const [phone, setPhone] = useState(org.support_phone ?? '');
  const [country, setCountry] = useState(org.origin_country ?? '');
  const [logoUrl, setLogoUrl] = useState(org.logo_url ?? '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function uploadLogo(file: File | null) {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    setUploading(true);
    try {
      const res = await fetch('/api/org/upload-logo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileExt: ext }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? 'Upload failed');

      const { error: uploadErr } = await supabase.storage
        .from('logos')
        .uploadToSignedUrl(j.path, j.token, file, { contentType: file.type });

      if (uploadErr) throw new Error(uploadErr.message);

      setLogoUrl(j.publicUrl);
      notifications.show({ title: 'Logo uploaded', message: 'Click Save changes to apply.', color: 'green' });
    } catch (e: any) {
      notifications.show({ title: 'Upload failed', message: e?.message, color: 'red' });
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/org/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, support_phone: phone, origin_country: country, logo_url: logoUrl }),
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

          <Select
            label="Origin country"
            value={country || null}
            onChange={(v) => setCountry(v ?? '')}
            disabled={!isAdmin}
            placeholder="Select origin country"
            data={COUNTRY_OPTIONS}
            clearable
            searchable
            description="Where your shipments typically originate from"
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

      {/* Logo upload */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md"><IconPhoto size={16} /></ThemeIcon>
            <Text fw={700}>Organisation logo</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Your logo appears on customer tracking pages. PNG, JPG, SVG or WebP — max 2 MB recommended.
          </Text>

          <Group align="center" gap="md">
            <Avatar
              src={logoUrl || null}
              size={72}
              radius="md"
              color="blue"
            >
              <IconBuilding size={32} />
            </Avatar>

            <Stack gap="xs">
              {isAdmin && (
                <FileButton onChange={uploadLogo} accept="image/png,image/jpeg,image/webp,image/svg+xml">
                  {(props) => (
                    <Button
                      {...props}
                      variant="default"
                      size="sm"
                      loading={uploading}
                      leftSection={<IconPhoto size={14} />}
                    >
                      {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                    </Button>
                  )}
                </FileButton>
              )}
              {logoUrl && (
                <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                  Logo uploaded — click Save changes to confirm.
                </Text>
              )}
            </Stack>
          </Group>

          {logoUrl && isAdmin && (
            <Group>
              <Button
                variant="subtle"
                color="red"
                size="xs"
                onClick={() => setLogoUrl('')}
              >
                Remove logo
              </Button>
            </Group>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

function daysUntilReset(tier: string, periodEnd?: string | null): number | null {
  if (tier === 'free') {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return Math.ceil((next.getTime() - now.getTime()) / 86400000);
  }
  if (periodEnd) {
    const d = Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86400000);
    return d > 0 ? d : null;
  }
  return null;
}

interface PlanCardProps {
  name: string;
  tagline: string;
  price: string;
  priceSuffix: string;
  shipmentsPill: string;
  overageNote?: string;
  features: { label: string; available: boolean }[];
  isCurrent: boolean;
  isMostPopular?: boolean;
  accentColor: string;
  onSubscribe?: () => void;
  subscribeLoading?: boolean;
  isAdmin: boolean;
  cardTier: string;
  currentTier: string;
}

function PlanCard({
  name, tagline, price, priceSuffix, shipmentsPill, overageNote,
  features, isCurrent, isMostPopular, accentColor, onSubscribe,
  subscribeLoading, isAdmin, cardTier, currentTier,
}: PlanCardProps) {
  const tierOrder: Record<string, number> = { pause: -1, free: 0, flex: 0.5, starter: 1, pro: 2 };
  const isUpgrade = (tierOrder[cardTier] ?? 0) > (tierOrder[currentTier] ?? 0);

  return (
    <Box pos="relative">
      {isMostPopular && (
        <Badge
          pos="absolute"
          top={-12}
          style={{ left: '50%', transform: 'translateX(-50%)', zIndex: 1 }}
          color="indigo"
          variant="filled"
        >
          Most popular
        </Badge>
      )}
      <Paper
        withBorder
        p="lg"
        radius="md"
        h="100%"
        style={isCurrent ? { borderColor: `var(--mantine-color-${accentColor}-5)`, borderWidth: 2 } : undefined}
      >
        <Stack gap="sm" h="100%">
          <Stack gap={4}>
            <Group justify="space-between" align="flex-start">
              <Text fw={700} size="lg">{name}</Text>
              {isCurrent && <Badge color={accentColor} variant="light" size="sm">Current</Badge>}
            </Group>
            <Text size="xs" c="dimmed">{tagline}</Text>
          </Stack>

          <Group gap={4} align="baseline">
            <Text fw={800} size="xl">{price}</Text>
            <Text size="xs" c="dimmed">{priceSuffix}</Text>
          </Group>

          <Badge color={accentColor} variant="light" size="sm" style={{ width: 'fit-content' }}>
            {shipmentsPill}
          </Badge>
          {overageNote && <Text size="xs" c="dimmed">{overageNote}</Text>}

          <Divider />

          <Stack gap={6} style={{ flex: 1 }}>
            {features.map((f) => (
              <Group key={f.label} gap="xs" wrap="nowrap">
                {f.available ? (
                  <ThemeIcon size="xs" color="green" variant="light" radius="xl">
                    <IconCheck size={10} />
                  </ThemeIcon>
                ) : (
                  <ThemeIcon size="xs" color="gray" variant="light" radius="xl">
                    <IconLock size={10} />
                  </ThemeIcon>
                )}
                <Text size="sm" c={f.available ? undefined : 'dimmed'}>{f.label}</Text>
              </Group>
            ))}
          </Stack>

          {!isCurrent && isUpgrade && isAdmin && onSubscribe && (
            <Button mt="md" color={accentColor} variant="filled" fullWidth onClick={onSubscribe} loading={subscribeLoading}>
              Upgrade to {name} →
            </Button>
          )}
          {isCurrent && (
            <Button mt="md" color={accentColor} variant="light" fullWidth disabled>
              Your current plan
            </Button>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}

function BillingTab({ billing, isAdmin }: { billing: Billing; isAdmin: boolean }) {
  const [loading, setLoading] = useState<string | null>(null);
  const status = billing?.status ?? 'inactive';
  const tier = getPlanTier(billing as any);
  const isActive = status === 'active' || status === 'trialing';
  const shipmentCount = billing?.shipment_count ?? 0;
  const rawShipmentLimit = PLAN_LIMITS[tier].shipments;
  const shipmentLimit = Number.isFinite(rawShipmentLimit) && rawShipmentLimit > 0 ? rawShipmentLimit : null;
  const resetDays = daysUntilReset(tier, billing?.current_period_end);
  const usagePct = shipmentLimit ? Math.min((shipmentCount / shipmentLimit) * 100, 100) : 0;
  const progressColor = usagePct > 60 ? 'orange' : 'violet';
  const displayTier = getDisplayPlanTier(billing as any);

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

  const sharedFeatures = [
    { label: 'Shipment tracking', available: true },
    { label: 'Customer page', available: true },
  ];

  return (
    <Stack gap="md">
      {(tier === 'flex' || tier === 'pause') && (
        <Alert
          color={tier === 'flex' ? 'orange' : 'gray'}
          variant='light'
          icon={tier === 'flex' ? <IconBolt size={16} /> : <IconLock size={16} />}
        >
          {tier === 'flex'
            ? `You are on Flex (${DISPLAY_PRICING.flex.price}${DISPLAY_PRICING.flex.suffix}). Every shipment is billed as metered usage.`
            : 'Your account is paused. Shipment history stays in place, but new shipment creation is disabled until you move back to an active plan.'}
        </Alert>
      )}

      {/* Usage meter — free and starter only */}
      {shipmentLimit !== null && (
        <Paper withBorder p="lg" radius="md">
          <Group justify="space-between">
            <Group gap="sm">
              <ThemeIcon variant="light" color="violet" size="lg">
                <IconPackage size={18} />
              </ThemeIcon>
              <Stack gap={0}>
                <Text fw={700}>Shipments this month</Text>
                {resetDays !== null && (
                  <Text size="xs" c="dimmed">Resets in {resetDays} day{resetDays !== 1 ? 's' : ''}</Text>
                )}
              </Stack>
            </Group>
            <Text size="xl" fw={700}>{shipmentCount} / {shipmentLimit}</Text>
          </Group>
          <Progress mt="sm" value={usagePct} color={progressColor} size="md" radius="xl" />
          {usagePct > 60 && (
            <Alert mt="sm" color="yellow" icon={<IconBolt size={16} />} variant="light">
              You're over 60% of your monthly allowance.
            </Alert>
          )}
        </Paper>
      )}

      {/* Plan cards */}
      <SimpleGrid cols={3} spacing="md">
        <PlanCard
          name="Free"
          tagline="Get started, no card needed"
          price="£0"
          priceSuffix="/forever"
          shipmentsPill="10 shipments/mo"
          features={[
            ...sharedFeatures,
            { label: 'WhatsApp updates', available: false },
            { label: 'Agent portal', available: false },
            { label: 'BOL / PDF receipts', available: false },
            { label: 'Multi-destination', available: false },
          ]}
          isCurrent={displayTier === 'free'}
          accentColor="gray"
          isAdmin={isAdmin}
          cardTier="free"
          currentTier={displayTier}
        />
        <PlanCard
          name="Starter"
          tagline="For operators sending regular weekly shipments"
          price={DISPLAY_PRICING.starter.price}
          priceSuffix={DISPLAY_PRICING.starter.suffix}
          shipmentsPill={DISPLAY_PRICING.starter.shipments}
          overageNote={DISPLAY_PRICING.starter.overage}
          features={[
            ...sharedFeatures,
            { label: 'WhatsApp updates', available: true },
            { label: 'Branded tracking page', available: true },
            { label: 'Single destination workflow', available: true },
            { label: 'Agent portal', available: false },
            { label: 'BOL / PDF receipts', available: false },
            { label: 'Multi-destination', available: false },
          ]}
          isCurrent={displayTier === 'starter'}
          accentColor="teal"
          onSubscribe={() => go('/api/billing/checkout', { plan: 'starter' })}
          subscribeLoading={loading === '/api/billing/checkout{"plan":"starter"}'}
          isAdmin={isAdmin}
          cardTier="starter"
          currentTier={displayTier}
        />
        <PlanCard
          name="Pro"
          tagline="For established shippers running a real ops workflow"
          price={DISPLAY_PRICING.pro.price}
          priceSuffix={DISPLAY_PRICING.pro.suffix}
          shipmentsPill={DISPLAY_PRICING.pro.shipments}
          overageNote={DISPLAY_PRICING.pro.overage}
          features={[
            ...sharedFeatures,
            { label: 'WhatsApp updates', available: true },
            { label: 'Agent portal', available: true },
            { label: 'BOL / PDF receipts', available: true },
            { label: 'Multi-destination', available: true },
            { label: 'Bulk import tools', available: true },
          ]}
          isCurrent={displayTier === 'pro'}
          isMostPopular
          accentColor="indigo"
          onSubscribe={() => go('/api/billing/checkout', { plan: 'pro' })}
          subscribeLoading={loading === '/api/billing/checkout{"plan":"pro"}'}
          isAdmin={isAdmin}
          cardTier="pro"
          currentTier={displayTier}
        />
      </SimpleGrid>

      {/* Bottom row */}
      <SimpleGrid cols={2} spacing="md">
        {/* FAQ */}
        <Paper withBorder p="md" radius="md">
          <Text fw={700} mb="sm">Common questions</Text>
          <Stack gap={4}>
            <Text size="sm" fw={600} c="blue.7">What happens when I hit my limit?</Text>
            <Text size="sm" c="dimmed" mb="sm">On Free, you'll be prompted to upgrade. On Starter and Pro, extra shipments are billed automatically once you pass the included allowance.</Text>
            <Text size="sm" fw={600} c="blue.7">Can I switch plans anytime?</Text>
            <Text size="sm" c="dimmed" mb="sm">Yes — upgrade instantly, downgrade at the end of your billing cycle. No lock-in.</Text>
            <Text size="sm" fw={600} c="blue.7">Do you charge per WhatsApp message?</Text>
            <Text size="sm" c="dimmed" mb="sm">No. Plans are based on shipment usage so you don't have to think about message counting.</Text>
            <Text size="sm" fw={600} c="blue.7">Do you have a low-volume option?</Text>
            <Text size="sm" c="dimmed" mb="sm">Yes — ask us about Flex pricing for slower months: {DISPLAY_PRICING.flex.price}{DISPLAY_PRICING.flex.suffix}.</Text>
            <Text size="sm" fw={600} c="blue.7">Do my customers see any branding?</Text>
            <Text size="sm" c="dimmed">Tracking pages show your company name and logo. CargoPulse branding is minimal on paid plans.</Text>
          </Stack>
        </Paper>

        {/* Help */}
        <Paper withBorder p="md" radius="md">
          <Text fw={700} mb="xs">Need help deciding?</Text>
          <Text size="sm" c="dimmed" mb="xs">
            Start with a real plan that matches your shipment volume, then move up only when the workflow gets heavier.
          </Text>
          <Text size="sm" c="dimmed" mb="md">
            Low-volume or seasonal operator? Ask about Flex pricing to keep your account active without paying for a full ops plan.
          </Text>
          <Button
            variant="default"
            fullWidth
            leftSection={<IconBrandWhatsapp size={16} />}
            component="a"
            href="https://wa.me/447700900000"
            target="_blank"
          >
            Chat with us on WhatsApp
          </Button>
          {isAdmin && isActive && (
            <Button
              variant="default"
              fullWidth
              leftSection={<IconExternalLink size={16} />}
              mt="xs"
              onClick={() => go('/api/billing/portal')}
              loading={loading === '/api/billing/portal{}'}
            >
              Manage subscription in Stripe
            </Button>
          )}
        </Paper>
      </SimpleGrid>
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

// ─── Destinations Tab ─────────────────────────────────────────────────────────

const OPTIONAL_STATUS_OPTIONS = [
  { value: 'customs_processing', label: 'Customs processing' },
  { value: 'customs_cleared',    label: 'Customs cleared' },
  { value: 'awaiting_collection', label: 'Awaiting collection' },
] as const;

type DestinationRow = { id: string; name: string; enabled_statuses: string[] };

function DestinationsTab({ isAdmin }: { isAdmin: boolean }) {
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/destinations', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setDestinations(j.destinations ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle(dest: DestinationRow, statusValue: string, checked: boolean) {
    const next = checked
      ? [...dest.enabled_statuses, statusValue]
      : dest.enabled_statuses.filter((s) => s !== statusValue);

    // Optimistic update
    setDestinations((prev) =>
      prev.map((d) => d.id === dest.id ? { ...d, enabled_statuses: next } : d)
    );

    setSaving(dest.id + statusValue);
    try {
      const res = await fetch('/api/destinations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dest.id, enabled_statuses: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Save failed');
    } catch (e: any) {
      // Revert on failure
      setDestinations((prev) =>
        prev.map((d) => d.id === dest.id ? { ...d, enabled_statuses: dest.enabled_statuses } : d)
      );
      notifications.show({ title: 'Save failed', message: e?.message, color: 'red' });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Stack gap="md">
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md"><IconMap size={16} /></ThemeIcon>
            <Text fw={700}>Destination statuses</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Enable optional status steps per destination. These appear in the status picker when updating a shipment to that destination.
          </Text>
        </Stack>
      </Paper>

      {loading ? (
        <Text size="sm" c="dimmed">Loading destinations…</Text>
      ) : destinations.length === 0 ? (
        <Text size="sm" c="dimmed">No active destinations configured.</Text>
      ) : (
        <Stack gap="sm">
          {destinations.map((dest) => (
            <Paper key={dest.id} withBorder p="md" radius="md">
              <Stack gap="xs">
                <Text fw={600}>{dest.name}</Text>
                <Text size="xs" c="dimmed">Enables extra status steps for this destination</Text>
                <Group gap="xl" mt={4}>
                  {OPTIONAL_STATUS_OPTIONS.map((opt) => (
                    <Checkbox
                      key={opt.value}
                      label={opt.label}
                      checked={dest.enabled_statuses.includes(opt.value)}
                      disabled={!isAdmin || saving === dest.id + opt.value}
                      onChange={(e) => toggle(dest, opt.value, e.currentTarget.checked)}
                    />
                  ))}
                </Group>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────

function AgentsTab({ billing, isAdmin, onUpgrade }: { billing: Billing; isAdmin: boolean; onUpgrade: () => void }) {
  if (!canUseAgentPortal(billing as any)) {
    return (
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm" align="center" py="xl">
          <ThemeIcon size={48} radius="xl" variant="light" color="indigo">
            <IconUsers size={24} />
          </ThemeIcon>
          <Text fw={600} ta="center">Agent portal is a Pro feature</Text>
          <Text size="sm" c="dimmed" ta="center" maw={320}>
            Upgrade to Pro (£99/mo) to invite destination agents and give them scoped portal access for their location.
          </Text>
          {isAdmin && (
            <Button color="indigo" onClick={onUpgrade}>Upgrade to Pro →</Button>
          )}
        </Stack>
      </Paper>
    );
  }
  return <AgentsSettingsPage />;
}

// ─── Referrals Tab ────────────────────────────────────────────────────────────

type ReferralRow = {
  id: string;
  status: string;
  created_at: string;
  completed_at?: string | null;
  referrer_credit_applied: boolean;
};

function ReferralsTab() {
  const [data, setData] = useState<{
    referral_code: string;
    referral_link: string;
    referrals: ReferralRow[];
    stats: { total_referred: number; total_completed: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/referrals')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function copy() {
    if (!data?.referral_link) return;
    navigator.clipboard.writeText(data.referral_link).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    if (!data?.referral_link) return;
    const msg = `Hey! I use Cargo44 to track my shipments and send WhatsApp updates to customers. Sign up with my link and get 50% off your first month: ${data.referral_link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  if (loading) {
    return <Text size="sm" c="dimmed">Loading…</Text>;
  }

  const rows = data?.referrals ?? [];

  return (
    <Stack gap="md">
      {/* Stats */}
      <SimpleGrid cols={2} spacing="md">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>Shippers referred</Text>
          <Text size="xl" fw={800}>{data?.stats.total_referred ?? 0}</Text>
        </Paper>
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" tt="uppercase" fw={700} mb={4}>Credit earned</Text>
          <Text size="xl" fw={800}>£{(data?.stats.total_completed ?? 0) * 10}</Text>
          <Text size="xs" c="dimmed">£10 per completed referral</Text>
        </Paper>
      </SimpleGrid>

      {/* Referral link */}
      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" size="md" color="violet"><IconGift size={16} /></ThemeIcon>
            <Text fw={700}>Your referral link</Text>
          </Group>
          <Text size="sm" c="dimmed">
            Share this link. When a new shipper signs up and creates their first shipment, you get{' '}
            <strong>£10 account credit</strong> and they get <strong>50% off their first month</strong>.
          </Text>
          <Group gap="xs" align="flex-end">
            <TextInput
              value={data?.referral_link ?? ''}
              readOnly
              style={{ flex: 1 }}
              leftSection={<IconLink size={14} />}
            />
            <ActionIcon size={36} variant="light" color="indigo" onClick={copy} title="Copy link">
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </ActionIcon>
          </Group>
          <Button
            variant="light"
            color="green"
            leftSection={<IconBrandWhatsapp size={16} />}
            onClick={shareWhatsApp}
          >
            Share via WhatsApp
          </Button>
        </Stack>
      </Paper>

      {/* How it works */}
      <Paper withBorder p="md" radius="md">
        <Text fw={700} mb="sm">How it works</Text>
        <Stack gap="xs">
          {[
            'Share your referral link with another freight shipper',
            'They sign up and create their first shipment',
            'You get £10 credit · They get 50% off their first month',
          ].map((step, i) => (
            <Group key={i} gap="sm" wrap="nowrap">
              <Badge circle size="lg" variant="filled" color="indigo" style={{ flexShrink: 0 }}>
                {i + 1}
              </Badge>
              <Text size="sm">{step}</Text>
            </Group>
          ))}
        </Stack>
      </Paper>

      {/* History */}
      {rows.length > 0 && (
        <Paper withBorder p="md" radius="md">
          <Text fw={700} mb="sm">Referral history</Text>
          <Stack gap="xs">
            {rows.map((r) => (
              <Group key={r.id} justify="space-between">
                <Text size="sm" c="dimmed">
                  {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
                <Badge
                  color={r.status === 'completed' ? 'green' : 'yellow'}
                  variant="light"
                  size="sm"
                >
                  {r.status === 'completed' ? '£10 earned' : 'Pending — awaiting first shipment'}
                </Badge>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}

      {rows.length === 0 && (
        <Alert icon={<IconGift size={16} />} color="violet" variant="light">
          <Text size="sm">No referrals yet. Share your link to start earning!</Text>
        </Alert>
      )}
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
  const [activeTab, setActiveTab] = useState<string | null>('org');

  return (
    <Stack gap="md">
      <Stack gap={2}>
        <Title order={3}>Settings</Title>
        <Text size="sm" c="dimmed">{org.name}</Text>
      </Stack>

      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="org" leftSection={<IconBuilding size={14} />}>Organisation</Tabs.Tab>
          <Tabs.Tab value="billing" leftSection={<IconCreditCard size={14} />}>Billing</Tabs.Tab>
          <Tabs.Tab value="destinations" leftSection={<IconMap size={14} />}>Destinations</Tabs.Tab>
          <Tabs.Tab value="messaging" leftSection={<IconBrandWhatsapp size={14} />}>Messaging</Tabs.Tab>
          <Tabs.Tab value="agents" leftSection={<IconUsers size={14} />}>Agents</Tabs.Tab>
          <Tabs.Tab value="referrals" leftSection={<IconGift size={14} />}>Referrals</Tabs.Tab>
          <Tabs.Tab value="account" leftSection={<IconUser size={14} />}>Account</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="org" pt="md">
          <OrgProfileTab org={org} isAdmin={isAdmin} />
        </Tabs.Panel>
        <Tabs.Panel value="billing" pt="md">
          <BillingTab billing={billing} isAdmin={isAdmin} />
        </Tabs.Panel>
        <Tabs.Panel value="destinations" pt="md">
          <DestinationsTab isAdmin={isAdmin} />
        </Tabs.Panel>
        <Tabs.Panel value="messaging" pt="md">
          <MessagingTab
            templateCount={templateCount}
            miscTemplateCount={miscTemplateCount}
            enabledTemplateCount={enabledTemplateCount}
          />
        </Tabs.Panel>
        <Tabs.Panel value="agents" pt="md">
          <AgentsTab billing={billing} isAdmin={isAdmin} onUpgrade={() => setActiveTab('billing')} />
        </Tabs.Panel>
        <Tabs.Panel value="referrals" pt="md">
          <ReferralsTab />
        </Tabs.Panel>
        <Tabs.Panel value="account" pt="md">
          <AccountTab userEmail={userEmail} userRole={userRole} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}