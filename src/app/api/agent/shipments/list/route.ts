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

  let query = supabase
    .from('shipments')
    .select(`
  id, org_id, tracking_code, destination, service_type, current_status, last_event_at, public_tracking_token,
  customer:customers(name, phone)
`)
    .eq('org_id', member.org_id)
    .order('last_event_at', { ascending: false })
    .limit(200);

  if (q) query = query.ilike('tracking_code', `%${q}%`);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const shipments = (data ?? []).map((s: any) => {
    const c = Array.isArray(s.customers) ? s.customers[0] : s.customers;
    return {
      id: s.id,
      tracking_code: s.tracking_code,
      destination: s.destination ?? null,
      current_status: s.current_status,
      last_event_at: s.last_event_at ?? null,
      public_tracking_token: s.public_tracking_token ?? null,
      customer_name: c?.name ?? null,
      customer_phone: c?.phone ?? null,
    };
  });

  return NextResponse.json({ shipments });
}
