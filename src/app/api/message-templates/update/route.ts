import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const input = await req.json().catch(() => null);
  const id = String(input?.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: any = {};
  if (input?.status != null) patch.status = String(input.status).trim();
  if (input?.body != null) patch.body = String(input.body).trim();
  if (input?.enabled != null) patch.enabled = !!input.enabled;

  const { data, error } = await supabase
    .from('message_templates')
    .update(patch)
    .eq('id', id)
    .select('id, org_id, status, body, enabled, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}
