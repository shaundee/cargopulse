import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

export async function GET() {
      const blocked = await blockIfAgentMode();
      if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: mem, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!mem?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 400 });

  const { data, error } = await supabase
    .from('org_destinations')
    .select('id, name, active, sort_order')
    .eq('org_id', mem.org_id)
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, destinations: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const rawName = String(body?.name ?? '').trim();
  if (rawName.length < 2) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  // Normalize to title case: "JAMAICA" → "Jamaica", "st lucia" → "St Lucia"
  const name = rawName
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const { data: mem, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!mem?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 400 });

  const { data, error } = await supabase
    .from('org_destinations')
    .insert({ org_id: mem.org_id, name, active: true, sort_order: 10 })
    .select('id, name')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, destination: data });
}