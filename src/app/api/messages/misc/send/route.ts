import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

export async function POST(req: Request) {
      const blocked = await blockIfAgentMode();
      if (blocked) return blocked;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shipmentId = String(body?.shipmentId ?? '').trim();
  const key = String(body?.key ?? '').trim(); // 'tracking_link' | 'nudge'

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 });

  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, tracking_code, destination, public_tracking_token, customers(name, phone, phone_e164, country_code)')
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

  const { data: tpl, error: tplErr } = await supabase
    .from('message_templates_misc')
    .select('id, org_id, key, body, enabled')
    .eq('org_id', shipment.org_id)
    .eq('key', key)
    .maybeSingle();

  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 400 });
  if (!tpl) return NextResponse.json({ error: `Missing misc template: ${key}` }, { status: 400 });
  if (!tpl.enabled) return NextResponse.json({ error: 'Template is disabled' }, { status: 400 });

  const customer = Array.isArray((shipment as any).customers)
    ? (shipment as any).customers[0]
    : (shipment as any).customers;

  const customerName = String(customer?.name ?? '').trim();
  const customerPhoneRaw = String(customer?.phone_e164 ?? customer?.phone ?? '').trim();
  const defaultCountry = String(customer?.country_code ?? 'GB').toUpperCase();

  const toE164 =
    customerPhoneRaw.startsWith('+')
      ? customerPhoneRaw
      : normalizeE164Phone(customerPhoneRaw, { defaultCountry: defaultCountry as any });

  // ✅ HARD BLOCK: invalid/missing phone should NOT "log success"
  if (!toE164) {
    return NextResponse.json(
      { error: 'Customer phone is missing/invalid. Fix the phone number (E.164) before sending.' },
      { status: 400 }
    );
  }

  const baseUrl = getBaseUrlFromHeaders(req.headers);
  const trackingUrl =
    shipment.public_tracking_token && baseUrl ? `${baseUrl}/t/${shipment.public_tracking_token}` : '';

  const rendered = renderTemplate(String(tpl.body ?? ''), {
    customer_name: customerName,
    name: customerName,
    tracking_code: shipment.tracking_code ?? '',
    code: shipment.tracking_code ?? '',
    destination: shipment.destination ?? '',
    tracking_url: trackingUrl,
  });

  const twilioReady = isTwilioConfigured();
  const shouldSend = twilioReady;

  const provider = shouldSend ? 'twilio_whatsapp' : 'log';
  const initialSendStatus = shouldSend ? 'queued' : 'logged';

  const { data: log, error: logErr } = await supabase
    .from('message_logs')
    .insert({
      org_id: shipment.org_id,
      shipment_id: shipment.id,
      to_phone: toE164, // ✅ canonical
      provider,
      send_status: initialSendStatus,
      body: rendered,
      status: key, // label in logs + for Last Message
      direction: 'outbound',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });

  // ✅ Update “Last Message” fields immediately after logging
  await supabase
    .from('shipments')
    .update({
      last_outbound_message_at: new Date().toISOString(),
      last_outbound_message_status: key,
      last_outbound_send_status: initialSendStatus,
      last_outbound_preview: String(rendered ?? '').slice(0, 140),
    })
    .eq('id', shipment.id);

  if (!shouldSend) {
    return NextResponse.json({ ok: true, mode: 'logged_only', rendered, log_id: log.id });
  }

  try {
    const result = await twilioSendWhatsApp({ toE164, body: rendered });

    await supabase
      .from('message_logs')
      .update({
        provider_message_id: result.sid,
        send_status: result.status,
        error: null,
        sent_at: new Date().toISOString(),
      })
      .eq('id', log.id);

    await supabase
      .from('shipments')
      .update({ last_outbound_send_status: String(result.status ?? 'queued') })
      .eq('id', shipment.id);

    return NextResponse.json({ ok: true, mode: 'sent', rendered, sid: result.sid, status: result.status });
  } catch (e: any) {
    await supabase
      .from('message_logs')
      .update({ send_status: 'failed', error: e?.message ?? 'Send failed' })
      .eq('id', log.id);

    await supabase
      .from('shipments')
      .update({ last_outbound_send_status: 'failed' })
      .eq('id', shipment.id);

    return NextResponse.json({ ok: false, error: e?.message ?? 'Send failed', log_id: log.id }, { status: 400 });
  }
}
export async function GET() {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;
  return new Response('ok', { status: 200 });
}