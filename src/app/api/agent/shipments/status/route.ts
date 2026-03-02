import { NextResponse } from 'next/server';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { renderTemplate } from '@/lib/messaging/render-template';

function normDest(s: unknown) {
  return String(s ?? '').trim().toLowerCase();
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shipmentId = String(body?.shipmentId ?? '').trim();
  const newStatus = String(body?.status ?? '').trim();

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!newStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 });

  const allowed = new Set(['arrived_destination', 'collected_by_customer', 'out_for_delivery']);
  if (!allowed.has(newStatus)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  // membership
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

  // destination scopes for agent (case-insensitive matching)
  let allowedDestSet: Set<string> | null = null;

  if (role === 'agent') {
    const { data: scopes, error: scErr } = await supabase
      .from('org_agent_scopes')
      .select('destination_id')
      .eq('org_id', member.org_id)
      .eq('user_id', user.id);

    if (scErr) return NextResponse.json({ error: scErr.message }, { status: 400 });

    const ids = (scopes ?? []).map((s: any) => s.destination_id).filter(Boolean);
    if (!ids.length) {
      return NextResponse.json({ error: 'Forbidden (no destination scope)' }, { status: 403 });
    }

    const { data: dests, error: dErr } = await supabase
      .from('org_destinations')
      .select('id, name')
      .eq('org_id', member.org_id)
      .in('id', ids);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    const names = (dests ?? []).map((d: any) => normDest(d.name)).filter(Boolean);
    allowedDestSet = new Set(names);
    if (!allowedDestSet.size) {
      return NextResponse.json({ error: 'Forbidden (no destination names)' }, { status: 403 });
    }
  }

  // Load shipment + customer (org-scoped)
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select(
      'id, org_id, tracking_code, public_tracking_token, destination, current_status, customers(name, phone, phone_e164, country_code)'
    )
    .eq('id', shipmentId)
    .eq('org_id', member.org_id)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

  // Enforce destination scope (agent only)
  if (role === 'agent' && allowedDestSet) {
    const dest = normDest((shipment as any).destination);
    if (!allowedDestSet.has(dest)) {
      return NextResponse.json({ error: 'Forbidden (destination scope)' }, { status: 403 });
    }
  }

  if ((shipment as any).current_status === 'delivered') {
    return NextResponse.json({ error: 'Delivered is terminal' }, { status: 409 });
  }

  const baseUrl = getBaseUrlFromHeaders(req.headers);
  const token = (shipment as any).public_tracking_token as string | null;
  const trackingUrl = token && baseUrl ? `${baseUrl}/t/${token}` : '';

  // 1) Insert shipment_event
  const note =
    newStatus === 'arrived_destination'
      ? 'Arrived at destination'
      : newStatus === 'collected_by_customer'
        ? 'Collected by customer'
        : newStatus === 'out_for_delivery'
          ? 'Out for delivery'
          : '';

  const occurredAtISO = new Date().toISOString();

  const { error: evErr } = await supabase.from('shipment_events').insert({
    org_id: (shipment as any).org_id,
    shipment_id: (shipment as any).id,
    status: newStatus,
    note,
    occurred_at: occurredAtISO,
  });

  if (evErr) return NextResponse.json({ error: evErr.message }, { status: 400 });

  // 2) Update shipment status
  const { error: upErr } = await supabase
    .from('shipments')
    .update({ current_status: newStatus, last_event_at: occurredAtISO })
    .eq('id', (shipment as any).id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // 3) Auto WhatsApp (if template exists + enabled + subscription ok)
  let auto_message: any = null;

  // subscription gate (keeps behaviour consistent with your other routes)
  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status')
    .eq('org_id', (shipment as any).org_id)
    .maybeSingle();

  const billingStatus = String(billing?.status ?? 'inactive').toLowerCase();
  const billingOk = ['active', 'trialing'].includes(billingStatus);

  if (!billingOk) {
    auto_message = { ok: true, skipped: true, reason: 'subscription_required' };
    return NextResponse.json({ ok: true, auto_message });
  }

  const { data: tpl } = await supabase
    .from('message_templates')
    .select('id, body, enabled, status')
    .eq('org_id', (shipment as any).org_id)
    .eq('status', newStatus)
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  const customer = Array.isArray((shipment as any).customers)
    ? (shipment as any).customers[0]
    : (shipment as any).customers;

  const customerName = String(customer?.name ?? '').trim();
  const customerPhoneRaw = String(customer?.phone_e164 ?? customer?.phone ?? '').trim();
  const defaultCountry = String(customer?.country_code ?? 'GB').toUpperCase();

  const toE164 = customerPhoneRaw.startsWith('+')
    ? customerPhoneRaw
    : normalizeE164Phone(customerPhoneRaw, { defaultCountry: defaultCountry as any });

  if (!tpl?.id || !tpl.enabled) {
    auto_message = { ok: true, skipped: true, reason: 'no_enabled_template' };
    return NextResponse.json({ ok: true, auto_message });
  }

  if (!toE164) {
    // IMPORTANT: do NOT log success if number is invalid
    auto_message = { ok: true, skipped: true, reason: 'invalid_phone' };
    return NextResponse.json({ ok: true, auto_message });
  }

  const rendered = renderTemplate(String(tpl.body ?? ''), {
    customer_name: customerName,
    tracking_code: (shipment as any).tracking_code ?? '',
    destination: (shipment as any).destination ?? '',
    status: String(newStatus),
    tracking_url: trackingUrl,

    // backwards compat
    name: customerName,
    code: (shipment as any).tracking_code ?? '',
  });

  const shouldSend = isTwilioConfigured();
  const provider = shouldSend ? 'twilio_whatsapp' : 'log';
  const initialSendStatus = shouldSend ? 'queued' : 'logged';

  const { data: log, error: logErr } = await supabase
    .from('message_logs')
    .insert({
      org_id: (shipment as any).org_id,
      shipment_id: (shipment as any).id,
      template_id: tpl.id,
      to_phone: toE164, // ✅ canonical
      provider,
      send_status: initialSendStatus,
      body: rendered,
      status: newStatus,
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      error: null,
    })
    .select('id')
    .single();

  if (logErr) {
    auto_message = { ok: false, skipped: true, reason: 'log_insert_failed', error: logErr.message };
    return NextResponse.json({ ok: true, auto_message });
  }

  // ✅ Update Last Message fields after logging succeeds
  await supabase
    .from('shipments')
    .update({
      last_outbound_message_at: new Date().toISOString(),
      last_outbound_message_status: newStatus,
      last_outbound_send_status: initialSendStatus,
      last_outbound_preview: String(rendered ?? '').slice(0, 140),
    })
    .eq('id', (shipment as any).id);

  if (!shouldSend) {
    auto_message = { ok: true, mode: 'logged_only', log_id: log.id };
    return NextResponse.json({ ok: true, auto_message });
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
      .eq('id', (shipment as any).id);

    auto_message = { ok: true, mode: 'sent', log_id: log.id, sid: result.sid, status: result.status };
    return NextResponse.json({ ok: true, auto_message });
  } catch (e: any) {
    await supabase
      .from('message_logs')
      .update({ send_status: 'failed', error: e?.message ?? 'Send failed' })
      .eq('id', log.id);

    await supabase
      .from('shipments')
      .update({ last_outbound_send_status: 'failed' })
      .eq('id', (shipment as any).id);

    auto_message = { ok: false, mode: 'failed', log_id: log.id, error: e?.message ?? 'Send failed' };
    return NextResponse.json({ ok: true, auto_message }); // status update succeeded; message failed
  }
}