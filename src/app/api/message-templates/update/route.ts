import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = String(body?.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: any = {};
  if (body?.status != null) patch.status = String(body.status).trim();
  if (body?.name != null) patch.name = String(body.name).trim();
  if (body?.body != null) patch.body = String(body.body).trim();
  if (body?.enabled != null) patch.enabled = !!body.enabled;

  const { data, error } = await supabase
    .from('message_templates')
    .update(patch)
    .eq('id', id)
    .select('id, status, name, body, enabled, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}
