'use client';

import { AppShell, Group, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { AppNav } from './nav';

export function AppShellClient({
  children,
  role,
}: {
  children: React.ReactNode;
  role: 'admin' | 'staff' | 'field' | 'agent';
}) {
  const isAgent = role === 'agent';

  return (
    <>
      <style>{`
        @media print {
          .mantine-AppShell-header,
          .mantine-AppShell-navbar { display: none !important; }
          .mantine-AppShell-main { padding: 0 !important; }
        }
      `}</style>

      <AppShell header={{ height: 56 }} navbar={{ width: 260, breakpoint: 'sm' }} padding="md">
        <AppShell.Header>
          <Group h="100%" px="md" justify="space-between">
            <Text fw={700}>CargoPulse</Text>

            {!isAgent ? (
              <TextInput
                placeholder="Search tracking code or phone..."
                leftSection={<IconSearch size={16} />}
                w={360}
                visibleFrom="sm"
              />
            ) : null}
          </Group>
        </AppShell.Header>

        <AppShell.Navbar p="md">
          <AppNav role={role} />
        </AppShell.Navbar>

        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
    </>
  );
}