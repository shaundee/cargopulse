import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

export async function GET(req: Request) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const shipmentId = url.searchParams.get('shipment_id');
  if (!shipmentId) return NextResponse.json({ error: 'shipment_id is required' }, { status: 400 });

  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select(`
  id, org_id, tracking_code, destination, current_status, service_type, last_event_at,
  public_tracking_token, cargo_type, cargo_meta,
  customers(name, phone),
  pod:pod(shipment_id, receiver_name, photo_url, delivered_at)
`)
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: events, error: evtErr } = await supabase
    .from('shipment_events')
    .select('id, status, note, occurred_at, created_by')
    .eq('shipment_id', shipmentId)
    .order('occurred_at', { ascending: false })
    .limit(200);

  if (evtErr) return NextResponse.json({ error: evtErr.message }, { status: 400 });

  // Resolve actor display names from created_by UUIDs.
  // Staff/admin: org_members role label. Agents: name from org_agent_invites.
  const actorIds = [...new Set((events ?? []).map((e: any) => e.created_by).filter(Boolean))];
  const actorMap: Record<string, string> = {};

  if (actorIds.length) {
    const orgId = (shipment as any).org_id;

    const [{ data: members }, { data: invites }] = await Promise.all([
      supabase
        .from('org_members')
        .select('user_id, role')
        .eq('org_id', orgId)
        .in('user_id', actorIds),
      supabase
        .from('org_agent_invites')
        .select('accepted_user_id, agent_name')
        .eq('org_id', orgId)
        .in('accepted_user_id', actorIds),
    ]);

    (members ?? []).forEach((m: any) => {
      actorMap[m.user_id] =
        m.role === 'admin' ? 'Admin' :
        m.role === 'agent' ? 'Agent' :
        m.role === 'field' ? 'Field' :
        'Staff';
    });

    // Agent name from invite overrides the generic label if available
    (invites ?? []).forEach((inv: any) => {
      if (inv.accepted_user_id && inv.agent_name) {
        actorMap[inv.accepted_user_id] = inv.agent_name;
      }
    });
  }

  const enrichedEvents = (events ?? []).map((e: any) => ({
    ...e,
    actor_label: e.created_by ? (actorMap[e.created_by] ?? 'System') : null,
  }));

  return NextResponse.json({ shipment, events: enrichedEvents });
}