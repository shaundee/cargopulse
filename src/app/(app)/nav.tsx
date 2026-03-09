'use client';

import type { PlanTier } from '@/lib/billing/plan';


import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Button,
  Collapse,
  Flex,
  Group,
  NavLink,
  Progress,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCamera,
  IconChevronDown,
  IconLayoutDashboard,
  IconMessage,
  IconPackage,
  IconSettings,
  IconTruckDelivery,
  IconUsers,
  IconUserShare,
} from '@tabler/icons-react';

type Role = 'admin' | 'staff' | 'field' | 'agent';

interface NavProps {
  role: Role;
  orgName: string;
  planTier: PlanTier;
  shipmentCount: number;
  shipmentLimit: number | null;
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}

// ─── Persist open/closed state across sessions ────────────────────────────────

function usePersistedToggle(key: string, defaultOpen = true) {
  const [open, setOpen] = useState(defaultOpen);

  // Hydrate from localStorage after first render to avoid SSR mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setOpen(stored === 'true');
    } catch {}
  }, [key]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try { localStorage.setItem(key, String(next)); } catch {}
      return next;
    });
  }, [key]);

  return [open, toggle] as const;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || '?';
}

// ─── Collapsible group heading ────────────────────────────────────────────────

function GroupHeading({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <UnstyledButton
      onClick={onToggle}
      w="100%"
      px="md"
      py={6}
      mt={4}
    >
      <Group gap={5} align="center">
        <IconChevronDown
          size={11}
          style={{
            transition: 'transform 150ms ease',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            color: 'var(--mantine-color-dimmed)',
            flexShrink: 0,
          }}
        />
        <Text
          size="xs"
          fw={600}
          c="dimmed"
          style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}
        >
          {label}
        </Text>
      </Group>
    </UnstyledButton>
  );
}

// ─── Individual nav item with active indicator bar ────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  badge,
  pro,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  badge?: number;
  pro?: boolean;
}) {
  return (
    <Box pos="relative">
      {active && (
        <Box
          pos="absolute"
          style={{
            left: 0,
            top: 4,
            bottom: 4,
            width: 3,
            borderRadius: '0 3px 3px 0',
            backgroundColor: 'var(--mantine-color-violet-6)',
            zIndex: 1,
          }}
        />
      )}
      <NavLink
        component={Link}
        href={href}
        label={label}
        active={active}
        color="violet"
        leftSection={<Icon size={17} />}
        rightSection={
          badge !== undefined && badge > 0 ? (
            <Badge size="sm" circle color="violet" variant="filled">{badge}</Badge>
          ) : pro ? (
            <Badge size="xs" color="violet" variant="light" style={{ fontWeight: 600 }}>PRO</Badge>
          ) : null
        }
        style={{ borderRadius: 'var(--mantine-radius-sm)' }}
      />
    </Box>
  );
}

// ─── Bottom usage bar ─────────────────────────────────────────────────────────

function UsageBar({ count, limit }: { count: number; limit: number | null }) {
  if (limit === null) return null;
  const pct = Math.min((count / limit) * 100, 100);
  const color = pct >= 90 ? 'red' : pct >= 70 ? 'orange' : 'violet';
  return (
    <Stack gap={4}>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">Shipments</Text>
        <Text size="xs" fw={700} c={color}>{count}/{limit}</Text>
      </Group>
      <Progress value={pct} size="sm" radius="xl" color={color} />
    </Stack>
  );
}

// ─── Main nav ─────────────────────────────────────────────────────────────────

