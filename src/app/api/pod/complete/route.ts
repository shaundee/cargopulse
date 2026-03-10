import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';

function renderTemplate(body: string, vars: Record<string, string>) {
  return String(body ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

function isDelivered(status: unknown) {
  return String(status ?? '').toLowerCase() === 'delivered';
}

function normDest(s: unknown) {
  return String(s ?? '').trim().toLowerCase();
}

function extFor(contentType: string) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpg';
  return 'jpg';
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
  const signatureFile = form.get('signature');

  const sendUpdateRaw = form.get('sendUpdate');
  const sendUpdate = sendUpdateRaw == null ? true : String(sendUpdateRaw) === 'true';

  const templateIdRaw = form.get('templateId');
  const templateId = templateIdRaw == null ? null : String(templateIdRaw).trim() || null;

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!receiverName) return NextResponse.json({ error: 'receiverName is required' }, { status: 400 });
  if (!file || !(file instanceof Blob)) return NextResponse.json({ error: 'file is required' }, { status: 400 });

  // membership (need role for agent scoping)
  const { data: member, error: memErr } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!member?.org_id) return NextResponse.json({ error: 'No organization membership' }, { status: 400 });

  const orgId = String(member.org_id);
  const role = String(member.role ?? 'admin').toLowerCase(); // admin/staff/field/agent

  // destination scopes for agent
  let allowedDestSet: Set<string> | null = null;
  if (role === 'agent') {
    const { data: scopes, error: scErr } = await supabase
      .from('org_agent_scopes')
      .select('destination_id')
      .eq('org_id', orgId)
      .eq('user_id', user.id);

    if (scErr) return NextResponse.json({ error: scErr.message }, { status: 400 });

    const ids = (scopes ?? []).map((s: any) => s.destination_id).filter(Boolean);
    if (!ids.length) return NextResponse.json({ error: 'Forbidden (no destination scope)' }, { status: 403 });

    const { data: dests, error: dErr } = await supabase
      .from('org_destinations')
      .select('id, name')
      .eq('org_id', orgId)
      .in('id', ids);

    if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

    allowedDestSet = new Set((dests ?? []).map((d: any) => normDest(d.name)).filter(Boolean));
    if (!allowedDestSet.size) return NextResponse.json({ error: 'Forbidden (no destination names)' }, { status: 403 });
  }

  // Shipment must exist + belong to org (include destination + customer)
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, customer_id, tracking_code, destination, current_status, public_tracking_token, customers(name, phone, phone_e164, country_code)')
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });
  if (String((shipment as any).org_id) !== orgId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // agent destination scope enforcement
  if (role === 'agent' && allowedDestSet) {
    const dest = normDest((shipment as any).destination);
    if (!allowedDestSet.has(dest)) {
      return NextResponse.json({ error: 'Forbidden (destination scope)' }, { status: 403 });
    }
  }

  const alreadyDelivered = isDelivered((shipment as any).current_status);

  // Upload photo
  const contentType = (file as any).type || 'image/jpeg';
  const ext = extFor(contentType);

  const deliveredAt = new Date().toISOString();
  const path = `org/${orgId}/shipments/${shipmentId}/${Date.now()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from('pod').upload(path, bytes, { contentType, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  // Upsert POD record (always)
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

  // Upload POD signature (optional, best-effort)
  if (signatureFile && signatureFile instanceof Blob) {
    try {
      const sigBytes = new Uint8Array(await signatureFile.arrayBuffer());
      const sigPath = `org/${orgId}/shipments/${shipmentId}/pod_signature.png`;
      const { error: sigUpErr } = await supabase.storage
        .from('pod')
        .upload(sigPath, sigBytes, { contentType: 'image/png', upsert: true });
      if (!sigUpErr) {
        await supabase.from('shipment_assets').insert({
          org_id: orgId,
          shipment_id: shipmentId,
          kind: 'pod_signature',
          path: sigPath,
          created_by: user.id,
        });
      }
    } catch {
      // signature upload is non-fatal
    }
  }

  // Replace POD only
  if (alreadyDelivered) {
    return NextResponse.json({ ok: true, path, auto_message: { ok: true, skipped: true, reason: 'already_delivered_replace_pod' } });
  }

  // delivered event + shipment delivered
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

  // Optional delivered message
  let auto_message: any = null;

  if (!sendUpdate) {
    auto_message = { ok: true, skipped: true, reason: 'send_disabled' };
    return NextResponse.json({ ok: true, path, auto_message });
  }

  // subscription gate
  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status')
    .eq('org_id', orgId)
    .maybeSingle();

  const billingStatus = String(billing?.status ?? 'inactive').toLowerCase();
  if (!['active', 'trialing'].includes(billingStatus)) {
    auto_message = { ok: true, skipped: true, reason: 'subscription_required' };
    return NextResponse.json({ ok: true, path, auto_message });
  }

  // template
  const tplQuery = supabase
    .from('message_templates')
    .select('id, body, enabled, status')
    .eq('org_id', orgId)
    .eq('enabled', true);

  const { data: tpl, error: tplErr } = templateId
    ? await tplQuery.eq('id', templateId).maybeSingle()
    : await tplQuery.eq('status', 'delivered').limit(1).maybeSingle();

  if (tplErr) {
    auto_message = { ok: false, skipped: true, reason: 'template_lookup_failed', error: tplErr.message };
    return NextResponse.json({ ok: true, path, auto_message });
  }

  if (!tpl?.id) {
    auto_message = { ok: true, skipped: true, reason: 'no_enabled_template' };
    return NextResponse.json({ ok: true, path, auto_message });
  }

  if (String(tpl.status ?? '') && String(tpl.status ?? '') !== 'delivered') {
    auto_message = { ok: false, skipped: true, reason: 'template_status_mismatch' };
    return NextResponse.json({ ok: true, path, auto_message });
  }

  const customer = Array.isArray((shipment as any).customers) ? (shipment as any).customers[0] : (shipment as any).customers;
  const customerName = String(customer?.name ?? '').trim();
  const customerPhoneRaw = String(customer?.phone_e164 ?? customer?.phone ?? '').trim();
  const defaultCountry = String(customer?.country_code ?? 'GB').toUpperCase();

  const toE164 = customerPhoneRaw.startsWith('+')
    ? customerPhoneRaw
    : normalizeE164Phone(customerPhoneRaw, { defaultCountry: defaultCountry as any });

  if (!toE164) {
    auto_message = { ok: true, skipped: true, reason: 'invalid_phone' };
    return NextResponse.json({ ok: true, path, auto_message });
  }

  const baseUrl = getBaseUrlFromHeaders(req.headers);
  const trackingUrl =
    (shipment as any).public_tracking_token && baseUrl ? `${baseUrl}/t/${(shipment as any).public_tracking_token}` : '';

  const rendered = renderTemplate(String(tpl.body ?? ''), {
    customer_name: customerName,
    tracking_code: (shipment as any).tracking_code ?? '',
    destination: (shipment as any).destination ?? '',
    status: 'delivered',
    tracking_url: trackingUrl,
    name: customerName,
    code: (shipment as any).tracking_code ?? '',
  });

  const shouldSend = isTwilioConfigured();
  const provider = shouldSend ? 'twilio_whatsapp' : 'log';
  const initialSendStatus = shouldSend ? 'queued' : 'logged';

  const { data: logRow, error: insErr } = await supabase
    .from('message_logs')
    .insert({
      org_id: orgId,
      shipment_id: shipmentId,
      template_id: tpl.id,
      to_phone: toE164,
      provider,
      send_status: initialSendStatus,
      body: rendered,
      status: 'delivered',
      direction: 'outbound',
      sent_at: new Date().toISOString(),
      error: null,
    })
    .select('id')
    .single();

  if (insErr) {
    if ((insErr as any).code === '23505') {
      auto_message = { ok: true, skipped: true, reason: 'already_notified' };
    } else {
      auto_message = { ok: false, skipped: true, reason: 'log_insert_failed', error: insErr.message };
    }
    return NextResponse.json({ ok: true, path, auto_message });
  }

  // update last outbound after log
  await supabase
    .from('shipments')
    .update({
      last_outbound_message_at: new Date().toISOString(),
      last_outbound_message_status: 'delivered',
      last_outbound_send_status: initialSendStatus,
      last_outbound_preview: String(rendered ?? '').slice(0, 140),
    })
    .eq('id', shipmentId);

  if (!shouldSend) {
    auto_message = { ok: true, mode: 'logged_only', log_id: logRow.id };
    return NextResponse.json({ ok: true, path, auto_message });
  }

  try {
    const r = await twilioSendWhatsApp({ toE164, body: rendered });

    await supabase
      .from('message_logs')
      .update({ provider_message_id: r.sid, send_status: r.status, error: null, sent_at: new Date().toISOString() })
      .eq('id', logRow.id);

    await supabase
      .from('shipments')
      .update({ last_outbound_send_status: String(r.status ?? 'queued') })
      .eq('id', shipmentId);

    auto_message = { ok: true, mode: 'sent', log_id: logRow.id, sid: r.sid, status: r.status };
    return NextResponse.json({ ok: true, path, auto_message });
  } catch (e: any) {
    await supabase
      .from('message_logs')
      .update({ send_status: 'failed', error: e?.message ?? 'Send failed' })
      .eq('id', logRow.id);

    await supabase
      .from('shipments')
      .update({ last_outbound_send_status: 'failed' })
      .eq('id', shipmentId);

    auto_message = { ok: false, mode: 'failed', log_id: logRow.id, error: e?.message ?? 'Send failed' };
    return NextResponse.json({ ok: true, path, auto_message });
  }
}