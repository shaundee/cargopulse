'use client';

import { useState } from 'react';
import { Button, Container, Paper, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.rpc('create_org_for_user', {
      p_org_name: orgName,
    });

    setLoading(false);

    if (error) {
      notifications.show({ title: 'Onboarding failed', message: error.message, color: 'red' });
      return;
    }

    notifications.show({ title: 'Organization created', message: 'Welcome.', color: 'green' });
    window.location.href = '/dashboard';
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
