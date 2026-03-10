import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPlanTier, isBillingActive, PLAN_LIMITS, getDisplayPlanTier } from '@/lib/billing/plan';
import { DashboardClient, type AttentionItem } from './dashboard-client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sinceIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const word = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `${word}, ${name}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Membership (needed for org_id and role before anything else)
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) redirect('/onboarding');

  const orgId = membership.org_id as string;
  const isAdmin = membership.role === 'admin';
  const since30 = sinceIso(30);
  const since5  = sinceIso(5);
  const since3  = sinceIso(3);

  // ── Main parallel fetch ────────────────────────────────────────────────────
  const overdueThreshold = new Date(Date.now() - 3 * 86400000).toISOString();

  const [
    orgQ,
    billingQ,
    active30Q,
    inTransitQ,
    delivered30Q,
    messages30Q,
    staleQ,
    deliveredNoPodCandidatesQ,
    noMsgCountQ,
    recentQ,
    destQ,
    opsPendingCollQ,
    opsInTransitQ,
    opsArrivedQ,
    opsAwaitingQ,
    opsOverdueQ,
  ] = await Promise.all([
    // 1. Org name
    supabase
      .from('organizations')
      .select('name')
      .eq('id', orgId)
      .single(),

    // 2. Billing row
    supabase
      .from('organization_billing')
      .select('status, plan_tier, shipment_count')
      .eq('org_id', orgId)
      .maybeSingle(),

    // 3. Stat: shipments created this month
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', since30),

    // 4. Stat: in-transit right now
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('current_status', ['loaded', 'departed_uk', 'arrived_destination', 'out_for_delivery']),

    // 5. Stat: POD-confirmed deliveries this month
    supabase
      .from('pod')
      .select('shipment_id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('delivered_at', since30),

    // 6. Stat: messages sent this month
    supabase
      .from('message_logs')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('sent_at', since30),

    // 7. Attention: stale in-transit shipments (no update in 3+ days)
    supabase
      .from('shipments')
      .select('id, tracking_code, current_status, destination, last_event_at')
      .eq('org_id', orgId)
      .not('current_status', 'in', '(delivered,collected_by_customer)')
      .lt('last_event_at', since3)
      .order('last_event_at', { ascending: true })
      .limit(3),

    // 8. Attention: delivered shipments — we'll cross-check against POD next
    supabase
      .from('shipments')
      .select('id, tracking_code')
      .eq('org_id', orgId)
      .in('current_status', ['delivered', 'collected_by_customer'])
      .order('last_event_at', { ascending: false })
      .limit(20),

    // 9. Attention: count of in-transit shipments with no message in 5+ days
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('current_status', ['loaded', 'departed_uk', 'arrived_destination', 'out_for_delivery'])
      .or(`last_outbound_message_at.is.null,last_outbound_message_at.lt.${since5}`),

    // 10. Recent shipments (with customer name)
    supabase
      .from('shipments')
      .select('id, tracking_code, destination, current_status, last_event_at, customers(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .limit(5),

    // 11. Active shipment destinations (for bar chart)
    supabase
      .from('shipments')
      .select('destination')
      .eq('org_id', orgId)
      .not('current_status', 'in', '(delivered,collected_by_customer)'),

    // 12–16. Ops summary metrics
    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('service_type', 'door_to_door')
      .eq('current_status', 'received'),

    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('current_status', 'departed_uk'),

    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('current_status', ['arrived_destination', 'customs_processing']),

    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('current_status', ['awaiting_collection', 'out_for_delivery']),

    supabase
      .from('shipments')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('service_type', 'door_to_door')
      .eq('current_status', 'received')
      .lt('created_at', overdueThreshold),
  ]);

  // ── No-POD cross-check ────────────────────────────────────────────────────
  // Fetch existing pod records for the delivered candidate IDs
  const deliveredIds = (deliveredNoPodCandidatesQ.data ?? []).map(s => s.id);
  const podSetQ = deliveredIds.length > 0
    ? await supabase.from('pod').select('shipment_id').in('shipment_id', deliveredIds)
    : { data: [] };

  const withPod = new Set((podSetQ.data ?? []).map(p => p.shipment_id));
  const noPodShipments = (deliveredNoPodCandidatesQ.data ?? [])
    .filter(s => !withPod.has(s.id))
    .slice(0, 2);

  // ── Assemble result data ──────────────────────────────────────────────────

  const orgName = orgQ.data?.name ?? 'your org';
  const firstName =
    (user.user_metadata?.full_name as string | undefined)?.split(' ')[0]
    ?? user.email?.split('@')[0]
    ?? 'there';

  const billingRow = billingQ.data;
 const tier = getDisplayPlanTier(billingRow);
  const rawLimit = PLAN_LIMITS[tier].shipments;
  const billing = {
    tier,
    shipmentCount: billingRow?.shipment_count ?? 0,
    shipmentLimit: rawLimit === Infinity ? null : rawLimit,
    isActive: isBillingActive(billingRow),
  };

  const stats = {
    active30:    active30Q.count    ?? 0,
    inTransit:   inTransitQ.count   ?? 0,
    delivered30: delivered30Q.count ?? 0,
    messages30:  messages30Q.count  ?? 0,
  };

  // Build attention items: stale → no-message → no-POD
  const attentionItems: AttentionItem[] = [];

  for (const s of staleQ.data ?? []) {
    attentionItems.push({
      type: 'stale',
      id: s.id,
      trackingCode: s.tracking_code,
      status: s.current_status as string,
      destination: s.destination,
      daysStale: Math.floor((Date.now() - new Date(s.last_event_at).getTime()) / 86400000),
    });
  }

  const noMsgCount = noMsgCountQ.count ?? 0;
  if (noMsgCount > 0) {
    attentionItems.push({ type: 'no_message', count: noMsgCount });
  }

  for (const s of noPodShipments) {
    attentionItems.push({ type: 'no_pod', id: s.id, trackingCode: s.tracking_code });
  }

  // Recent shipments — customers is many-to-one so PostgREST returns object | null
  const recentShipments = (recentQ.data ?? []).map(s => {
    // Supabase types the FK join as an array; at runtime it's object|null for many-to-one
    const raw = s.customers as unknown;
    const c = Array.isArray(raw) ? (raw[0] as { name: string } | undefined) ?? null : raw as { name: string } | null;
    return {
      id: s.id,
      tracking_code: s.tracking_code,
      destination: s.destination,
      current_status: s.current_status as string,
      last_event_at: s.last_event_at,
      customerName: c?.name ?? null,
    };
  });

  const opsSummary = {
    pending_collection: opsPendingCollQ.count ?? 0,
    in_transit: opsInTransitQ.count ?? 0,
    arrived_not_cleared: opsArrivedQ.count ?? 0,
    awaiting_delivery: opsAwaitingQ.count ?? 0,
    overdue_collection: opsOverdueQ.count ?? 0,
  };

  // Destination bar chart — group active shipments by destination, top 5
  const destCounts: Record<string, number> = {};
  for (const s of destQ.data ?? []) {
    destCounts[s.destination] = (destCounts[s.destination] ?? 0) + 1;
  }
  const byDestination = Object.entries(destCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([destination, count]) => ({ destination, count }));

  return (
    <DashboardClient
      greeting={getGreeting(firstName)}
      orgName={orgName}
      stats={stats}
      billing={billing}
      attentionItems={attentionItems}
      recentShipments={recentShipments}
      byDestination={byDestination}
      isAdmin={isAdmin}
      opsSummary={opsSummary}
    />
  );
}
