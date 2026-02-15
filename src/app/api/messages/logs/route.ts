import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const shipmentId = url.searchParams.get('shipment_id')?.trim();

  if (!shipmentId) {
    return NextResponse.json({ error: 'shipment_id is required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('message_logs')
    .select('id, created_at, direction, from_phone, to_phone, provider, send_status, error, status, body, template_id, media')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ logs: data ?? [] });
}
