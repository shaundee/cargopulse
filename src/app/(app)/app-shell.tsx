'use client';

import type { PlanTier } from '@/lib/billing/plan';


import { AppShell } from '@mantine/core';
import { AppNav } from './nav';

interface AppShellProps {
  children: React.ReactNode;
  role: 'admin' | 'staff' | 'field' | 'agent';
  orgName: string;
  planTier: PlanTier;
  shipmentCount: number;
  shipmentLimit: number | null;
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}

export function AppShellClient({
  children,
  role,
  orgName,
  planTier,
  shipmentCount,
  shipmentLimit,
  userName,
  userEmail,
  isAdmin,
}: AppShellProps) {
  return (
    <>
      <style>{`
        @media print {
          .mantine-AppShell-navbar { display: none !important; }
          .mantine-AppShell-main { padding: 0 !important; }
        }
      `}</style>

      <AppShell navbar={{ width: 240, breakpoint: 'sm' }} padding="md">
        <AppShell.Navbar p={0}>
          <AppNav
            role={role}
            orgName={orgName}
            planTier={planTier}
            shipmentCount={shipmentCount}
            shipmentLimit={shipmentLimit}
            userName={userName}
            userEmail={userEmail}
            isAdmin={isAdmin}
          />
        </AppShell.Navbar>

        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
    </>
  );
}
