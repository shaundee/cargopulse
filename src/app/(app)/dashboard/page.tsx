import { Card, Group, SimpleGrid, Text } from '@mantine/core';

export default function DashboardPage() {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
      <Card withBorder radius="md" p="md">
        <Text c="dimmed" size="sm">Shipments (30 days)</Text>
        <Text fw={800} size="xl">0</Text>
      </Card>

      <Card withBorder radius="md" p="md">
        <Text c="dimmed" size="sm">Delivered (30 days)</Text>
        <Text fw={800} size="xl">0</Text>
      </Card>

      <Card withBorder radius="md" p="md">
        <Text c="dimmed" size="sm">Messages sent (30 days)</Text>
        <Text fw={800} size="xl">0</Text>
      </Card>
    </SimpleGrid>
  );
}
