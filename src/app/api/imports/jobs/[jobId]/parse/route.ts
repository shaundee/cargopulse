export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

function norm(s: string) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\s\-_]+/g, ' ')
    .trim();
}

const SYNONYMS: Record<string, string[]> = {
  customer_name: ['customer name', 'name', 'client', 'customer', 'full name'],
  customer_phone: ['phone', 'mobile', 'whatsapp', 'number', 'tel', 'telephone'],
  phone_country: ['phone country', 'country code', 'dial code', 'cc'],
  destination: ['destination', 'to', 'dest', 'country', 'island'],
  tracking_code: ['tracking', 'tracking code', 'awb', 'waybill', 'ref', 'reference', 'code'],
  service_type: ['service', 'service type', 'delivery', 'type'],
  status: ['status', 'stage', 'milestone'],
  occurred_at: ['occurred at', 'date', 'event date', 'updated at', 'time'],
  reference_no: ['reference no', 'ref no', 'booking', 'invoice', 'order'],
  internal_notes: ['notes', 'internal notes', 'comment', 'memo'],
  cargo_type: ['cargo type', 'package type', 'item type'],
  cargo_desc: ['cargo', 'description', 'contents', 'items'],
};

function suggestMapping(headers: string[]) {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const out: Record<string, string | null> = {};

  for (const key of Object.keys(SYNONYMS)) {
    out[key] = null;

    for (const syn of SYNONYMS[key]) {
      const hit = byNorm.get(norm(syn));
      if (hit) { out[key] = hit; break; }
    }

    if (!out[key]) {
      const syns = SYNONYMS[key].map(norm);
      const found = headers.find((h) => syns.some((s) => norm(h).includes(s)));
      if (found) out[key] = found;
    }
  }

  return out;
}

function isRowEmpty(r: Record<string, any>) {
  return Object.values(r ?? {}).every((v) => String(v ?? '').trim() === '');
}

export async function POST(_: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const { jobId } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });

  const orgId = membership.org_id as string;

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .select('id, org_id, filename, storage_path')
    .eq('id', jobId)
    .maybeSingle();

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 400 });
  if (!job || job.org_id !== orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!job.storage_path) return NextResponse.json({ error: 'Missing storage_path' }, { status: 400 });

  const { data: blob, error: dlErr } = await supabase.storage.from('imports').download(job.storage_path);
  if (dlErr || !blob) return NextResponse.json({ error: dlErr?.message ?? 'Download failed' }, { status: 400 });

  const filename = String(job.filename ?? '').toLowerCase();
  let rows: Record<string, any>[] = [];

  if (filename.endsWith('.csv')) {
    const text = await blob.text();
    const parsed = Papa.parse<Record<string, any>>(text, { header: true, skipEmptyLines: true });
    if (parsed.errors?.length) {
      return NextResponse.json({ error: parsed.errors[0]?.message ?? 'CSV parse error' }, { status: 400 });
    }
    rows = (parsed.data ?? []).filter((r) => !isRowEmpty(r));
  } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
    const ab = await blob.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
    rows = (data ?? []).filter((r) => !isRowEmpty(r));
  } else {
    return NextResponse.json({ error: 'Only .csv or .xlsx supported' }, { status: 400 });
  }

  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r ?? {})).map(String)));

  // reset old rows so re-parse is clean
  await supabase.from('import_rows').delete().eq('job_id', jobId);

  // insert raw rows in chunks
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((r, idx) => ({
      job_id: jobId,
      row_no: i + idx + 1,
      status: 'pending',
      raw: r,
      normalized: {},
      errors: [],
    }));
    const { error } = await supabase.from('import_rows').insert(chunk);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const mapping = suggestMapping(headers);

  const { error: upErr } = await supabase
    .from('import_jobs')
    .update({
      status: 'parsed',
      total_rows: rows.length,
      mapping,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    totalRows: rows.length,
    headers,
    suggestedMapping: mapping,
    sampleRows: rows.slice(0, 20),
  });
}