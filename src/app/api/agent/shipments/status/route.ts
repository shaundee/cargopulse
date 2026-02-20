import { NextResponse } from 'next/server';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { renderTemplate } from '@/lib/messaging/render-template';


export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shipmentId = String(body?.shipmentId ?? '').trim();
  const status = String(body?.status ?? '').trim();

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });

 const allowed = new Set(['arrived_destination', 'collected_by_customer', 'out_for_delivery']);

  if (!allowed.has(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

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

  // Load shipment + customer (org-scoped)
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, tracking_code, public_tracking_token, destination, current_status, customers(name, phone)')
    .eq('id', shipmentId)
    .eq('org_id', member.org_id)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

  const baseUrl = getBaseUrlFromHeaders(req.headers);
  const token = (shipment as any).public_tracking_token as string | null;
  const trackingUrl = token && baseUrl ? `${baseUrl}/t/${token}` : '';

  if (shipment.current_status === 'delivered') {
    return NextResponse.json({ error: 'Delivered is terminal' }, { status: 409 });
  }

  // 1) Insert shipment_event
  const note =
    status === 'arrived_destination'
      ? 'Arrived at destination'
      : status === 'collected_by_customer'
        ? 'Collected by customer'
        : '';

  const { error: evErr } = await supabase.from('shipment_events').insert({
    org_id: shipment.org_id,
    shipment_id: shipment.id,
    status,
    note,
  });

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 400 });

  // 2) Update shipment status
  const { error: upErr } = await supabase
    .from('shipments')
    .update({ current_status: status, last_event_at: new Date().toISOString() })
    .eq('id', shipment.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // 3) Auto WhatsApp (if template exists + enabled)
  const { data: tpl } = await supabase
    .from('message_templates')
    .select('id, body, enabled, status')
    .eq('org_id', shipment.org_id)
    .eq('status', status)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  const customer = Array.isArray((shipment as any).customers) ? (shipment as any).customers[0] : (shipment as any).customers;
  const customerName = customer?.name ?? '';
  const customerPhone = customer?.phone ?? '';

  if (tpl?.id && tpl.enabled) {
    const rendered = renderTemplate(String(tpl.body ?? ''), {
      customer_name: customerName,
      tracking_code: shipment.tracking_code ?? '',
      destination: shipment.destination ?? '',
      status: String(tpl.status ?? status),
      tracking_url: trackingUrl,

      // backwards-compat vars
      name: customerName,
      code: shipment.tracking_code ?? '',
    });

    const toE164 = normalizeE164Phone(customerPhone);
    const shouldSend = isTwilioConfigured() && Boolean(toE164);

    const provider = shouldSend ? 'twilio_whatsapp' : 'log';
    const initialSendStatus = shouldSend ? 'queued' : 'logged';

    const { data: log, error: logErr } = await supabase
      .from('message_logs')
      .insert({
        org_id: shipment.org_id,
        shipment_id: shipment.id,
        template_id: tpl.id,
        to_phone: customerPhone,
        provider,
        send_status: initialSendStatus,
        body: rendered,
        status: tpl.status ?? null,
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    // ignore logging failure but don’t block status update
    if (!logErr && shouldSend) {
      try {
        const result = await twilioSendWhatsApp({ toE164: toE164!, body: rendered });

        await supabase
          .from('message_logs')
          .update({
            provider_message_id: result.sid,
            send_status: result.status,
            error: null,
            sent_at: new Date().toISOString(),
          })
          .eq('id', log.id);
      } catch (e: any) {
        await supabase
          .from('message_logs')
          .update({
            send_status: 'failed',
            error: e?.message ?? 'Send failed',
          })
          .eq('id', log.id);
      }
    }
  }

  return NextResponse.json({ ok: true });
}


