import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

export async function GET() {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id)
    return NextResponse.json({ error: 'No organization membership' }, { status: 400 });
  const orgId = membership.org_id as string;

  const { data, error } = await supabase
    .from('shipments')
    .select('id, tracking_code, cargo_type, cargo_meta, created_at, customers(name)')
    .eq('org_id', orgId)
    .eq('service_type', 'door_to_door')
    .eq('current_status', 'received')
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(data ?? []);
}
