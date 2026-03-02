'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  TextInput,
  Select,
  Button,
  Divider,
  CopyButton,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCopy } from '@tabler/icons-react';

type DestinationRow = { id: string; name: string };

export default function AgentsSettingsPage() {
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [loadingDest, setLoadingDest] = useState(true);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCountry, setPhoneCountry] = useState('JM');
  const [destinationId, setDestinationId] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string>('');

  useEffect(() => {
    (async () => {
      setLoadingDest(true);
      try {
        const res = await fetch('/api/destinations', { cache: 'no-store' });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error ?? 'Failed to load destinations');

        // expects [{id,name}] – if your API returns different shape, tell me and I’ll adjust
        const rows = (j?.destinations ?? []) as any[];
        const mapped = rows.map((d) => ({ id: String(d.id), name: String(d.name) }));
        setDestinations(mapped);
        setDestinationId(mapped[0]?.id ?? null);
      } catch (e: any) {
        notifications.show({ color: 'red', title: 'Destinations failed', message: e?.message ?? 'Unknown error' });
        setDestinations([]);
        setDestinationId(null);
      } finally {
        setLoadingDest(false);
      }
    })();
  }, []);

  const destinationOptions = useMemo(
    () => destinations.map((d) => ({ value: d.id, label: d.name })),
    [destinations]
  );

  async function createInvite() {
    if (name.trim().length < 2) {
      notifications.show({ color: 'red', title: 'Missing name', message: 'Enter the agent name.' });
      return;
    }
    if (phone.trim().length < 6) {
      notifications.show({ color: 'red', title: 'Missing phone', message: 'Enter a phone number.' });
      return;
    }
    if (!destinationId) {
      notifications.show({ color: 'red', title: 'Missing destination', message: 'Select a destination.' });
      return;
    }

    setCreating(true);
    setInviteUrl('');
    try {
      const res = await fetch('/api/agents/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          phoneCountry: phoneCountry.trim().toUpperCase(),
          destinationId,
        }),
      });

      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? 'Invite failed');

      setInviteUrl(String(j?.inviteUrl ?? ''));

      notifications.show({
        color: 'green',
        title: 'Invite created',
        message: j?.mode === 'sent' ? 'Sent via WhatsApp' : 'Copy the link below',
      });
    } catch (e: any) {
      notifications.show({ color: 'red', title: 'Invite failed', message: e?.message ?? 'Unknown error' });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={700} size="lg">Agents</Text>
          <Text c="dimmed" size="sm">Invite destination agents with a one-tap magic link.</Text>
        </div>
      </Group>

      <Paper withBorder p="md" radius="md">
        <Stack gap="sm">
          <Group grow align="flex-end">
            <TextInput
              label="Agent name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. Barbados Warehouse"
            />
            <TextInput
              label="Agent phone"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              placeholder="e.g. +1246..."
            />
            <Select
              label="Country"
              value={phoneCountry}
              onChange={(v) => setPhoneCountry(v ?? 'JM')}
              data={[
                { value: 'JM', label: 'JM (+1-876)' },
                { value: 'BB', label: 'BB (+1-246)' },
                { value: 'NG', label: 'NG (+234)' },
                { value: 'GH', label: 'GH (+233)' },
                { value: 'GB', label: 'GB (+44)' },
              ]}
            />
          </Group>

          <Select
            label="Destination scope"
            value={destinationId}
            onChange={setDestinationId}
            data={destinationOptions}
            disabled={loadingDest || destinationOptions.length === 0}
            placeholder={loadingDest ? 'Loading destinations...' : 'Select destination'}
          />

          <Group justify="flex-end">
            <Button onClick={createInvite} loading={creating}>
              Create invite
            </Button>
          </Group>

          {inviteUrl ? (
            <>
              <Divider my="xs" />
              <Group justify="space-between" wrap="nowrap">
                <Text size="sm" style={{ wordBreak: 'break-all' }}>
                  {inviteUrl}
                </Text>

                <CopyButton value={inviteUrl} timeout={1500}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? 'Copied' : 'Copy'} withArrow>
                      <ActionIcon variant="light" onClick={copy} aria-label="Copy invite link">
                        {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            </>
          ) : null}
        </Stack>
      </Paper>
    </Stack>
  );
}