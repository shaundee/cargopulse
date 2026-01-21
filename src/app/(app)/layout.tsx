// src/app/(app)/layout.tsx
'use client'
import { AppShell, Burger, Group, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { Suspense } from 'react';
import { AppNav } from './nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 260, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger hiddenFrom="sm" size="sm" />
            <Text fw={700}>CargoPulse</Text>
          </Group>

          <TextInput
            placeholder="Search tracking code or phone…"
            leftSection={<IconSearch size={16} />}
            w={360}
            visibleFrom="sm"
          />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Suspense fallback={null}>
          <AppNav />
        </Suspense>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
