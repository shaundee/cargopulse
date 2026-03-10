'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { CopyButton } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import {
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconDownload,
  IconLink,
  IconPackage,
  IconPaperclip,
  IconPlus,
  IconPrinter,
  IconSearch,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';

import type { ShipmentRow, ShipmentStatus } from './shipment-types';
import { formatWhen, statusBadgeColor, statusLabel } from './shipment-types';
import { CreateShipmentDrawer } from './components/CreateShipmentDrawer';
import { ShipmentDetailDrawer } from './components/ShipmentDetailDrawer';
import { EmptyState } from '../_components/EmptyState';

/** ---------- phone helpers ---------- */
function digitsOnly(s: string) {
  return String(s ?? '').replace(/\D/g, '');
}

function formatPhoneCompact(e164: string) {
  const s = String(e164 ?? '').trim();
  if (!s) return '-';

  const m = s.match(/^\+(\d{1,3})/);
  const cc = m ? `+${m[1]}` : s.startsWith('+') ? '+' : '';
  const d = digitsOnly(s);
  if (d.length <= 6) return s;

  const last4 = d.slice(-4);
  return `${cc} …${last4}`;
}

function waLinkFromE164(e164: string) {
  const d = digitsOnly(e164);
  return d ? `https://wa.me/${d}` : '';
}

