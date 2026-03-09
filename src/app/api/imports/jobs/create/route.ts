import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentOrgId } from '@/lib/org/getCurrentOrgId';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

function safeFilename(name: string) {
  const base = String(name ?? 'import.csv').trim() || 'import.csv';
  // keep it simple + safe in storage paths
  return base.replace(/[^a-zA-Z0-9.\-_]+/g, '_').slice(0, 120);
}

export async function POST(req: Request) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const filename = safeFilename(body?.filename);

  const orgId = await getCurrentOrgId();

  const { data: job, error: jobErr } = await supabase
    .from('import_jobs')
    .insert({
      org_id: orgId,
      kind: 'shipments',
      filename,
      status: 'created',
      created_by: user.id,
    })
    .select('id')
    .single();

  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 400 });

  const uploadPath = `org/${orgId}/jobs/${job.id}/${filename}`;

  const { error: upErr } = await supabase
    .from('import_jobs')
    .update({ storage_path: uploadPath, status: 'created' })
    .eq('id', job.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, jobId: job.id, uploadPath });
}