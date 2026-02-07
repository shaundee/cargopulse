'use client';

import type { FormEvent } from 'react';
import { Drawer, Stack, TextInput, Select, Button } from '@mantine/core';
import type { NewShipmentForm } from '../shipment-types'

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

          <TextInput
            label="Phone"
            placeholder="+44..."
            value={form.phone}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setForm((f) => ({ ...f, phone: v }));
            }}
            required
          />

          <TextInput
            label="Destination"
            placeholder="Kingston / St Catherine"
            value={form.destination}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setForm((f) => ({ ...f, destination: v }));
            }}
            required
          />

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
                serviceType: (v ?? 'depot') as NewShipmentForm['serviceType'],
              }))
            }
            required
          />

          <Button type="submit" loading={saving}>
            Create shipment
          </Button>
        </Stack>
      </form>
    </Drawer>
  );
}
