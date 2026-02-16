'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavLink, Stack } from '@mantine/core';
import {
  IconLayoutDashboard,
  IconPackage,
  IconUsers,
  IconMessage,
  IconPhoto,
  IconTruckDelivery,
  IconSettings,
} from '@tabler/icons-react';

const items = [
  { href: '/dashboard', label: 'Dashboard', icon: IconLayoutDashboard },
  { href: '/agent', label: 'Agent', icon: IconPackage },
  { href: '/field', label: 'Field (Collections)', icon: IconTruckDelivery },
  { href: '/shipments', label: 'Shipments', icon: IconPackage },
  { href: '/customers', label: 'Customers', icon: IconUsers },
  { href: '/messages', label: 'Messages', icon: IconMessage },
  { href: '/pod', label: 'Proof of Delivery', icon: IconPhoto },
  { href: '/settings', label: 'Settings', icon: IconSettings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <Stack gap={6}>
      {items.map((item) => (
        <NavLink
          key={item.href}
          component={Link}
          href={item.href}
          label={item.label}
          leftSection={<item.icon size={18} />}
          active={pathname === item.href}
        />
      ))}
    </Stack>
  );
}
