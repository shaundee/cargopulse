import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const shipmentId = url.searchParams.get('shipmentId');
  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });

  const { data: member, error: memberErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 400 });
  if (!member?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 403 });

  const { data: assets, error: aErr } = await supabase
    .from('shipment_assets')
    .select('id, kind, path, created_at')
    .eq('org_id', member.org_id)
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: true });

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 });

  const paths = (assets ?? []).map((a) => a.path).filter(Boolean);
  const signed: Record<string, string> = {};

  if (paths.length) {
    const { data: signedRows, error: sErr } = await supabase.storage
      .from('assets')
      .createSignedUrls(paths, 60 * 10);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

    for (const r of signedRows ?? []) {
      if (r?.path && r?.signedUrl) signed[r.path] = r.signedUrl;
    }
  }

  return NextResponse.json({
    assets: (assets ?? []).map((a) => ({
      ...a,
      url: a.path ? signed[a.path] ?? null : null,
    })),
  });
}
