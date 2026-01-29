import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('message_templates')
    .select('id, org_id, status, body, enabled, created_at')
    .order('status', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const input = await req.json().catch(() => null);

  const status = String(input?.status ?? '').trim();
  const body = String(input?.body ?? '').trim();
  const enabled = input?.enabled === false ? false : true;

  if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 });
  if (!body) return NextResponse.json({ error: 'body is required' }, { status: 400 });

  // Get user's org_id (same pattern as other endpoints)
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });

  const orgId = membership.org_id as string;

  // Your schema is unique(org_id, status) so we upsert by that constraint
  const { data, error } = await supabase
    .from('message_templates')
    .upsert(
      { org_id: orgId, status, body, enabled },
      { onConflict: 'org_id,status' }
    )
    .select('id, org_id, status, body, enabled, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ template: data });
}