function fmtTime(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function lastMessageLabel(r: ShipmentRow) {
  const s = String((r as any).last_outbound_message_status ?? '').trim();
  if (!s) return '-';

  const pretty =
    s === 'tracking_link' ? 'Tracking link' :
    s === 'nudge' ? 'Nudge' :
    s;

  const when = fmtTime((r as any).last_outbound_message_at);
  return when ? `${pretty} sent ${when}` : `${pretty}`;
}

export default function ShipmentsClient({
  initialShipments,
}: {
  initialShipments: ShipmentRow[];
}) {
  const router = useRouter();

  // Create shipment modal state
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [listRefreshKey, setListRefreshKey] = useState(0);

  // Search + Filters
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | 'all'>('all');
  const [destinationFilter, setDestinationFilter] = useState<string>('all');
  const [serviceFilter, setServiceFilter] = useState<'all' | 'depot' | 'door_to_door'>('all');

  // Bulk actions
  const [selectedRecords, setSelectedRecords] = useState<ShipmentRow[]>([]);
  const [bulkStatus, setBulkStatus] = useState<ShipmentStatus>('loaded');
  const [bulkNote, setBulkNote] = useState('');
  const [bulkAutoLog, setBulkAutoLog] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  // Detail drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailShipmentId, setDetailShipmentId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'timeline' | 'cargo' | 'proof'>('timeline');

  const [destinationOptions, setDestinationOptions] = useState<string[]>(['all']);

  const [records, setRecords] = useState<ShipmentRow[]>(initialShipments);
  const [loadingList, setLoadingList] = useState(false);

  const showFullPhone = query.trim().length > 0; // key UX: show full number while searching

  function openShipmentDetail(shipmentId: string, tab: 'timeline' | 'cargo' | 'proof' = 'timeline') {
    setDetailShipmentId(shipmentId);
    setDetailTab(tab);
    setDetailOpen(true);
  }

  // Fetch destinations
  useEffect(() => {
    fetch('/api/destinations')
      .then((r) => r.json())
      .then((j) => {
        const names = (j.destinations ?? []).map((d: any) => String(d.name));
        setDestinationOptions(['all', ...names]);
      })
      .catch(() => setDestinationOptions(['all']));
  }, []);

  // Fetch list (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoadingList(true);
      try {
        const sp = new URLSearchParams();
        if (query.trim()) sp.set('q', query.trim());
        sp.set('status', statusFilter);
        sp.set('destination', destinationFilter);
        sp.set('service', serviceFilter);
        sp.set('limit', '200');

        const res = await fetch(`/api/shipments/list?${sp.toString()}`, { cache: 'no-store' });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? 'List fetch failed');

        setRecords((json.shipments ?? []) as ShipmentRow[]);
        setSelectedRecords([]); // clear selection on refresh to avoid mismatched rows
      } catch (e: any) {
        notifications.show({
          title: 'List error',
          message: e?.message ?? 'Failed to load',
          color: 'red',
        });
      } finally {
        setLoadingList(false);
      }
    }, 250);

    return () => clearTimeout(t);
  }, [query, statusFilter, destinationFilter, serviceFilter, listRefreshKey]);

  function csvEscape(v: unknown) {
    const s = String(v ?? '');
    return `"${s.replace(/"/g, '""')}"`;
  }

  function downloadShipmentsCsv() {
    const exportRows = selectedRecords.length ? selectedRecords : records;

    const header = [
      'tracking_code',
      'customer_name',
      'phone',
      'destination',
      'service_type',
      'status',
      'last_event_at',
      'created_at',
    ].join(',');

    const lines = exportRows.map((r) =>
      [
        csvEscape(r.tracking_code),
        csvEscape(r.customers?.name ?? ''),
        csvEscape((r.customers as any)?.phone_e164 ?? r.customers?.phone ?? ''),
        csvEscape(r.destination ?? ''),
        csvEscape((r as any).service_type ?? ''),
        csvEscape(r.current_status),
        csvEscape(r.last_event_at ?? ''),
        csvEscape((r as any).created_at ?? ''),
      ].join(',')
    );

    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `cargopulse_shipments_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    notifications.show({
      title: 'Export ready',
      message: `Exported ${exportRows.length} row(s)`,
      color: 'green',
    });
  }


  async function applyBulkStatus() {
    if (!selectedRecords.length) return;

    if (bulkAutoLog) {
      const ok = window.confirm(
        `This will update ${selectedRecords.length} shipments and ALSO message customers (if templates are enabled). Continue?`
      );
      if (!ok) return;
    }

    setBulkSaving(true);
    try {
      const res = await fetch('/api/shipments/bulk/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentIds: selectedRecords.map((r) => r.id),
          status: bulkStatus,
          note: bulkNote.trim() || null,
          autoLog: bulkAutoLog,
        }),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Bulk update failed');

      notifications.show({
        title: 'Bulk update complete',
        message: `Updated ${json.updated ?? 0}, skipped ${json.skipped ?? 0}`,
        color: 'green',
      });

      setSelectedRecords([]);
      setBulkNote('');
      setListRefreshKey((k) => k + 1);
      router.refresh();
    } catch (e: any) {
      notifications.show({
        title: 'Bulk update failed',
        message: e?.message ?? 'Request failed',
        color: 'red',
      });
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Text fw={700} size="lg">
          Shipments
          {records.length > 0 && (
            <span style={{ fontWeight: 400, color: 'var(--mantine-color-dimmed)' }}>
              {' '}({records.length})
            </span>
          )}
        </Text>

        <Button leftSection={<IconPlus size={16} />} onClick={() => setDrawerOpen(true)}>
          New shipment
        </Button>
      </Group>

      <Paper p="md" withBorder radius="md">
        <Group justify="space-between" mb="sm" wrap="wrap" align="flex-end">
          <Group wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
            <TextInput
              placeholder="Search tracking, phone, customer…"
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              style={{ flex: '1 1 220px' }}
            />

            <Select
              label="Status"
              value={statusFilter}
              onChange={(v) => setStatusFilter((v ?? 'all') as any)}
              data={[
                { value: 'all', label: 'All statuses' },
                { value: 'received', label: statusLabel('received') },
                { value: 'collected', label: statusLabel('collected') },
                { value: 'loaded', label: statusLabel('loaded') },
                { value: 'departed_uk', label: statusLabel('departed_uk') },
                { value: 'arrived_destination', label: statusLabel('arrived_destination') },
                { value: 'customs_processing', label: statusLabel('customs_processing') },
                { value: 'customs_cleared', label: statusLabel('customs_cleared') },
                { value: 'awaiting_collection', label: statusLabel('awaiting_collection') },
                { value: 'out_for_delivery', label: statusLabel('out_for_delivery') },
                { value: 'delivered', label: statusLabel('delivered') },
              ]}
              style={{ flex: '1 1 160px' }}
            />

            <Select
              label="Destination"
              value={destinationFilter}
              onChange={(v) => setDestinationFilter(v ?? 'all')}
              data={destinationOptions.map((d) => ({
                value: d,
                label: d === 'all' ? 'All destinations' : d,
              }))}
              style={{ flex: '1 1 160px' }}
            />

            <Select
              label="Service"
              value={serviceFilter}
              onChange={(v) => setServiceFilter((v ?? 'all') as any)}
              data={[
                { value: 'all', label: 'All services' },
                { value: 'depot', label: 'Depot' },
                { value: 'door_to_door', label: 'Door to door' },
              ]}
              style={{ flex: '1 1 130px' }}
            />

            <Button
              variant="subtle"
              leftSection={<IconX size={16} />}
              onClick={() => {
                setQuery('');
                setStatusFilter('all');
                setDestinationFilter('all');
                setServiceFilter('all');
              }}
            >
              Clear
            </Button>
          </Group>

        <Group gap="sm">
  <Button
    variant="light"
    leftSection={<IconUpload size={16} />}
    onClick={() => router.push('/shipments/import')}
  >
    Import
  </Button>

  <Button variant="light" leftSection={<IconDownload size={16} />} onClick={downloadShipmentsCsv}>
    Export CSV
  </Button>
</Group>
        </Group>

        {selectedRecords.length ? (
          <Paper withBorder p="sm" radius="md" mb="sm">
            <Group justify="space-between" wrap="wrap">
              <Text fw={700}>Selected: {selectedRecords.length}</Text>

              <Group wrap="wrap">
                <Select
                  label="Bulk status"
                  value={bulkStatus}
                  onChange={(v) => setBulkStatus((v ?? 'loaded') as ShipmentStatus)}
                  data={[
                    { value: 'received', label: statusLabel('received') },
                    { value: 'collected', label: statusLabel('collected') },
                    { value: 'loaded', label: statusLabel('loaded') },
                    { value: 'departed_uk', label: statusLabel('departed_uk') },
                    { value: 'arrived_destination', label: statusLabel('arrived_destination') },
                    { value: 'customs_processing', label: statusLabel('customs_processing') },
                    { value: 'customs_cleared', label: statusLabel('customs_cleared') },
                    { value: 'awaiting_collection', label: statusLabel('awaiting_collection') },
                    { value: 'out_for_delivery', label: statusLabel('out_for_delivery') },
                  ]}
                  style={{ flex: '1 1 180px' }}
                />

                <TextInput
                  label="Note (optional)"
                  value={bulkNote}
                  onChange={(e) => setBulkNote(e.currentTarget.value)}
                  placeholder="e.g., Loaded onto container 12"
                  style={{ flex: '1 1 180px' }}
                />

                <Checkbox
                  label="Auto message (template)"
                  checked={bulkAutoLog}
                  onChange={(e) => setBulkAutoLog(e.currentTarget.checked)}
                />

                <Button loading={bulkSaving} onClick={applyBulkStatus}>
                  Apply
                </Button>

                <Button variant="subtle" onClick={() => setSelectedRecords([])}>
                  Clear selection
                </Button>
              </Group>
            </Group>
          </Paper>
        ) : null}

        {records.length === 0 && !loadingList && !query && statusFilter === 'all' && destinationFilter === 'all' && serviceFilter === 'all' ? (
          <EmptyState
            icon={<IconPackage size={28} />}
            title="No shipments yet"
            description="Book your first shipment and your customer gets a tracking code instantly."
            action={{ label: 'New shipment', onClick: () => setDrawerOpen(true) }}
          />
        ) : (
        <div style={{ overflowX: 'auto' }}>
        <DataTable
          withTableBorder
          withColumnBorders
          highlightOnHover
          records={records}
          idAccessor="id"
          fetching={loadingList}
          selectedRecords={selectedRecords}
          onSelectedRecordsChange={setSelectedRecords}
          onRowClick={({ record }) => openShipmentDetail(record.id, 'timeline')}
          rowStyle={(record) =>
            selectedRecords.some((s) => s.id === record.id)
              ? { boxShadow: 'inset 3px 0 0 var(--mantine-color-blue-6)' }
              : {}
          }
          style={{
            '--mantine-datatable-highlight-on-hover-color': 'var(--mantine-color-gray-2)',
            '--mantine-datatable-selection-color': 'var(--mantine-color-blue-1)',
          } as React.CSSProperties}
          columns={[
            { accessor: 'tracking_code', title: 'Tracking' },
            {
              accessor: 'customers.name',
              title: 'Customer',
              render: (r) => r.customers?.name ?? '-',
            },

            // ✅ Phone column: compact normally, full while searching + copy + WhatsApp
            {
              accessor: 'phone',
              title: 'Phone',
              width: showFullPhone ? 260 : 170,
              render: (r) => {
                const phone = String(
                  (r.customers as any)?.phone_e164 ??
                    r.customers?.phone ??
                    (r as any).phone_e164 ??
                    (r as any).phone ??
                    ''
                ).trim();

                const display = showFullPhone ? (phone || '-') : formatPhoneCompact(phone);
                const waHref = phone ? waLinkFromE164(phone) : '';

                if (!phone) return <Text size="sm">-</Text>;

                return (
                  <Group gap={6} wrap="nowrap">
                    <CopyButton value={phone} timeout={1200}>
                      {({ copied, copy }) => (
                        <Tooltip
                          withArrow
                          label={copied ? 'Copied' : phone}
                        >
                          <Group gap={6} wrap="nowrap">
                            <Text
                              size="sm"
                              ff="monospace"
                              style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                copy();
                              }}
                            >
                              {display}
                            </Text>

                            <ActionIcon
                              variant="subtle"
                              aria-label="Copy phone"
                              onClick={(e) => {
                                e.stopPropagation();
                                copy();
                              }}
                            >
                              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                            </ActionIcon>
                          </Group>
                        </Tooltip>
                      )}
                    </CopyButton>

                    <Tooltip label="Send WhatsApp" withArrow>
                      <ActionIcon
                        variant="subtle"
                        component="a"
                        href={waHref || undefined}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="Open WhatsApp"
                        onClick={(e) => e.stopPropagation()}
                        disabled={!waHref}
                      >
                        <IconBrandWhatsapp size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                );
              },
            },

            { accessor: 'destination', title: 'Destination' },

            {
              accessor: 'service_type',
              title: 'Service',
              render: (r) => (r as any).service_type ?? '-',
            },

            {
              accessor: 'current_status',
              title: 'Status',
              render: (r) => (
                <Badge color={statusBadgeColor(r.current_status)} variant="light">
                  {statusLabel(r.current_status, r.destination)}
                </Badge>
              ),
            },

            {
              accessor: 'last_event_at',
              title: 'Updated',
              render: (r) => formatWhen(r.last_event_at),
            },

            // ✅ Paperclip proof icon: opens proof tab
            {
              accessor: 'proof',
              title: '',
              width: 44,
              render: (r) => {
                const hasPod = Boolean((r as any).has_pod);
                const hasPickup = Boolean((r as any).has_pickup_assets);
                if (!hasPod && !hasPickup) return null;

                const label = hasPod ? 'POD attached' : 'Pickup proof attached';
                return (
                  <Tooltip label={label} withArrow>
                    <ActionIcon
                      variant="subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        openShipmentDetail(r.id, 'proof');
                      }}
                      aria-label={label}
                    >
                      <IconPaperclip size={16} />
                    </ActionIcon>
                  </Tooltip>
                );
              },
            },

            // ✅ Last message column
            {
              accessor: 'last_message',
              title: 'Last message',
              width: 210,
              render: (r) => {
                const failed = String((r as any).last_outbound_send_status ?? '') === 'failed';
                const preview = String((r as any).last_outbound_preview ?? '').trim();

                const label = (
                  <Text size="sm" c={failed ? 'red' : undefined}>
                    {lastMessageLabel(r)}
                  </Text>
                );

                return preview ? (
                  <Tooltip label={preview} multiline w={280} withArrow>
                    {label}
                  </Tooltip>
                ) : (
                  label
                );
              },
            },

            // ✅ Actions
            {
              accessor: 'actions',
              title: '',
              width: 120,
              render: (r) => (
                <Group gap="xs" justify="flex-end" wrap="nowrap">
                  <Tooltip label="Send tracking link" withArrow>
                    <ActionIcon
                      variant="light"
                      aria-label="Send tracking link"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const res = await fetch('/api/messages/misc/send', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ shipmentId: r.id, key: 'tracking_link' }),
                        });
                        const json = await res.json().catch(() => null);
                        if (!res.ok) {
                          notifications.show({
                            title: 'Send failed',
                            message: json?.error ?? 'Failed',
                            color: 'red',
                          });
                          return;
                        }
                        notifications.show({
                          title: 'Sent',
                          message: 'Tracking link sent/logged',
                          color: 'green',
                        });
                        setListRefreshKey((k) => k + 1);
                      }}
                    >
                      <IconLink size={16} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Print BOL" withArrow>
                    <ActionIcon
                      variant="light"
                      aria-label="Print BOL"
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = new URL(
                          `/shipments/print/${encodeURIComponent(r.id)}`,
                          window.location.origin
                        ).toString();
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <IconPrinter size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ),
            },
          ]}
        />
        </div>
        )}
      </Paper>

      <CreateShipmentDrawer
        opened={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreated={() => {
          setListRefreshKey(k => k + 1);
          router.refresh();
        }}
        onViewShipment={shipmentId => {
          setDrawerOpen(false);
          openShipmentDetail(shipmentId);
        }}
      />

      <ShipmentDetailDrawer
        opened={detailOpen}
        shipmentId={detailShipmentId}
        onClose={() => {
          setDetailOpen(false);
          setDetailShipmentId(null);
        }}
        onReloadRequested={() => {
          setListRefreshKey((k) => k + 1);
          router.refresh();
        }}
        initialTab={detailTab}
      />
    </Stack>
  );
}