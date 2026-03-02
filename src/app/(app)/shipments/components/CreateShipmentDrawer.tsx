'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Drawer, Stack, TextInput, Select, Button, Group, Modal} from '@mantine/core';
import type { NewShipmentForm } from '../shipment-types'
import { notifications } from '@mantine/notifications';

export function CreateShipmentDrawer({
  opened,
  onClose,
  saving,
  form,
  setForm,
  onSubmit,
}: {
  opened: boolean;
  onClose: () => void;
  saving: boolean;
  form: NewShipmentForm;
  setForm: (updater: (prev: NewShipmentForm) => NewShipmentForm) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  const [destinations, setDestinations] = useState<Array<{ id: string; name: string }>>([]);

useEffect(() => {
  if (!opened) return;
  fetch('/api/destinations')
    .then((r) => r.json())
    .then((j) => setDestinations((j.destinations ?? []).map((d: any) => ({ id: d.id, name: d.name }))))
    .catch(() => setDestinations([]));
}, [opened]);
const [addDestOpen, setAddDestOpen] = useState(false);
const [newDestName, setNewDestName] = useState('');
const [addingDest, setAddingDest] = useState(false);
  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="md" title="New shipment">
      <form onSubmit={onSubmit}>
        <Stack gap="sm">
          <TextInput
            label="Customer name"
            placeholder="e.g., Andre Brown"
            value={form.customerName}
        onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((f) => ({ ...f, customerName: v }));
}}
            required
          />

      <Group grow>
  <Select
    label="Country"
    data={[
      { value: 'GB', label: 'UK (+44)' },
      { value: 'JM', label: 'Jamaica (+1-876)' },
      { value: 'US', label: 'USA (+1)' },
      { value: 'CA', label: 'Canada (+1)' },
    ]}
    value={form.phoneCountry}
    onChange={(v) => setForm((f) => ({ ...f, phoneCountry: (v ?? 'GB') as any }))}
    
    required
  />

  <TextInput
    label="Phone"
    placeholder="e.g., 079… or +44…"
    value={form.phone}
    onChange={(e) => {
  const v = e.currentTarget.value;
  setForm((f) => ({ ...f, phone: v }));
}}
    required
  />
</Group>
<Group align="end" grow>
  <Select
    label="Destination"
    placeholder="Select destination"
    data={destinations.map((d) => ({ value: d.name, label: d.name }))}
    value={form.destination}
    onChange={(v) => setForm((f) => ({ ...f, destination: v ?? '' }))}
    searchable
    required
  />

  <Button
    variant="light"
    onClick={() => {
      setNewDestName('');
      setAddDestOpen(true);
    }}
  >
    + Add
  </Button>
</Group>

          <Select
            label="Service type"
            data={[
              { value: 'depot', label: 'Depot' },
              { value: 'door_to_door', label: 'Door to door' },
            ]}
            value={form.serviceType}
        onChange={(v) =>
  setForm((f) => ({
    ...f,
    serviceType: (v ?? 'depot') as any,
  }))
}
            required
          />

          <Button type="submit" loading={saving}>
            Create shipment
          </Button>
        </Stack>
      </form>
      <Modal opened={addDestOpen} onClose={() => setAddDestOpen(false)} title="Add destination" centered>
  <Stack>
    <TextInput
      label="Destination name"
      placeholder="e.g., Nigeria"
      value={newDestName}
      onChange={(e) => setNewDestName(e.currentTarget.value)}
      autoFocus
    />

    <Group justify="flex-end">
      <Button variant="default" onClick={() => setAddDestOpen(false)}>
        Cancel
      </Button>

      <Button
        loading={addingDest}
        onClick={async () => {
          const name = newDestName.trim();
          if (name.length < 2) {
            notifications.show({ title: 'Destination', message: 'Enter a name', color: 'red' });
            return;
          }

          try {
            setAddingDest(true);
            const res = await fetch('/api/destinations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name }),
            });
            const json = await res.json().catch(() => null);
            if (!res.ok) throw new Error(json?.error ?? 'Failed to add destination');

            const d = json.destination as { id: string; name: string };

            setDestinations((prev) =>
              prev.some((x) => x.name.toLowerCase() === d.name.toLowerCase()) ? prev : [...prev, d]
            );
            setForm((f) => ({ ...f, destination: d.name }));
            setAddDestOpen(false);
          } catch (e: any) {
            notifications.show({ title: 'Destination', message: e?.message ?? 'Failed', color: 'red' });
          } finally {
            setAddingDest(false);
          }
        }}
      >
        Save
      </Button>
    </Group>
  </Stack>
</Modal>
    </Drawer>
  );
}
