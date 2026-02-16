import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { Badge, Container, Paper, Stack, Text, Timeline, Title } from '@mantine/core';

function niceStatus(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function TrackingPage({ params }: { params: { code: string } }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const supabase = createClient(url, anon);

  const { data, error } = await supabase.rpc('public_get_tracking', { p_code: params.code });

  if (error || !data) return notFound();

  const shipment = data.shipment;
  const events: Array<{ status: string; occurred_at: string }> = data.events ?? [];

  return (
    <Container size={520} py={40}>
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={2}>Tracking</Title>
          <Text c="dimmed" size="sm">Code: {shipment.tracking_code}</Text>
        </Stack>

        <Paper withBorder p="lg" radius="md">
          <Stack gap="md">
            <Stack gap={6}>
              <Text fw={700}>Current status</Text>
              <Badge size="lg">{niceStatus(shipment.status)}</Badge>
            </Stack>

            <Stack gap={6}>
              <Text fw={700}>Timeline</Text>

              {events.length === 0 ? (
                <Text c="dimmed" size="sm">No updates yet.</Text>
              ) : (
                <Timeline bulletSize={22} lineWidth={2}>
                  {events.map((e, i) => (
                    <Timeline.Item key={i} title={niceStatus(e.status)}>
                      <Text size="sm" c="dimmed">
                        {new Intl.DateTimeFormat('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        }).format(new Date(e.occurred_at))}
                      </Text>
                    </Timeline.Item>
                  ))}
                </Timeline>
              )}
            </Stack>
          </Stack>
        </Paper>

        <Text c="dimmed" size="xs">
          Updates are provided by the shipping operator.
        </Text>
      </Stack>
    </Container>
  );
}
