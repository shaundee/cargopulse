import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

function isDelivered(status: unknown) {
  return String(status ?? '').toLowerCase() === 'delivered';
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });

  const shipmentId = String(form.get('shipmentId') ?? '').trim();
  const receiverName = String(form.get('receiverName') ?? '').trim();
  const file = form.get('file');

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!receiverName) return NextResponse.json({ error: 'receiverName is required' }, { status: 400 });
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  // org_id from membership
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });
  const orgId = membership.org_id as string;

  // Shipment must exist + belong to org
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, customer_id, tracking_code, destination, current_status')
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  if (shipment.org_id !== orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const alreadyDelivered = isDelivered(shipment.current_status);

  // Determine storage path
  const contentType = (file as any).type || 'image/jpeg';
  const ext =
    contentType.includes('png') ? 'png' :
    contentType.includes('webp') ? 'webp' :
    (contentType.includes('jpeg') || contentType.includes('jpg')) ? 'jpg' :
    'jpg';

  const deliveredAt = new Date().toISOString();
  const path = `org/${orgId}/shipments/${shipmentId}/${Date.now()}.${ext}`;

  // Upload photo
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from('pod')
    .upload(path, bytes, { contentType, upsert: true });

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // Upsert POD record (always, even Replace POD)
  const { error: podErr } = await supabase
    .from('pod')
    .upsert({
      shipment_id: shipmentId,
      org_id: orgId,
      photo_url: path,
      receiver_name: receiverName,
      delivered_at: deliveredAt,
    });

  if (podErr) return NextResponse.json({ error: podErr.message }, { status: 400 });

  // Only first-time delivery: create delivered event + set shipment delivered
  if (!alreadyDelivered) {
    const { error: evErr } = await supabase.from('shipment_events').insert({
      shipment_id: shipmentId,
      org_id: orgId,
      status: 'delivered',
      note: `POD captured (${receiverName})`,
      occurred_at: deliveredAt,
    });
    if (evErr) return NextResponse.json({ error: evErr.message }, { status: 400 });

    const { error: sErr } = await supabase
      .from('shipments')
      .update({ current_status: 'delivered', last_event_at: deliveredAt })
      .eq('id', shipmentId);

    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });

// Best-effort auto-log delivered message ONCE
try {
  const { data: tpl, error: tplErr } = await supabase
    .from('message_templates')
    .select('id, body, enabled')
    .eq('org_id', orgId)
    .eq('status', 'delivered')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  if (tplErr) {
    console.warn('[pod/complete] template lookup failed', tplErr.message);
  } else if (!tpl?.id) {
    console.warn('[pod/complete] no enabled delivered template found for org', orgId);
  } else {
    // customer phone is required (DB constraint)
    let customerName = '';
    let customerPhone: string | null = null;

    if (shipment.customer_id) {
      const { data: cust, error: custErr } = await supabase
        .from('customers')
        .select('name, phone')
        .eq('id', shipment.customer_id)
        .maybeSingle();

      if (custErr) console.warn('[pod/complete] customer lookup failed', custErr.message);

      customerName = cust?.name ?? '';
      customerPhone = (cust?.phone ?? '').trim() || null;
    }

    if (!customerPhone) {
      console.warn('[pod/complete] skipping auto-log: customer phone missing', { shipmentId });
    } else {
      const rendered = renderTemplate(String(tpl.body ?? ''), {
        customer_name: customerName,
        tracking_code: shipment.tracking_code ?? '',
        destination: shipment.destination ?? '',
        status: 'delivered',
        // backwards compat
        name: customerName,
        code: shipment.tracking_code ?? '',
      });

      const { error: insErr } = await supabase.from('message_logs').insert({
        org_id: orgId,
        shipment_id: shipmentId,
        template_id: tpl.id,
        to_phone: customerPhone,
        provider: 'log',
        send_status: 'logged',
        body: rendered,
        status: 'delivered',
        sent_at: new Date().toISOString(),
        error: null,
      });

      // 23505 = unique violation -> already logged -> ignore
      if (insErr && (insErr as any).code !== '23505') {
        console.warn('[pod/complete] auto-log insert failed', insErr);
      }
    }
  }
} catch (e: any) {
  console.error('[pod/complete] auto-log crashed', e?.message ?? e);
}

  }

  return NextResponse.json({ ok: true, path });
}