export function AppNav({
  role,
  orgName,
  planTier,
  shipmentCount,
  shipmentLimit,
  userName,
  userEmail,
  isAdmin,
}: NavProps) {
  const pathname = usePathname();
  const [shipmentsOpen, toggleShipments] = usePersistedToggle('nav-group-shipments', true);
  const [fieldOpsOpen, toggleFieldOps] = usePersistedToggle('nav-group-fieldops', true);

  const isAgent = role === 'agent';
  const isField = role === 'field';
  const isPro = planTier === 'pro';

  const tierColor =
    planTier === 'pro' ? 'indigo' :
    planTier === 'starter' ? 'teal' :
    planTier === 'flex' ? 'orange' :
    planTier === 'pause' ? 'gray' :
    'gray';

  return (
    <Flex direction="column" h="100%">

      {/* ── Brand ── */}
      <Box px="md" pt="md" pb="xs">
        <Stack gap={6}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logosmall.svg?v=4"
            alt="Cargo44"
            style={{ width: 64, height: 64 }}
          />
          <Group gap={5} align="center">
            <Text size="xs" c="dimmed" lh={1.2} truncate>{orgName || 'My org'}</Text>
            <Badge size="xs" color={tierColor} variant="light" style={{ flexShrink: 0 }}>
              {planTier.toUpperCase()}
            </Badge>
          </Group>
        </Stack>
      </Box>

      {/* ── Scrollable nav items ── */}
      <ScrollArea flex={1} py="xs" scrollbarSize={4} offsetScrollbars={false}>

        {/* Dashboard — admin / staff only */}
        {!isAgent && !isField && (
          <Box mb={4}>
            <NavItem
              href="/dashboard"
              label="Dashboard"
              icon={IconLayoutDashboard}
              active={pathname === '/dashboard'}
            />
          </Box>
        )}

        {/* SHIPMENTS group — admin / staff only */}
        {!isAgent && !isField && (
          <>
            <GroupHeading label="Shipments" open={shipmentsOpen} onToggle={toggleShipments} />
            <Collapse in={shipmentsOpen}>
              <Stack gap={2} mb={4}>
                <NavItem
                  href="/shipments"
                  label="Shipments"
                  icon={IconPackage}
                  active={pathname.startsWith('/shipments')}
                  badge={shipmentCount}
                />
                <NavItem
                  href="/customers"
                  label="Customers"
                  icon={IconUsers}
                  active={pathname === '/customers'}
                />
                <NavItem
                  href="/messages"
                  label="Messages"
                  icon={IconMessage}
                  active={pathname === '/messages'}
                />
              </Stack>
            </Collapse>
          </>
        )}

        {/* FIELD OPS group — everyone except agent */}
        {!isAgent && (
          <>
            <GroupHeading label="Field Ops" open={fieldOpsOpen} onToggle={toggleFieldOps} />
            <Collapse in={fieldOpsOpen}>
              <Stack gap={2}>
                {!isField && (
                  <NavItem
                    href="/agent"
                    label="Agent portal"
                    icon={IconUserShare}
                    active={pathname === '/agent'}
                    pro={!isPro}
                  />
                )}
                <NavItem
                  href="/field"
                  label="Collections"
                  icon={IconTruckDelivery}
                  active={pathname.startsWith('/field')}
                />
                <NavItem
                  href="/pod"
                  label="Proof of delivery"
                  icon={IconCamera}
                  active={pathname === '/pod'}
                />
              </Stack>
            </Collapse>
          </>
        )}

        {/* Agent minimal view */}
        {isAgent && (
          <Stack gap={2}>
            <NavItem href="/agent" label="Agent portal" icon={IconUserShare} active={pathname === '/agent'} />
            <NavItem href="/pod" label="Proof of delivery" icon={IconCamera} active={pathname === '/pod'} />
          </Stack>
        )}

      </ScrollArea>

      {/* ── Bottom: usage + upgrade + profile ── */}
      <Box
        px="md"
        pt="sm"
        pb="md"
        style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
      >
        <Stack gap="sm">
          <UsageBar count={shipmentCount} limit={shipmentLimit} />

          {!isPro && isAdmin && (
            <Button
              component={Link}
              href="/settings"
              size="xs"
              variant="default"
              fullWidth
            >
              Upgrade plan
            </Button>
          )}

          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Avatar size={32} radius="xl" color="violet" variant="filled">
                {getInitials(userName)}
              </Avatar>
              <Box style={{ minWidth: 0 }}>
                <Text size="sm" fw={600} truncate lh={1.3}>{userName}</Text>
                <Text size="xs" c="dimmed" truncate lh={1.3}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </Text>
              </Box>
            </Group>
            <ActionIcon
              component={Link}
              href="/settings"
              variant="subtle"
              color="gray"
              size="sm"
              aria-label="Settings"
              style={{ flexShrink: 0 }}
            >
              <IconSettings size={16} />
            </ActionIcon>
          </Group>
        </Stack>
      </Box>

    </Flex>
  );
}
