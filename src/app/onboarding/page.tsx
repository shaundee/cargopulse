'use client';
import { useRouter } from 'next/navigation';

import { useState } from 'react';
import { Button, Container, Paper, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';


export default function OnboardingPage() {
    
    const router = useRouter();
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);

 async function onSubmit(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);

  try {
    const res = await fetch('/api/onboarding/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName }),
    });

    const json = await res.json();

    if (!res.ok) {
      notifications.show({ title: 'Onboarding failed', message: json?.error ?? 'Unknown error', color: 'red' });
      setLoading(false);
      return;
    }

    notifications.show({ title: 'Organization created', message: 'Welcome.', color: 'green' });

    // Hard redirect is fine now because server has completed everything
    window.location.href = '/dashboard';
  } catch (err: any) {
    notifications.show({ title: 'Onboarding failed', message: err?.message ?? 'Request failed', color: 'red' });
  } finally {
    setLoading(false);
  }
}


  return (
    <Container size={520} py={80}>
      <Stack gap="md">
        <Stack gap={4}>
          <Text fw={800} size="xl">Set up your company</Text>
          <Text c="dimmed" size="sm">Create your organization to start managing shipments.</Text>
        </Stack>

        <Paper withBorder p="lg" radius="md">
          <form onSubmit={onSubmit}>
            <Stack gap="sm">
              <TextInput
                label="Company name"
                placeholder="e.g., Kingston Express Shipping"
                value={orgName}
                onChange={(e) => setOrgName(e.currentTarget.value)}
                required
              />
              <Button type="submit" loading={loading}>
                Create organization
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
