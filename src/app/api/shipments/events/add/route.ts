import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);

  const shipmentId = String(body?.shipmentId ?? '').trim();
  const status = String(body?.status ?? '').trim();
  const note = body?.note == null ? null : String(body.note).trim();

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 });

  const { data, error } = await supabase.rpc('add_shipment_event', {
    p_shipment_id: shipmentId,
    p_status: status,
    p_note: note,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  revalidatePath('/shipments');
  return NextResponse.json({ ok: true, updated: data?.[0] ?? null });
}
