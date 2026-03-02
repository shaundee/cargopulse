'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Center, Loader, Stack, Text } from '@mantine/core';

export default function BillingReturnPage() {
  const sp = useSearchParams();
  const status = sp.get('status') ?? 'success';

  useEffect(() => {
    const target =
      status === 'cancel'
        ? '/settings?billing=cancel'
        : '/settings?billing=success';

    // same-site navigation => auth cookie will be included
    const t = setTimeout(() => window.location.replace(target), 200);
    return () => clearTimeout(t);
  }, [status]);

  return (
    <Center mih="60vh">
      <Stack align="center" gap="xs">
        <Loader />
        <Text size="sm" c="dimmed">
          Returning to Cargo44…
        </Text>
      </Stack>
    </Center>
  );
}