import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();

  const { data: member, error: memberErr } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 400 });
  if (!member?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 403 });

  const role = (member.role ?? 'admin') as 'admin' | 'staff' | 'field' | 'agent';
  const allowAgent = role === 'admin' || role === 'staff' || role === 'agent';
  if (!allowAgent) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // --- destination scope for agents ---
  let allowedDestinationNames: string[] | null = null;

  if (role === 'agent') {
    const { data: scopes, error: scErr } = await supabase
      .from('org_agent_scopes')
      .select('destination_id')
      .eq('org_id', member.org_id)
      .eq('user_id', user.id);

    if (scErr) return NextResponse.json({ error: scErr.message }, { status: 400 });

    const ids = (scopes ?? []).map((s: any) => s.destination_id).filter(Boolean);
    if (!ids.length) return NextResponse.json({ shipments: [] });

    const { data: dests, error: dErr } = await supabase
      .from('org_destinations')
      .select('id, name')
      .eq('org_id', member.org_id)
      .in('id', ids);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    allowedDestinationNames = (dests ?? []).map((d: any) => String(d.name)).filter(Boolean);
    if (!allowedDestinationNames.length) return NextResponse.json({ shipments: [] });
  }

  // --- base query ---
  let queryBuilder = supabase
    .from('shipments')
    .select(
      `
        id,
        org_id,
        tracking_code,
        destination,
        service_type,
        current_status,
        last_event_at,
        public_tracking_token,
        customer:customers(name, phone, phone_e164)
      `
    )
    .eq('org_id', member.org_id)
    .order('last_event_at', { ascending: false })
    .limit(200);

  // Search (tracking only for now)
  if (q) queryBuilder = queryBuilder.ilike('tracking_code', `%${q}%`);

  // ✅ IMPORTANT: destination scope must be case-insensitive (your data has Jamaica + JAMAICA)
  if (allowedDestinationNames) {
    if (allowedDestinationNames.length === 1) {
      // ilike with no % = exact match but case-insensitive
      queryBuilder = queryBuilder.ilike('destination', allowedDestinationNames[0]);
    } else {
      // OR over multiple exact patterns (case-insensitive)
      const orExpr = allowedDestinationNames.map((n) => `destination.ilike.${n}`).join(',');
      queryBuilder = queryBuilder.or(orExpr);
    }
  }

  const { data, error } = await queryBuilder;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const shipments = (data ?? []).map((s: any) => {
    const c = Array.isArray(s.customer) ? s.customer[0] : s.customer;
    return {
      id: s.id,
      tracking_code: s.tracking_code,
      destination: s.destination ?? null,
      current_status: s.current_status,
      last_event_at: s.last_event_at ?? null,
      public_tracking_token: s.public_tracking_token ?? null,
      customer_name: c?.name ?? null,
      customer_phone: c?.phone_e164 ?? c?.phone ?? null,
    };
  });

  return NextResponse.json({ shipments });
}