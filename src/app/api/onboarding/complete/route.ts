import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const defaults = [
  { status: 'received', body: 'Hi {{name}}, we received your shipment ({{code}}) at our UK depot.' },
  { status: 'loaded', body: 'Update: shipment {{code}} has been loaded and is preparing to depart.' },
  { status: 'departed_uk', body: 'Update: shipment {{code}} has departed the UK.' },
  { status: 'arrived_jamaica', body: 'Update: shipment {{code}} has arrived in Jamaica.' },
  { status: 'out_for_delivery', body: 'Update: shipment {{code}} is out for delivery.' },
  { status: 'delivered', body: 'Delivered: shipment {{code}} has been delivered. Thank you.' },
];

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const orgName = body?.orgName;

  if (!orgName || String(orgName).trim().length < 2) {
    return NextResponse.json({ error: 'Organization name too short' }, { status: 400 });
  }

  // 1) Create org + membership (uses your SECURITY DEFINER function)
  const { data: orgId, error: orgErr } = await supabase.rpc('create_org_for_user', {
    p_org_name: String(orgName).trim(),
  });

  if (orgErr) return NextResponse.json({ error: orgErr.message }, { status: 400 });
  if (!orgId) return NextResponse.json({ error: 'Org creation failed' }, { status: 400 });

  // 2) Seed templates directly using orgId returned (no membership read needed)
  const inserts = defaults.map((d) => ({
    org_id: orgId,
    status: d.status,
    body: d.body,
    enabled: true,
  }));

  const { error: tplErr } = await supabase
    .from('message_templates')
    .upsert(inserts, { onConflict: 'org_id,status' });

  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, orgId });
}
