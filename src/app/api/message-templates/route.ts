import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('message_templates')
    .select('id, status, name, body, enabled, created_at, updated_at')
    .order('status', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const status = String(body?.status ?? '').trim();
  const name = String(body?.name ?? '').trim();
  const templateBody = String(body?.body ?? '').trim();
  const enabled = body?.enabled === false ? false : true;

  if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (!templateBody) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  const { data, error } = await supabase
    .from('message_templates')
    .insert({ status, name, body: templateBody, enabled })
    .select('id, status, name, body, enabled, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}
