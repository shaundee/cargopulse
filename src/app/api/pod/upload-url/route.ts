import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shipmentId = String(body?.shipmentId ?? '').trim();
  const fileExt = String(body?.fileExt ?? '').trim().toLowerCase();

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!fileExt) return NextResponse.json({ error: 'fileExt is required' }, { status: 400 });

  // get org_id from membership
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });

  const orgId = membership.org_id as string;

  // path: org/<orgId>/shipments/<shipmentId>/<timestamp>.<ext>
  const filePath = `org/${orgId}/shipments/${shipmentId}/${Date.now()}.${fileExt}`;

  // create signed upload url (valid for 60s)
  const { data, error } = await supabase.storage
    .from('pod')
    .createSignedUploadUrl(filePath);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    path: filePath,
    token: data.token,
  });
}
