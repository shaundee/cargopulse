'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Group,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconCheck, IconGlobe } from '@tabler/icons-react';
import { WORLD_COUNTRIES, countryFlag, getCountryCode } from '@/lib/countries';

export interface OrgDestination {
  id: string;
  name: string;
}

interface DestinationPickerProps {
  orgDestinations: OrgDestination[];
  value: string; // destination name
  onChange: (name: string) => void;
}

const PILL_STYLE_BASE: React.CSSProperties = {
  borderRadius: 6,
  padding: '5px 10px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  cursor: 'pointer',
  transition: 'border-color 0.1s, background 0.1s',
};

function pill(selected: boolean, dashed = false): React.CSSProperties {
  return {
    ...PILL_STYLE_BASE,
    border: `1.5px ${dashed ? 'dashed' : 'solid'} ${selected ? 'var(--mantine-color-blue-5)' : 'var(--mantine-color-gray-3)'}`,
    background: selected ? 'var(--mantine-color-blue-0)' : 'transparent',
  };
}

export function DestinationPicker({ orgDestinations, value, onChange }: DestinationPickerProps) {
  const [mode, setMode] = useState<'pills' | 'search'>('pills');
  const [search, setSearch] = useState('');

  // Is the current value one of the org's destinations?
  const isOrgDest = orgDestinations.some(d => d.name === value);
  // Is it a world country selected via "Other"?
  const isOtherCountry = !!value && !isOrgDest;

  const otherCountry = isOtherCountry
    ? WORLD_COUNTRIES.find(c => c.name === value) ?? { code: getCountryCode(value), name: value }
    : null;

  const filtered = useMemo(
    () =>
      search.trim()
        ? WORLD_COUNTRIES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
        : WORLD_COUNTRIES,
    [search]
  );

  // ── Search mode ──────────────────────────────────────────────────────────────
  if (mode === 'search') {
    return (
      <Stack gap="xs">
        <TextInput
          placeholder="Search countries…"
          value={search}
          onChange={e => setSearch(e.currentTarget.value)}
          autoFocus
          size="sm"
        />
        <ScrollArea h={220} type="auto">
          <Stack gap={0}>
            {filtered.map(c => {
              const selected = value === c.name;
              return (
                <UnstyledButton
                  key={c.code}
                  onClick={() => {
                    onChange(c.name);
                    setMode('pills');
                    setSearch('');
                  }}
                  style={{
                    padding: '7px 10px',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    background: selected ? 'var(--mantine-color-blue-0)' : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 18, lineHeight: 1 }}>{countryFlag(c.code)}</Text>
                  <Text size="sm" fw={selected ? 600 : 400} c={selected ? 'blue' : undefined}>
                    {c.name}
                  </Text>
                  {selected && <IconCheck size={12} color="var(--mantine-color-blue-6)" style={{ marginLeft: 'auto' }} />}
                </UnstyledButton>
              );
            })}
            {filtered.length === 0 && (
              <Text size="sm" c="dimmed" p="sm">No countries match</Text>
            )}
          </Stack>
        </ScrollArea>
        <Group justify="space-between">
          <Button
            variant="subtle"
            size="xs"
            onClick={() => { setMode('pills'); setSearch(''); }}
          >
            ← Back
          </Button>
          <Text size="xs" c="dimmed">{filtered.length} countries</Text>
        </Group>
      </Stack>
    );
  }

  // ── Pills mode ───────────────────────────────────────────────────────────────
  return (
    <Group gap="xs" wrap="wrap">
      {orgDestinations.map(dest => {
        const cc = getCountryCode(dest.name);
        const flag = countryFlag(cc);
        const selected = value === dest.name;
        return (
          <UnstyledButton
            key={dest.id}
            onClick={() => onChange(selected ? '' : dest.name)}
            style={pill(selected)}
          >
            <Text size="xs" fw={700} ff="monospace" c={selected ? 'blue' : 'dimmed'} style={{ letterSpacing: '0.5px' }}>
              {cc}
            </Text>
            <Text size="sm" c={selected ? 'blue.7' : undefined}>
              {flag} {dest.name}
            </Text>
          </UnstyledButton>
        );
      })}

      {/* Other country pill */}
      {isOtherCountry && otherCountry ? (
        // Show the selected "other" country as a blue pill with check + X to clear
        <UnstyledButton onClick={() => onChange('')} style={pill(true)}>
          <Text size="sm" c="blue.7">
            {countryFlag(otherCountry.code)} {otherCountry.name}
          </Text>
          <IconCheck size={12} color="var(--mantine-color-blue-6)" />
        </UnstyledButton>
      ) : (
        <UnstyledButton onClick={() => setMode('search')} style={pill(false, true)}>
          <Box style={{ display: 'flex', alignItems: 'center' }}>
            <IconGlobe size={14} color="var(--mantine-color-gray-5)" />
          </Box>
          <Text size="sm" c="dimmed">Other country</Text>
        </UnstyledButton>
      )}
    </Group>
  );
}
