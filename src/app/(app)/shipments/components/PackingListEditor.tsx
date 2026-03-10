'use client';

import { ActionIcon, Button, Group, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { PACKING_CATEGORIES, type PackingItem } from '@/lib/offline/outbox';

interface Props {
  items: PackingItem[];
  onChange: (items: PackingItem[]) => void;
}

export function PackingListEditor({ items, onChange }: Props) {
  function addRow() {
    onChange([...items, { category: 'Clothing', description: '', qty: 1 }]);
  }

  function removeRow(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  function updateRow(i: number, patch: Partial<PackingItem>) {
    const next = [...items];
    next[i] = { ...next[i], ...patch };
    onChange(next);
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text fw={600} size="sm">Packing list</Text>
          <Text size="xs" c="dimmed">
            Add contents so your customer&apos;s barrel clears Caribbean Customs faster
          </Text>
        </Stack>
        <Button size="xs" variant="light" leftSection={<IconPlus size={12} />} onClick={addRow} style={{ flexShrink: 0 }}>
          Add item
        </Button>
      </Group>

      {items.length === 0 && (
        <Text size="xs" c="dimmed">No items added yet.</Text>
      )}

      {items.map((item, i) => (
        <Group key={i} align="flex-end" gap="xs" wrap="nowrap">
          <Select
            label={i === 0 ? 'Category' : undefined}
            value={item.category}
            onChange={v => updateRow(i, { category: (v ?? 'Clothing') as PackingItem['category'] })}
            data={PACKING_CATEGORIES as unknown as string[]}
            style={{ flex: 2, minWidth: 0 }}
          />
          <TextInput
            label={i === 0 ? 'Description' : undefined}
            placeholder="e.g. men's trainers, 2 tins of food"
            value={item.description ?? ''}
            onChange={e => updateRow(i, { description: e.currentTarget.value })}
            style={{ flex: 3, minWidth: 0 }}
          />
          <NumberInput
            label={i === 0 ? 'Qty' : undefined}
            min={1}
            value={item.qty}
            onChange={v => updateRow(i, { qty: typeof v === 'number' && v >= 1 ? v : 1 })}
            style={{ width: 70, flexShrink: 0 }}
          />
          <ActionIcon color="red" variant="subtle" mb={1} onClick={() => removeRow(i)}>
            <IconTrash size={16} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}
