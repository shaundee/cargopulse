import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
   import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';
function digitsOnly(s: string) {
  return String(s || '').replace(/[^0-9]/g, '');
}

export async function GET(req: Request) {
 
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  // ...rest of your existing code

  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const qRaw = String(url.searchParams.get('q') ?? '').trim();
  const q = qRaw.slice(0, 80); // safety
  const status = String(url.searchParams.get('status') ?? 'all');
  const destination = String(url.searchParams.get('destination') ?? 'all');
  const service = String(url.searchParams.get('service') ?? 'all');
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 200), 1), 500);

  // org
  const { data: mem, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!mem?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 400 });

  const orgId = mem.org_id;

  // ---- Search: find matching customers first (so we can search by phone/name reliably)
  let customerIds: string[] = [];
  if (q) {
    const qDigits = digitsOnly(q);
    const ukE164FromLocal = qDigits.startsWith('0') ? `+44${qDigits.slice(1)}` : null;

    const orParts: string[] = [
      `name.ilike.%${q}%`,
      `phone.ilike.%${q}%`,
      `phone_e164.ilike.%${q}%`,
    ];

    if (qDigits.length >= 4) {
      orParts.push(`phone.ilike.%${qDigits}%`);
      orParts.push(`phone_e164.ilike.%${qDigits}%`);
      if (ukE164FromLocal) orParts.push(`phone_e164.ilike.%${ukE164FromLocal}%`);
    }

    const { data: custRows } = await supabase
      .from('customers')
      .select('id')
      .eq('org_id', orgId)
      .or(orParts.join(','))
      .limit(2000);

    customerIds = (custRows ?? []).map((r: any) => r.id);
  }

  // ---- Shipments query
  let shipQ = supabase
    .from('shipments')
    .select(
      [
        'id',
        'tracking_code',
        'destination',
        'service_type',
        'current_status',
        'last_event_at',
        'created_at',
        'public_tracking_token',
        'internal_notes',
        'reference_no',
        'last_outbound_message_at',
        'last_outbound_message_status',
        'last_outbound_send_status',
        'last_outbound_preview',
        'customers(name, phone, phone_e164)',
      ].join(',')
    )
    .eq('org_id', orgId)
    .order('last_event_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') shipQ = shipQ.eq('current_status', status);
  if (destination !== 'all') shipQ = shipQ.eq('destination', destination);
  if (service !== 'all') shipQ = shipQ.eq('service_type', service);

  if (q) {
    const orParts: string[] = [
      `tracking_code.ilike.%${q}%`,
      `destination.ilike.%${q}%`,
      `internal_notes.ilike.%${q}%`,
      `reference_no.ilike.%${q}%`,
    ];

    // customer_id match as OR
    if (customerIds.length) {
      // PostgREST: in.(id1,id2,...)
      orParts.push(`customer_id.in.(${customerIds.join(',')})`);
    }

    shipQ = shipQ.or(orParts.join(','));
  }

  const { data: shipments, error: shipErr } = await shipQ;
  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });

  const ids = (shipments ?? []).map((s: any) => s.id);
  if (!ids.length) return NextResponse.json({ ok: true, shipments: [] });

  // ---- Proof flags (POD + pickup assets) in 2 cheap batch queries
  const { data: podRows } = await supabase
    .from('pod')
    .select('shipment_id')
    .eq('org_id', orgId)
    .in('shipment_id', ids);

  const { data: assetRows } = await supabase
    .from('shipment_assets')
    .select('shipment_id')
    .eq('org_id', orgId)
    .in('shipment_id', ids);

  const podSet = new Set((podRows ?? []).map((r: any) => r.shipment_id));
  const assetSet = new Set((assetRows ?? []).map((r: any) => r.shipment_id));

  const enriched = (shipments ?? []).map((s: any) => ({
    ...s,
    has_pod: podSet.has(s.id),
    has_pickup_assets: assetSet.has(s.id),
  }));

  return NextResponse.json({ ok: true, shipments: enriched });
}