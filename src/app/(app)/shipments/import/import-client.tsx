'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Divider,
  FileButton,
  Group,
  Paper,
  Progress,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Table,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconDownload,
  IconUpload,
  IconArrowRight,
  IconPlayerPlay,
  IconCheck,
  IconFileSpreadsheet,
  IconX,
  IconAlertCircle,
  IconLoader2,
  IconRefresh,
  IconEdit,
} from '@tabler/icons-react';

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Mapping = Record<string, string | null>;

type ValidationResult = { totalRows: number; valid: number; errors: number };

type ErrorRow = { row_no: number; raw: Record<string, any>; normalized: any; errors: string[] };

const REQUIRED_FIELDS: Record<string, string> = {
  customer_name:  'Customer name',
  customer_phone: 'Customer phone',
};

const OPTIONAL_FIELDS: Record<string, string> = {
  destination:    'Destination',
  tracking_code:  'Tracking code',
  service_type:   'Service type',
  status:         'Initial status',
  occurred_at:    'Date / occurred at',
  reference_no:   'Reference no',
  internal_notes: 'Internal notes',
  cargo_type:     'Cargo type',
  cargo_desc:     'Cargo description',
};

const ERROR_LABELS: Record<string, string> = {
  customer_name_required:          'Customer name missing',
  invalid_phone:                   'Invalid phone number',
  destination_required:            'Destination missing',
  duplicate_tracking_code:         'Tracking code already exists',
  duplicate_tracking_code_in_file: 'Duplicate tracking code in file',
  delivered_locked:                'Cannot import as "delivered"',
  subscription_required:           'No active subscription',
  free_limit_reached:              'Free plan limit reached',
  paused_plan:                     'Account paused — reactivate a live plan to import shipments',
  multi_destination_not_allowed:   'Multiple destinations require Pro',
};

const ALLOWED_STATUS_OPTIONS = [
  { value: 'received',              label: 'Received' },
  { value: 'collected',             label: 'Collected' },
  { value: 'loaded',                label: 'Loaded' },
  { value: 'departed_uk',           label: 'Departed UK' },
  { value: 'arrived_destination',   label: 'Arrived at destination' },
  { value: 'out_for_delivery',      label: 'Out for delivery' },
  { value: 'collected_by_customer', label: 'Collected by customer' },
];

// Phone country options for the bulk fix selector
const PHONE_COUNTRY_OPTIONS = [
  { value: 'GB', label: '🇬🇧 United Kingdom (+44)' },
  { value: 'JM', label: '🇯🇲 Jamaica (+1-876)' },
  { value: 'US', label: '🇺🇸 United States (+1)' },
  { value: 'CA', label: '🇨🇦 Canada (+1)' },
  { value: 'BB', label: '🇧🇧 Barbados (+1-246)' },
  { value: 'NG', label: '🇳🇬 Nigeria (+234)' },
  { value: 'GH', label: '🇬🇭 Ghana (+233)' },
  { value: 'TT', label: '🇹🇹 Trinidad (+1-868)' },
];

/**
 * Client-side phone normalisation — mirrors the logic in src/lib/whatsapp/twilio.ts
 * without importing the server-only module.
 */
function clientNormalizePhone(input: string, cc: string): string | null {
  const raw0 = String(input ?? '').trim();
  if (!raw0) return null;

  const raw = raw0.replace(/[\s\-()]/g, '');
  const s0 = raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;

  if (s0.startsWith('+')) return s0;
  if (s0.startsWith('00')) return `+${s0.slice(2)}`;

  const digits = s0.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('44') && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith('1') && digits.length >= 10) return `+${digits}`;

  if (cc === 'GB') {
    if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
    return null;
  }
  if (cc === 'JM') {
    if (digits.length === 7)  return `+1876${digits}`;
    if (digits.length === 10 && digits.startsWith('876')) return `+1${digits}`;
    if (digits.startsWith('0')) return `+1${digits.slice(1)}`;
    return null;
  }
  if (cc === 'US' || cc === 'CA') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    return null;
  }
  if (cc === 'BB') {
    if (digits.length === 7) return `+1246${digits}`;
    if (digits.length === 10 && digits.startsWith('246')) return `+1${digits}`;
    return null;
  }
  if (cc === 'NG') {
    if (digits.startsWith('0') && digits.length === 11) return `+234${digits.slice(1)}`;
    if (digits.length === 10) return `+234${digits}`;
    return null;
  }
  if (cc === 'GH') {
    if (digits.startsWith('0') && digits.length === 10) return `+233${digits.slice(1)}`;
    if (digits.length === 9) return `+233${digits}`;
    return null;
  }
  return null;
}

