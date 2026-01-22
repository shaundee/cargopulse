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

export async function POST() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });

  // Upsert templates for this org
  const inserts = defaults.map((d) => ({ org_id: membership.org_id, status: d.status, body: d.body, enabled: true }));

  const { error } = await supabase
    .from('message_templates')
    .upsert(inserts, { onConflict: 'org_id,status' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
