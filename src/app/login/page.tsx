'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Container, Paper, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    setLoading(false);

    if (error) {
      notifications.show({ title: 'Login failed', message: error.message, color: 'red' });
      return;
    }

    window.location.href = nextPath;
  }
console.log("SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <Container size={420} py={80}>
      <Stack gap="md">
        <Stack gap={4}>
          <Text fw={800} size="xl">CargoPulse</Text>
          <Text c="dimmed" size="sm">Sign in to manage shipments and messaging.</Text>
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
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />
              <Button type="submit" loading={loading} fullWidth>
                Sign in
              </Button>
            </Stack>
          </form>
        </Paper>
      </Stack>
    </Container>
  );
}
