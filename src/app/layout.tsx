// src/app/layout.tsx
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import 'mantine-datatable/styles.css';

import type { Metadata } from 'next';
import { ColorSchemeScript, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

export const metadata: Metadata = {
  title: 'CargoPulse',
  description: 'Tracking + WhatsApp updates for UK→Jamaica barrel/box shippers',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <MantineProvider
          theme={{
            primaryColor: 'indigo',
            defaultRadius: 'md',
            fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
          }}
        >
          <Notifications position="top-right" />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}

