'use client';

import { useState } from 'react';
import { Button, Container, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);

    if (error) {
      notifications.show({ title: 'Signup failed', message: error.message, color: 'red' });
      return;
    }

    notifications.show({ title: 'Account created', message: 'Now sign in.', color: 'green' });
    window.location.href = '/login';
  }

  return (
    <Container size={420} py={80}>
      <Stack gap="md">
        <Stack gap={4}>
          <Text fw={800} size="xl">Create account</Text>
          <Text c="dimmed" size="sm">Dev signup (we’ll remove this later).</Text>
        </Stack>

        <Paper withBorder p="lg" radius="md">
          <form onSubmit={onSubmit}>
            <Stack gap="sm">
              <TextInput
                label="Email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
              />
              <PasswordInput
                label="Password"
                placeholder="Create a password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
                minLength={6}
              />
              <Button type="submit" loading={loading} fullWidth>
                Create account
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
