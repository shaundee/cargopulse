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

  const overdueThreshold = new Date(Date.now() - 3 * 86400000).toISOString();

  const [pendingCollQ, inTransitQ, arrivedQ, awaitingQ, overdueQ] = await Promise.all([
    // pending_collection: door_to_door AND received
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('service_type', 'door_to_door')
      .eq('current_status', 'received'),

    // in_transit: departed_uk
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('current_status', 'departed_uk'),

    // arrived_not_cleared: arrived_destination OR customs_processing
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('current_status', ['arrived_destination', 'customs_processing']),

    // awaiting_delivery: awaiting_collection OR out_for_delivery
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('current_status', ['awaiting_collection', 'out_for_delivery']),

    // overdue_collection: door_to_door AND received AND created_at < now()-3 days
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('service_type', 'door_to_door')
      .eq('current_status', 'received')
      .lt('created_at', overdueThreshold),
  ]);

  return NextResponse.json({
    pending_collection: pendingCollQ.count ?? 0,
    in_transit: inTransitQ.count ?? 0,
    arrived_not_cleared: arrivedQ.count ?? 0,
    awaiting_delivery: awaitingQ.count ?? 0,
    overdue_collection: overdueQ.count ?? 0,
  });
}