function csvEscape(v: unknown) {
  const s = String(v ?? '');
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8;') {
  const blob = new Blob([text], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function downloadTemplateCsv() {
  const header  = ['customer_name','customer_phone','destination','service_type','status','occurred_at','tracking_code','reference_no','internal_notes','cargo_type','cargo_desc'].join(',');
  const example = ['Andre Brown','+447700900123','Jamaica','depot','received',new Date().toISOString(),'','INV-1001','Handle with care','box','2 boxes (kitchen items)'].map(csvEscape).join(',');
  downloadText('cargo44_import_template.csv', `${header}\n${example}\n`, 'text/csv;charset=utf-8;');
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ImportShipmentsClient() {
  const router   = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [step, setStep] = useState(0);

  // Step 0 state
  const [file, setFile]         = useState<File | null>(null);
  const [defaults, setDefaults] = useState({ serviceType: 'depot' });

  // Step 1 state
  const [jobId, setJobId]           = useState<string | null>(null);
  const [headers, setHeaders]       = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [mapping, setMapping]       = useState<Mapping>({});

  // Step 2 state
  const [validating, setValidating]             = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [errorRows, setErrorRows]               = useState<ErrorRow[]>([]);
  const [localEdits, setLocalEdits]             = useState<Record<number, Record<string, string>>>({});
  const [bulkPhoneCountry, setBulkPhoneCountry]     = useState('');
  const [bulkDestination, setBulkDestination]       = useState('');
  const [bulkClearTracking, setBulkClearTracking]   = useState(false);
  const [bulkDeliveredStatus, setBulkDeliveredStatus] = useState('');
  const [saving, setSaving]                         = useState(false);
  const [orgDestinations, setOrgDestinations]   = useState<string[]>([]);

  // Step 3 state
  const [totalRows, setTotalRows]         = useState(0);
  const [importedTotal, setImportedTotal] = useState(0);
  const [errorTotal, setErrorTotal]       = useState(0);

  const [loading, setLoading]     = useState(false);
  const [importing, setImporting] = useState(false);
  const stopRef = useRef(false);

  const REQUIRED_KEYS = Object.keys(REQUIRED_FIELDS) as (keyof typeof REQUIRED_FIELDS)[];
  const hasRequiredMapping = REQUIRED_KEYS.every((k) => Boolean(mapping[k]));
  const progressPct = totalRows ? Math.min(((importedTotal + errorTotal) / totalRows) * 100, 100) : 0;

  // Auto-trigger validation when entering step 2
  useEffect(() => {
    if (step === 2 && jobId && !validationResult && !validating) {
      runValidation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Fetch org destinations once on mount (for bulk destination selector)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('org_destinations')
        .select('name')
        .eq('active', true)
        .order('sort_order', { ascending: true });
      setOrgDestinations((data ?? []).map((d: any) => String(d.name)));
    })();
  }, [supabase]);

  // ── Upload & parse ─────────────────────────────────────────────────────────
  async function uploadAndParse() {
    if (!file) return;
    setLoading(true);
    try {
      const createRes  = await fetch('/api/imports/jobs/create', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name }),
      });
      const createJson = await createRes.json().catch(() => null);
      if (!createRes.ok) throw new Error(createJson?.error ?? 'Failed to create job');

      setJobId(createJson.jobId);

      const up = await supabase.storage.from('imports').upload(createJson.uploadPath, file, {
        upsert: true, contentType: file.type || undefined,
      });
      if (up.error) throw new Error(up.error.message);

      const parseRes  = await fetch(`/api/imports/jobs/${createJson.jobId}/parse`, { method: 'POST', cache: 'no-store' });
      const parseJson = await parseRes.json().catch(() => null);
      if (!parseRes.ok) throw new Error(parseJson?.error ?? 'Failed to parse file');

      setHeaders(parseJson.headers ?? []);
      setSampleRows(parseJson.sampleRows ?? []);
      setTotalRows(Number(parseJson.totalRows ?? 0));
      setMapping((parseJson.suggestedMapping ?? {}) as Mapping);
      setStep(1);
    } catch (e: any) {
      notifications.show({ title: 'Upload failed', message: e?.message, color: 'red' });
    } finally {
      setLoading(false);
    }
  }

  // ── Fetch error rows after validation ──────────────────────────────────────
  async function fetchErrorRows(jId: string) {
    const { data, error } = await supabase
      .from('import_rows')
      .select('row_no, raw, normalized, errors')
      .eq('job_id', jId)
      .eq('status', 'error')
      .order('row_no', { ascending: true });

    if (error) return;
    setErrorRows((data ?? []) as ErrorRow[]);
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  async function runValidation() {
    if (!jobId) return;
    setValidating(true);
    setValidationResult(null);
    setErrorRows([]);
    setLocalEdits({});
    setBulkPhoneCountry('');
    setBulkDestination('');
    setBulkClearTracking(false);
    setBulkDeliveredStatus('');
    try {
      const res  = await fetch(`/api/imports/jobs/${jobId}/validate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mapping, defaults }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? 'Validation failed');
      setValidationResult(json as ValidationResult);
      if ((json as ValidationResult).errors > 0) {
        await fetchErrorRows(jobId);
      }
    } catch (e: any) {
      notifications.show({ title: 'Validation failed', message: e?.message, color: 'red' });
    } finally {
      setValidating(false);
    }
  }

  // ── Save edits & re-validate ───────────────────────────────────────────────
  async function saveAndRevalidate() {
    if (!jobId) return;
    setSaving(true);
    try {
      // Build merged overrides: bulk controls + per-row edits
      const rowPayload = errorRows.map((row) => {
        const overrides: Record<string, string> = {};

        if (bulkPhoneCountry && row.errors.includes('invalid_phone')) {
          overrides.phone_country = bulkPhoneCountry;
        }
        if (bulkDestination && row.errors.includes('destination_required')) {
          overrides.destination = bulkDestination;
        }
        if (bulkClearTracking && mapping.tracking_code &&
            (row.errors.includes('duplicate_tracking_code') || row.errors.includes('duplicate_tracking_code_in_file'))) {
          overrides[mapping.tracking_code] = '';
        }
        if (bulkDeliveredStatus && mapping.status &&
            row.errors.includes('delivered_locked')) {
          overrides[mapping.status] = bulkDeliveredStatus;
        }

        // Per-row edits override bulk
        const perRow = localEdits[row.row_no] ?? {};
        Object.assign(overrides, perRow);

        return { row_no: row.row_no, overrides };
      }).filter((r) => Object.keys(r.overrides).length > 0);

      if (rowPayload.length) {
        const res = await fetch(`/api/imports/jobs/${jobId}/fix-rows`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: rowPayload }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? 'Failed to save fixes');
        }
      }

      // Re-validate
      await runValidation();
    } catch (e: any) {
      notifications.show({ title: 'Save failed', message: e?.message, color: 'red' });
    } finally {
      setSaving(false);
    }
  }

  // ── Import loop ───────────────────────────────────────────────────────────
  async function runImportLoop() {
    if (!jobId) return;
    setImporting(true);
    stopRef.current = false;
    try {
      while (!stopRef.current) {
        const res  = await fetch(`/api/imports/jobs/${jobId}/import`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chunkSize: 150 }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? 'Import failed');
        if (json.done) break;
        setImportedTotal((p) => p + Number(json.imported ?? 0));
        setErrorTotal((p) => p + Number(json.errors ?? 0));
        if (!json.next) break;
      }
      setStep(4);
      notifications.show({ title: 'Import complete', message: 'Shipments imported successfully', color: 'teal' });
    } catch (e: any) {
      notifications.show({ title: 'Import failed', message: e?.message, color: 'red' });
    } finally {
      setImporting(false);
    }
  }

  // ── Download error report (after validate or import) ──────────────────────
  async function downloadErrorReport() {
    if (!jobId) return;

    const { data, error } = await supabase
      .from('import_rows')
      .select('row_no, raw, errors')
      .eq('job_id', jobId)
      .eq('status', 'error')
      .order('row_no', { ascending: true });

    if (error) { notifications.show({ title: 'Failed', message: error.message, color: 'red' }); return; }

    const rows = data ?? [];
    if (!rows.length) { notifications.show({ message: 'No error rows to download', color: 'yellow' }); return; }

    const rawKeys = Array.from(new Set(rows.flatMap((r: any) => Object.keys(r.raw ?? {}))));
    const headerRow = [...rawKeys, '_row_no', '_errors'].map(csvEscape).join(',');

    const lines = rows.map((r: any) => {
      const errorCodes = Array.isArray(r.errors) ? r.errors : [];
      const errorText  = errorCodes.map((c: string) => ERROR_LABELS[c] ?? c).join(' | ');
      const rawCols    = rawKeys.map((k) => csvEscape(r.raw?.[k] ?? ''));
      return [...rawCols, csvEscape(r.row_no), csvEscape(errorText)].join(',');
    });

    downloadText(
      `cargo44_import_errors_${jobId.slice(0, 8)}.csv`,
      `${headerRow}\n${lines.join('\n')}\n`,
      'text/csv;charset=utf-8;'
    );
  }

  // ── Reset for re-upload ───────────────────────────────────────────────────
  function resetForNewImport() {
    setStep(0);
    setFile(null);
    setJobId(null);
    setHeaders([]);
    setSampleRows([]);
    setMapping({});
    setValidationResult(null);
    setErrorRows([]);
    setLocalEdits({});
    setBulkPhoneCountry('');
    setBulkDestination('');
    setBulkClearTracking(false);
    setBulkDeliveredStatus('');
    setImportedTotal(0);
    setErrorTotal(0);
    setTotalRows(0);
  }

  const mappingOptions = [{ value: '', label: '— skip —' }].concat(
    headers.map((h) => ({ value: h, label: h }))
  );

  const destSelectOptions = orgDestinations.map((d) => ({ value: d, label: d }));

  const hasEdits =
    bulkPhoneCountry !== '' ||
    bulkDestination !== '' ||
    bulkClearTracking ||
    bulkDeliveredStatus !== '' ||
    Object.keys(localEdits).length > 0;

  // ── Error table: compute effective phone preview for a row ─────────────────
  function getPhonePreview(row: ErrorRow): string | null {
    const phoneField = mapping.customer_phone;
    const rawPhone   = String(phoneField ? (row.raw[phoneField] ?? '') : '');
    // Effective country: per-row edit > bulk > from raw > default GB
    const country = (
      localEdits[row.row_no]?.phone_country ??
      (bulkPhoneCountry || null) ??
      (mapping.phone_country ? (String(row.raw[mapping.phone_country] ?? '') || null) : null)
    ) ?? 'GB';
    return clientNormalizePhone(rawPhone, country.toUpperCase());
  }

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={2}>
          <Text fw={800} size="xl">Bulk import</Text>
          <Text c="dimmed" size="sm">Upload a CSV or XLSX → validate → import in batches.</Text>
        </Stack>
        <Button variant="subtle" size="sm" onClick={() => router.push('/shipments')}>
          Back to shipments
        </Button>
      </Group>

      <Paper withBorder p="xl" radius="md">
        <Stepper active={step} onStepClick={setStep} allowNextStepsSelect={false}>

          {/* ── Step 0: Upload ──────────────────────────────────────────────── */}
          <Stepper.Step label="Upload" description="CSV or XLSX" icon={<IconUpload size={16} />}>
            <Stack gap="lg" mt="lg">
              <FileButton onChange={setFile} accept=".csv,.xlsx,.xls">
                {(props) => (
                  <UnstyledButton
                    {...props}
                    style={{
                      border: '2px dashed var(--mantine-color-default-border)',
                      borderRadius: 'var(--mantine-radius-md)',
                      padding: '32px 24px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: file ? 'var(--mantine-color-teal-0)' : 'var(--mantine-color-default)',
                      borderColor: file ? 'var(--mantine-color-teal-4)' : undefined,
                      transition: 'all 0.15s',
                    }}
                  >
                    <Stack gap="xs" align="center">
                      <ThemeIcon size="xl" radius="xl" variant={file ? 'filled' : 'light'} color={file ? 'teal' : 'gray'}>
                        {file ? <IconCheck size={20} /> : <IconFileSpreadsheet size={20} />}
                      </ThemeIcon>
                      {file ? (
                        <>
                          <Text fw={600} size="sm">{file.name}</Text>
                          <Text size="xs" c="dimmed">{formatBytes(file.size)} · Click to change</Text>
                        </>
                      ) : (
                        <>
                          <Text fw={600} size="sm">Click to upload spreadsheet</Text>
                          <Text size="xs" c="dimmed">Supports .csv, .xlsx, .xls</Text>
                        </>
                      )}
                    </Stack>
                  </UnstyledButton>
                )}
              </FileButton>

              <Group justify="space-between" align="flex-end">
                <Stack gap={4}>
                  <Text size="sm" fw={500}>Default service type</Text>
                  <Select
                    value={defaults.serviceType}
                    onChange={(v) => setDefaults((p) => ({ ...p, serviceType: v ?? 'depot' }))}
                    data={[
                      { value: 'depot',        label: 'Depot collection' },
                      { value: 'door_to_door', label: 'Door to door' },
                    ]}
                    w={200}
                  />
                </Stack>

                <Group gap="sm">
                  <Button variant="default" leftSection={<IconDownload size={15} />} onClick={downloadTemplateCsv}>
                    Download template
                  </Button>
                  <Button
                    leftSection={<IconArrowRight size={15} />}
                    loading={loading}
                    disabled={!file}
                    onClick={uploadAndParse}
                    color="teal"
                  >
                    Upload & parse
                  </Button>
                </Group>
              </Group>
            </Stack>
          </Stepper.Step>

          {/* ── Step 1: Map ─────────────────────────────────────────────────── */}
          <Stepper.Step label="Map columns" description="Match your headers">
            <Stack gap="lg" mt="lg">
              <Text size="sm" c="dimmed">{totalRows} rows detected. Map your CSV columns below.</Text>

              <Stack gap="xs">
                <Group gap="xs">
                  <Text size="sm" fw={700}>Required</Text>
                  <Badge size="xs" color="red" variant="light">must map</Badge>
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {Object.entries(REQUIRED_FIELDS).map(([key, label]) => (
                    <Select
                      key={key}
                      label={label}
                      value={mapping[key] ?? ''}
                      onChange={(v) => setMapping((p) => ({ ...p, [key]: v || null }))}
                      data={mappingOptions}
                      searchable
                      error={!mapping[key] ? 'Required' : undefined}
                    />
                  ))}
                </SimpleGrid>
              </Stack>

              <Divider />

              <Stack gap="xs">
                <Text size="sm" fw={700} c="dimmed">Optional</Text>
                <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }}>
                  {Object.entries(OPTIONAL_FIELDS).map(([key, label]) => (
                    <Select
                      key={key}
                      label={label}
                      value={mapping[key] ?? ''}
                      onChange={(v) => setMapping((p) => ({ ...p, [key]: v || null }))}
                      data={mappingOptions}
                      searchable
                    />
                  ))}
                </SimpleGrid>
              </Stack>

              {sampleRows.length > 0 && (
                <Stack gap="xs">
                  <Text size="sm" fw={700}>
                    Preview{' '}
                    <Text span c="dimmed" fw={400}>(first {Math.min(sampleRows.length, 5)} rows)</Text>
                  </Text>
                  <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
                    <Table striped highlightOnHover fz="sm">
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>#</Table.Th>
                          <Table.Th>Name</Table.Th>
                          <Table.Th>Phone</Table.Th>
                          <Table.Th>Destination</Table.Th>
                          <Table.Th>Status</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {sampleRows.slice(0, 5).map((r, idx) => (
                          <Table.Tr key={idx}>
                            <Table.Td c="dimmed">{idx + 1}</Table.Td>
                            <Table.Td>{String(r[mapping.customer_name ?? ''] ?? '—')}</Table.Td>
                            <Table.Td>{String(r[mapping.customer_phone ?? ''] ?? '—')}</Table.Td>
                            <Table.Td>{String(r[mapping.destination ?? ''] ?? '—')}</Table.Td>
                            <Table.Td>{String(r[mapping.status ?? ''] ?? 'received')}</Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Paper>
                </Stack>
              )}

              <Group justify="space-between">
                <Button variant="subtle" onClick={() => setStep(0)}>Back</Button>
                <Button
                  leftSection={<IconArrowRight size={15} />}
                  disabled={!hasRequiredMapping}
                  onClick={() => {
                    setValidationResult(null);
                    setStep(2);
                  }}
                  color="teal"
                >
                  Validate
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          {/* ── Step 2: Validate ────────────────────────────────────────────── */}
          <Stepper.Step label="Validate" description="Check for issues">
            <Stack gap="lg" mt="lg">
              {validating && (
                <Group gap="sm">
                  <IconLoader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                  <Text size="sm" c="dimmed">Normalising phones, checking duplicates…</Text>
                </Group>
              )}

              {validationResult && !validating && (
                <>
                  {/* Summary badges */}
                  <Group gap="md">
                    <Paper withBorder p="md" radius="md" style={{ flex: 1, textAlign: 'center' }}>
                      <Text size="xl" fw={800} c="teal">{validationResult.valid}</Text>
                      <Text size="xs" c="dimmed" mt={2}>Valid rows</Text>
                    </Paper>
                    <Paper withBorder p="md" radius="md" style={{ flex: 1, textAlign: 'center' }}>
                      <Text size="xl" fw={800} c={validationResult.errors > 0 ? 'red' : 'dimmed'}>
                        {validationResult.errors}
                      </Text>
                      <Text size="xs" c="dimmed" mt={2}>Rows with errors</Text>
                    </Paper>
                    <Paper withBorder p="md" radius="md" style={{ flex: 1, textAlign: 'center' }}>
                      <Text size="xl" fw={800}>{validationResult.totalRows}</Text>
                      <Text size="xs" c="dimmed" mt={2}>Total rows</Text>
                    </Paper>
                  </Group>

                  {validationResult.errors > 0 && errorRows.length > 0 && (
                    <Stack gap="md">
                      {/* Bulk fix controls */}
                      <Paper withBorder p="md" radius="md" bg="orange.0">
                        <Stack gap="sm">
                          <Group gap="xs">
                            <IconEdit size={15} />
                            <Text size="sm" fw={700}>Fix errors in-browser</Text>
                            <Badge size="xs" color="orange" variant="light">{validationResult.errors} rows</Badge>
                          </Group>
                          <Text size="xs" c="dimmed">
                            Use the controls below to fix all errors at once, then click "Save &amp; re-validate".
                          </Text>
                          <SimpleGrid cols={{ base: 1, sm: 2 }}>
                            {errorRows.some((r) => r.errors.includes('invalid_phone')) && (
                              <Select
                                label="Set phone country for all rows"
                                placeholder="Pick country…"
                                value={bulkPhoneCountry}
                                onChange={(v) => setBulkPhoneCountry(v ?? '')}
                                data={PHONE_COUNTRY_OPTIONS}
                                clearable
                              />
                            )}
                            {errorRows.some((r) => r.errors.includes('destination_required')) && destSelectOptions.length > 0 && (
                              <Select
                                label="Set destination for all rows"
                                placeholder="Pick destination…"
                                value={bulkDestination}
                                onChange={(v) => setBulkDestination(v ?? '')}
                                data={destSelectOptions}
                                clearable
                              />
                            )}
                            {errorRows.some((r) => r.errors.includes('delivered_locked')) && mapping.status && (
                              <Select
                                label={`Change status for all "delivered" rows to`}
                                placeholder="Pick status…"
                                value={bulkDeliveredStatus || null}
                                onChange={(v) => setBulkDeliveredStatus(v ?? '')}
                                data={ALLOWED_STATUS_OPTIONS}
                                clearable
                              />
                            )}
                          </SimpleGrid>
                          {(() => {
                            const dupCount = errorRows.filter((r) =>
                              r.errors.includes('duplicate_tracking_code') ||
                              r.errors.includes('duplicate_tracking_code_in_file')
                            ).length;
                            if (!dupCount) return null;
                            if (!mapping.tracking_code) return (
                              <Text size="xs" c="dimmed">
                                Map your tracking code column in step 1 to auto-fix duplicate codes.
                              </Text>
                            );
                            return (
                              <Button
                                size="xs"
                                variant={bulkClearTracking ? 'filled' : 'outline'}
                                color="teal"
                                onClick={() => setBulkClearTracking((p) => !p)}
                              >
                                {bulkClearTracking
                                  ? `✓ Auto-generate new codes for ${dupCount} duplicate row${dupCount !== 1 ? 's' : ''}`
                                  : `Auto-generate new codes for ${dupCount} duplicate row${dupCount !== 1 ? 's' : ''}`}
                              </Button>
                            );
                          })()}
                        </Stack>
                      </Paper>

                      {/* Error table */}
                      {(() => {
                        const showTrackingCol = errorRows.some((r) =>
                          r.errors.includes('duplicate_tracking_code') ||
                          r.errors.includes('duplicate_tracking_code_in_file')
                        );
                        const showStatusCol = errorRows.some((r) =>
                          r.errors.includes('delivered_locked')
                        );
                        return (
                      <Paper withBorder radius="md" style={{ overflowX: 'auto' }}>
                        <Table fz="sm" highlightOnHover>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th style={{ width: 40 }}>#</Table.Th>
                              <Table.Th>Name</Table.Th>
                              <Table.Th>Phone → E.164</Table.Th>
                              <Table.Th>Destination</Table.Th>
                              {showTrackingCol && <Table.Th>Tracking Code</Table.Th>}
                              {showStatusCol && <Table.Th>Status</Table.Th>}
                              <Table.Th>Errors</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {errorRows.map((row) => {
                              const phoneField = mapping.customer_phone;
                              const nameField  = mapping.customer_name;
                              const destField  = mapping.destination;

                              const rawPhone = phoneField ? String(row.raw[phoneField] ?? '') : '';
                              const rawName  = nameField  ? String(row.raw[nameField]  ?? '') : '';
                              const rawDest  = destField  ? String(row.raw[destField]  ?? '') : '';

                              const hasPhoneErr = row.errors.includes('invalid_phone');
                              const hasNameErr  = row.errors.includes('customer_name_required');
                              const hasDestErr  = row.errors.includes('destination_required');

                              const phonePreview = hasPhoneErr ? getPhonePreview(row) : null;

                              const effectiveDest =
                                localEdits[row.row_no]?.destination ??
                                (hasDestErr && bulkDestination ? bulkDestination : null) ??
                                rawDest;

                              const cellStyle = (hasError: boolean): React.CSSProperties => hasError ? {
                                borderLeft: '3px solid var(--mantine-color-red-5)',
                                background: 'var(--mantine-color-red-0)',
                                paddingLeft: 8,
                              } : {};

                              return (
                                <Table.Tr key={row.row_no}>
                                  <Table.Td c="dimmed">{row.row_no}</Table.Td>

                                  {/* Name cell */}
                                  <Table.Td style={cellStyle(hasNameErr)}>
                                    {hasNameErr ? (
                                      <TextInput
                                        size="xs"
                                        value={localEdits[row.row_no]?.customer_name ?? rawName}
                                        onChange={(e) => {
                                          const v = e.currentTarget.value;
                                          setLocalEdits((prev) => ({
                                            ...prev,
                                            [row.row_no]: { ...(prev[row.row_no] ?? {}), customer_name: v },
                                          }));
                                        }}
                                        placeholder="Customer name"
                                        styles={{ input: { minWidth: 140 } }}
                                      />
                                    ) : (
                                      <Text size="sm">{rawName || '—'}</Text>
                                    )}
                                  </Table.Td>

                                  {/* Phone cell */}
                                  <Table.Td style={cellStyle(hasPhoneErr)}>
                                    <Stack gap={2}>
                                      <Text size="sm" c={hasPhoneErr ? 'red' : undefined}>{rawPhone || '—'}</Text>
                                      {hasPhoneErr && (
                                        <Text size="xs" c={phonePreview ? 'teal' : 'red'} fw={500}>
                                          → {phonePreview ?? '? (can\'t parse)'}
                                        </Text>
                                      )}
                                    </Stack>
                                  </Table.Td>

                                  {/* Destination cell */}
                                  <Table.Td style={cellStyle(hasDestErr)}>
                                    {hasDestErr ? (
                                      <Select
                                        size="xs"
                                        value={effectiveDest || null}
                                        onChange={(v) => {
                                          setLocalEdits((prev) => ({
                                            ...prev,
                                            [row.row_no]: { ...(prev[row.row_no] ?? {}), destination: v ?? '' },
                                          }));
                                        }}
                                        data={destSelectOptions}
                                        placeholder="Pick…"
                                        clearable
                                        styles={{ input: { minWidth: 140 } }}
                                      />
                                    ) : (
                                      <Text size="sm">{rawDest || '—'}</Text>
                                    )}
                                  </Table.Td>

                                  {/* Tracking code cell */}
                                  {showTrackingCol && (() => {
                                    const trackField = mapping.tracking_code;
                                    const rawTracking = trackField ? String(row.raw[trackField] ?? '') : '';
                                    const hasDupErr = row.errors.includes('duplicate_tracking_code') || row.errors.includes('duplicate_tracking_code_in_file');
                                    return (
                                      <Table.Td style={cellStyle(hasDupErr)}>
                                        <Stack gap={2}>
                                          <Text size="sm" c={hasDupErr ? 'red' : undefined}>{rawTracking || '—'}</Text>
                                          {hasDupErr && bulkClearTracking && (
                                            <Text size="xs" c="teal" fw={500}>→ auto-generate</Text>
                                          )}
                                        </Stack>
                                      </Table.Td>
                                    );
                                  })()}

                                  {/* Status cell */}
                                  {showStatusCol && (() => {
                                    const statusField = mapping.status;
                                    const rawStatus = statusField ? String(row.raw[statusField] ?? '') : 'delivered';
                                    const hasDeliveredErr = row.errors.includes('delivered_locked');
                                    const previewStatus = hasDeliveredErr && bulkDeliveredStatus
                                      ? ALLOWED_STATUS_OPTIONS.find((o) => o.value === bulkDeliveredStatus)?.label ?? bulkDeliveredStatus
                                      : null;
                                    return (
                                      <Table.Td style={cellStyle(hasDeliveredErr)}>
                                        <Stack gap={2}>
                                          <Text size="sm" c={hasDeliveredErr ? 'red' : undefined}>{rawStatus || '—'}</Text>
                                          {hasDeliveredErr && previewStatus && (
                                            <Text size="xs" c="teal" fw={500}>→ {previewStatus}</Text>
                                          )}
                                        </Stack>
                                      </Table.Td>
                                    );
                                  })()}

                                  {/* Errors */}
                                  <Table.Td>
                                    <Stack gap={2}>
                                      {row.errors.map((e) => (
                                        <Badge key={e} size="xs" color="red" variant="light">
                                          {ERROR_LABELS[e] ?? e}
                                        </Badge>
                                      ))}
                                    </Stack>
                                  </Table.Td>
                                </Table.Tr>
                              );
                            })}
                          </Table.Tbody>
                        </Table>
                      </Paper>
                        );
                      })()}

                      <Group justify="flex-end">
                        <Button
                          color="orange"
                          loading={saving}
                          disabled={!hasEdits || saving}
                          onClick={saveAndRevalidate}
                          leftSection={<IconRefresh size={14} />}
                        >
                          Save &amp; re-validate
                        </Button>
                      </Group>
                    </Stack>
                  )}

                  {validationResult.errors > 0 && (
                    <Group gap="sm" mt={4}>
                      <Button
                        size="xs"
                        variant="outline"
                        color="orange"
                        leftSection={<IconDownload size={13} />}
                        onClick={downloadErrorReport}
                      >
                        Download error report
                      </Button>
                    </Group>
                  )}

                  {validationResult.errors === 0 && (
                    <Alert icon={<IconCheck size={16} />} color="teal" title="All rows valid!">
                      {validationResult.valid} row{validationResult.valid !== 1 ? 's' : ''} ready to import.
                    </Alert>
                  )}

                  {validationResult.valid === 0 && (
                    <Alert color="red" title="No valid rows to import">
                      Fix the errors above and click "Save &amp; re-validate".
                    </Alert>
                  )}
                </>
              )}

              <Group justify="space-between">
                <Group gap="sm">
                  <Button variant="subtle" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    variant="subtle"
                    leftSection={<IconRefresh size={14} />}
                    disabled={validating}
                    onClick={() => { setValidationResult(null); runValidation(); }}
                  >
                    Re-validate
                  </Button>
                </Group>
                <Button
                  leftSection={<IconPlayerPlay size={15} />}
                  disabled={!validationResult || validating || (validationResult?.valid ?? 0) === 0}
                  onClick={() => { setStep(3); setTimeout(runImportLoop, 0); }}
                  color="teal"
                >
                  Import {validationResult?.valid ?? 0} valid rows
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          {/* ── Step 3: Importing ───────────────────────────────────────────── */}
          <Stepper.Step label="Importing" description="Processing rows">
            <Stack gap="lg" mt="lg">
              <Group justify="space-between" align="flex-end">
                <Stack gap={2}>
                  <Text fw={700}>Importing {validationResult?.valid ?? totalRows} rows…</Text>
                  <Text size="sm" c="dimmed">Processing in batches to avoid timeouts.</Text>
                </Stack>
                <Group gap="xl">
                  <Text size="sm"><Text span fw={600} c="teal">{importedTotal}</Text> imported</Text>
                  <Text size="sm"><Text span fw={600} c="red">{errorTotal}</Text> errors</Text>
                </Group>
              </Group>

              <Progress value={progressPct} radius="xl" size="lg" color="teal" animated={importing} />

              <Group justify="flex-end">
                <Button
                  variant="subtle" color="red"
                  leftSection={<IconX size={15} />}
                  disabled={!importing}
                  onClick={() => { stopRef.current = true; }}
                >
                  Stop
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          {/* ── Done ────────────────────────────────────────────────────────── */}
          <Stepper.Completed>
            <Stack gap="lg" mt="lg">
              <Group gap="sm">
                <ThemeIcon size="lg" radius="xl" color="teal"><IconCheck size={18} /></ThemeIcon>
                <Stack gap={0}>
                  <Text fw={700}>Import complete</Text>
                  <Text size="sm" c="dimmed">
                    {importedTotal} shipment{importedTotal !== 1 ? 's' : ''} created
                    {errorTotal > 0 ? `, ${errorTotal} row${errorTotal !== 1 ? 's' : ''} failed` : ''}.
                  </Text>
                </Stack>
              </Group>

              {errorTotal > 0 && (
                <Alert icon={<IconAlertCircle size={16} />} color="orange" title="Fix & re-upload">
                  <Stack gap="xs">
                    <Text size="sm">
                      Download the error report, correct the issues in your spreadsheet, then start a new import for those rows.
                    </Text>
                    <Group gap="sm">
                      <Button
                        size="xs" variant="outline" color="orange"
                        leftSection={<IconDownload size={13} />}
                        onClick={downloadErrorReport}
                      >
                        Download error report
                      </Button>
                      <Button
                        size="xs" variant="subtle"
                        leftSection={<IconRefresh size={13} />}
                        onClick={resetForNewImport}
                      >
                        Start new import
                      </Button>
                    </Group>
                  </Stack>
                </Alert>
              )}

              <Group>
                <Button color="teal" onClick={() => { router.push('/shipments'); router.refresh(); }}>
                  Go to shipments
                </Button>
                {errorTotal === 0 && (
                  <Button variant="subtle" leftSection={<IconRefresh size={14} />} onClick={resetForNewImport}>
                    Import another file
                  </Button>
                )}
              </Group>
            </Stack>
          </Stepper.Completed>

        </Stepper>
      </Paper>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </Stack>
  );
}
