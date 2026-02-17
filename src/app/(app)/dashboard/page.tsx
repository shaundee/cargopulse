import { Button, Card, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function since30DaysIso() {
  const ms = 30 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get org_id
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) throw memErr;
  if (!membership?.org_id) redirect('/onboarding');

  const orgId = membership.org_id as string;
  const since = since30DaysIso();

  const [shipmentsQ, deliveredQ, messagesQ] = await Promise.all([
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', since),

    // Delivered = POD captured (best signal)
    supabase
      .from('pod')
      .select('shipment_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('delivered_at', since),

    supabase
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('sent_at', since),
  ]);

  // With head:true, `data` is null; the metric is in `count`
  const shipments30 = shipmentsQ.count ?? 0;
  const delivered30 = deliveredQ.count ?? 0;
  const messages30 = messagesQ.count ?? 0;

  // Don’t crash dashboard if a metric query fails
  if (shipmentsQ.error) console.warn('[dashboard] shipments count failed', shipmentsQ.error.message);
  if (deliveredQ.error) console.warn('[dashboard] delivered count failed', deliveredQ.error.message);
  if (messagesQ.error) console.warn('[dashboard] messages count failed', messagesQ.error.message);

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
        <Card withBorder radius="md" p="md">
          <Text c="dimmed" size="sm">
            Shipments (30 days)
          </Text>
          <Text fw={800} size="xl">
            {shipments30}
          </Text>
        </Card>

        <Card withBorder radius="md" p="md">
          <Text c="dimmed" size="sm">
            Delivered (30 days)
          </Text>
          <Text fw={800} size="xl">
            {delivered30}
          </Text>
        </Card>

        <Card withBorder radius="md" p="md">
          <Text c="dimmed" size="sm">
            Messages sent (30 days)
          </Text>
          <Text fw={800} size="xl">
            {messages30}
          </Text>
        </Card>
      </SimpleGrid>

      <Card withBorder radius="md" p="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Stack gap={2}>
            <Text fw={700}>Quick actions</Text>
            <Text c="dimmed" size="sm">
              Jump straight to shipments or field intake.
            </Text>
          </Stack>

          <Group gap="sm">
            <Button component="a" href="/shipments" variant="light">
              Open shipments
            </Button>
            <Button component="a" href="/field" variant="default">
              Field intake
            </Button>
          </Group>
        </Group>
      </Card>
    </Stack>
  );
}
