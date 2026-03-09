export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

type RowOverride = { row_no: number; overrides: Record<string, string> };

export async function PATCH(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const { jobId } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) return NextResponse.json({ error: 'No organization' }, { status: 400 });
  const orgId = membership.org_id as string;

  // Verify job ownership
  const { data: job } = await supabase
    .from('import_jobs')
    .select('id, org_id')
    .eq('id', jobId)
    .maybeSingle();

  if (!job || job.org_id !== orgId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const rows: RowOverride[] = Array.isArray(body?.rows) ? body.rows : [];
  if (!rows.length) return NextResponse.json({ ok: true, updated: 0 });

  const rowNos = rows.map((r) => r.row_no);

  // Fetch existing raw data for the affected rows
  const { data: existing, error: fetchErr } = await supabase
    .from('import_rows')
    .select('row_no, raw')
    .eq('job_id', jobId)
    .in('row_no', rowNos);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 400 });

  const existingMap = new Map((existing ?? []).map((r: any) => [r.row_no, r.raw]));

  // Merge overrides into existing raw
  const upserts = rows.map((r) => ({
    job_id: jobId,
    row_no: r.row_no,
    raw: { ...(existingMap.get(r.row_no) ?? {}), ...r.overrides },
    updated_at: new Date().toISOString(),
  }));

  const CHUNK = 500;
  for (let i = 0; i < upserts.length; i += CHUNK) {
    const { error } = await supabase
      .from('import_rows')
      .upsert(upserts.slice(i, i + CHUNK), { onConflict: 'job_id,row_no' });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, updated: upserts.length });
}
