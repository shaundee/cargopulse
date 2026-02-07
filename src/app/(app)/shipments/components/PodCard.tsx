'use client';

import { useEffect, useState, useRef } from 'react';
import { Badge, Button, Group, Paper, Stack, Text, TextInput, FileInput } from '@mantine/core';
import type { PodRow } from '../shipment-types';
import { formatWhen } from '../shipment-types';

export function PodCard({
  existingPod,
  podReceiver,
  setPodReceiver,
  podFile,
  setPodFile,
  podSaving,
  onSavePod,
}: {
  existingPod: PodRow | null;
  podReceiver: string;
  setPodReceiver: (v: string) => void;
  podFile: File | null;
  setPodFile: (f: File | null) => void;
  podSaving: boolean;
  onSavePod: () => void;
}) {
  const hasPod =
    !!existingPod &&
    (!!(existingPod as any).photo_url ||
      !!(existingPod as any).photo_path ||
      !!existingPod.delivered_at ||
      !!existingPod.receiver_name);
const [showForm, setShowForm] = useState(!hasPod);

const prevHasPod = useRef(hasPod);

useEffect(() => {
  if (prevHasPod.current !== hasPod) {
    setShowForm(!hasPod);
    prevHasPod.current = hasPod;
  }
}, [hasPod]);




  async function onViewPhoto() {
    const p = (existingPod as any)?.photo_url ?? (existingPod as any)?.photo_path;
    if (!p) throw new Error('No photo path on POD record');

    const res = await fetch('/api/pod/signed-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: p }),
    });

    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j?.error ?? 'Failed to get signed URL');

    window.open(j.url, '_blank');
  }
  async function handleSave() {
  await Promise.resolve(onSavePod());
  setShowForm(false);
  setPodFile(null);
  setPodReceiver('');
}


  return (
    <Stack gap="sm">
      {/* Saved card (only when POD exists) */}
      {hasPod ? (
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" mb="xs">
            <Text fw={700}>Proof of delivery</Text>
            <Badge color="green" variant="light">
              Saved
            </Badge>
          </Group>

          <Text size="sm" c="dimmed">
            Receiver: {existingPod?.receiver_name ?? '-'}
          </Text>
          <Text size="sm" c="dimmed">
            Delivered: {formatWhen(existingPod?.delivered_at)}
          </Text>
          <Text size="sm" c="dimmed">
            Photo path: {(existingPod as any)?.photo_url ?? (existingPod as any)?.photo_path ?? '-'}
          </Text>

          <Group mt="sm">
            <Button
              variant="light"
              onClick={() => {
                // Keep errors visible instead of failing silently
                onViewPhoto().catch((e) => alert(e?.message ?? 'Failed to open photo'));
              }}
              disabled={!(existingPod as any)?.photo_url && !(existingPod as any)?.photo_path}
            >
              View photo
            </Button>

            <Button variant="outline" onClick={() => setShowForm(true)}>
              Replace POD
            </Button>

            {showForm ? (
              <Button variant="subtle" color="gray" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            ) : null}
          </Group>
        </Paper>
      ) : null}

      {/* Upload form (shown when no POD, or when Replace POD clicked) */}
      {showForm ? (
        <Paper withBorder p="sm" radius="md">
          <Text fw={700} mb="xs">
            {hasPod ? 'Replace POD' : 'Capture POD'}
          </Text>

          <Stack gap="sm">
            <TextInput
              label="Receiver name"
              value={podReceiver}
              onChange={(e) => setPodReceiver(e.currentTarget.value)}
              placeholder="e.g., Marsha Brown"
            />

            <FileInput
              label="Photo"
              placeholder="Choose image…"
              accept="image/*"
              value={podFile}
              onChange={setPodFile}
            />

            <Button loading={podSaving} disabled={!podReceiver || !podFile} onClick={handleSave}>
  Save POD
</Button>


            <Text size="sm" c="dimmed">
              Uploads a photo, saves receiver name, and marks the shipment as delivered.
            </Text>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}
