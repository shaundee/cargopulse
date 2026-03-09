'use client';

import { Button, Center, Stack, Text, ThemeIcon } from '@mantine/core';

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Center py={80}>
      <Stack align="center" gap="sm" maw={340}>
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          {icon}
        </ThemeIcon>
        <Text fw={600} size="lg" ta="center" mt={4}>
          {title}
        </Text>
        <Text c="dimmed" size="sm" ta="center" lh={1.6}>
          {description}
        </Text>
        {action && (
          action.href ? (
            <Button variant="light" color="gray" mt="xs" component="a" href={action.href}>
              {action.label}
            </Button>
          ) : (
            <Button variant="light" color="gray" mt="xs" onClick={action.onClick}>
              {action.label}
            </Button>
          )
        )}
      </Stack>
    </Center>
  );
}
