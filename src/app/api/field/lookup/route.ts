import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

export async function GET(req: Request) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const code = url.searchParams.get('code')?.trim().toUpperCase() ?? '';
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });

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

  const { data: shipment, error } = await supabase
    .from('shipments')
    .select('id, tracking_code, destination, service_type, cargo_type, cargo_meta, customers(name)')
    .eq('org_id', orgId)
    .ilike('tracking_code', code)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ found: false });

  return NextResponse.json({
    found: true,
    shipmentId: shipment.id,
    trackingCode: shipment.tracking_code,
    customerName: (shipment as any).customers?.name ?? '',
    destination: (shipment as any).destination ?? '',
    serviceType: (shipment as any).service_type ?? 'depot',
    cargoType: (shipment as any).cargo_type ?? 'general',
    cargoMeta: (shipment as any).cargo_meta ?? {},
  });
}
