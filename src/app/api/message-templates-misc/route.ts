import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const key = String(searchParams.get('key') ?? '').trim();

  const q = supabase
    .from('message_templates_misc')
    .select('id, org_id, key, body, enabled, created_at, updated_at')
    .order('created_at', { ascending: true });

  const { data, error } = key ? await q.eq('key', key) : await q;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, templates: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);

  const id = body?.id ? String(body.id) : null;
  const key = String(body?.key ?? '').trim();
  const tplBody = String(body?.body ?? '').trim();
  const enabled = Boolean(body?.enabled ?? true);

  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });
  if (!tplBody) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  // Find caller org_id (same pattern you already use elsewhere)
  const { data: mem, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!mem?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 400 });

  const payload: any = {
    org_id: mem.org_id,
    key,
    body: tplBody,
    enabled,
    updated_at: new Date().toISOString(),
  };
  if (id) payload.id = id;

  const { data, error } = await supabase
    .from('message_templates_misc')
    .upsert(payload, { onConflict: 'org_id,key' })
    .select('id, key, body, enabled')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, template: data });
}
