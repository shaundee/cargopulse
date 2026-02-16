import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shipmentId = String(body?.shipmentId ?? '').trim();
  const templateId = String(body?.templateId ?? '').trim();

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!templateId) return NextResponse.json({ error: 'templateId is required' }, { status: 400 });

  // Load shipment + customer
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, tracking_code, destination, current_status, public_tracking_token, customers(name, phone)')
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

  // Load template
const { data: tpl, error: tplErr } = await supabase
  .from('message_templates')
  .select('id, org_id, status, body, enabled')
  .eq('id', templateId)
  .eq('org_id', shipment.org_id)
  .maybeSingle();


  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 400 });
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (!tpl.enabled) return NextResponse.json({ error: 'Template is disabled' }, { status: 400 });

 const customer = Array.isArray(shipment.customers)
  ? shipment.customers[0]
  : shipment.customers;

const customerName = customer?.name ?? '';
const customerPhone = customer?.phone ?? '';

const baseUrl = getBaseUrlFromHeaders(req.headers);
const trackingUrl =
  shipment.public_tracking_token && baseUrl
    ? `${baseUrl}/t/${shipment.public_tracking_token}`
    : '';

const rendered = renderTemplate(String(tpl.body ?? ''), {
  // preferred keys
  customer_name: customerName,
  tracking_code: shipment.tracking_code ?? '',
  destination: shipment.destination ?? '',
  status: String(tpl.status ?? ''),
  tracking_url: trackingUrl,

  // backwards-compat / seeded templates
  name: customerName,
  code: shipment.tracking_code ?? '',
});



  // For now: LOG ONLY (no WhatsApp provider yet)
  const toE164 = normalizeE164Phone(customerPhone);

  // Always log; send only if Twilio configured + phone is valid
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
      status: tpl.status ?? null, // <-- template status (not shipment status)
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

   // Delivered dedupe: treat 23505 as a safe "already done" and DO NOT send.
  if (logErr && (logErr as any).code === '23505') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'duplicate_delivered' });
  }
  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });

  if (!shouldSend) {
    return NextResponse.json({ ok: true, rendered, log_id: log.id, mode: 'logged_only', phone_ok: Boolean(toE164) });
  }

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

    return NextResponse.json({ ok: true, rendered, log_id: log.id, mode: 'sent', sid: result.sid, status: result.status });
  } catch (e: any) {
    await supabase
      .from('message_logs')
      .update({
        send_status: 'failed',
        error: e?.message ?? 'Send failed',
      })
      .eq('id', log.id);

    return NextResponse.json({ ok: false, error: e?.message ?? 'Send failed', log_id: log.id }, { status: 400 });
  }
}
