import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';
import { canSendWhatsApp } from '@/lib/billing/plan';

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

function isDelivered(status: unknown) {
  return String(status ?? '').toLowerCase() === 'delivered';
}

export async function POST(req: Request) {
  const blocked = await blockIfAgentMode();
if (blocked) return blocked;
  try {
    const supabase = await createSupabaseServerClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);

    const shipmentId = String(body?.shipmentId ?? '').trim();
    const eventStatus = String(body?.status ?? '').trim();
    const note = body?.note == null ? null : String(body.note).trim();
    const autoLog = Boolean(body?.autoLog ?? false);
    const templateId = body?.templateId == null ? null : String(body.templateId).trim();

    if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
    if (!eventStatus) return NextResponse.json({ error: 'status is required' }, { status: 400 });

    // delivered is set by POD capture, not manual status updates
    if (isDelivered(eventStatus)) {
      return NextResponse.json(
        { error: 'Delivered is set via POD capture. Use Proof of Delivery.' },
        { status: 400 }
      );
    }

    // Load shipment + customer
    const { data: shipment, error: shipErr } = await supabase
      .from('shipments')
      .select(
        'id, org_id, tracking_code, destination, current_status, public_tracking_token, customers(name, phone, phone_e164, country_code)'
      )
      .eq('id', shipmentId)
      .maybeSingle();

    if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
    if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

    if (isDelivered((shipment as any).current_status)) {
      return NextResponse.json(
        { error: 'Shipment is delivered and locked. Use Replace POD if needed.' },
        { status: 400 }
      );
    }

    // 1) Atomic: insert event + update shipment status
    const { data, error } = await supabase.rpc('add_shipment_event', {
      p_shipment_id: shipmentId,
      p_status: eventStatus,
      p_note: note,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // 2) Optional: auto-log/send message using template for this status
    let auto_message: any = null;

    if (autoLog) {
      try {
        // plan gate: whatsapp requires starter or pro
        const { data: billing } = await supabase
          .from('organization_billing')
          .select('status, plan_tier')
          .eq('org_id', (shipment as any).org_id)
          .maybeSingle();

        if (!canSendWhatsApp(billing)) {
          auto_message = { ok: true, skipped: true, reason: 'plan_upgrade_required' };
          try {
            revalidatePath('/shipments');
          } catch {}
          return NextResponse.json({ ok: true, updated: data?.[0] ?? null, auto_message }, { status: 200 });
        }

        const customer = Array.isArray((shipment as any).customers)
          ? (shipment as any).customers[0]
          : (shipment as any).customers;

        const customerName = String(customer?.name ?? '').trim();

        const customerPhoneRaw = String(customer?.phone_e164 ?? customer?.phone ?? '').trim();
        const defaultCountry = String(customer?.country_code ?? 'GB').toUpperCase();

        const toE164 = customerPhoneRaw.startsWith('+')
          ? customerPhoneRaw
          : normalizeE164Phone(customerPhoneRaw, { defaultCountry: defaultCountry as any });

        if (!toE164) {
          auto_message = { ok: true, skipped: true, reason: 'invalid_phone' };
        } else {
          const tplQuery = supabase
            .from('message_templates')
            .select('id, body, enabled, status')
            .eq('org_id', (shipment as any).org_id)
            .eq('enabled', true);

          const { data: tpl, error: tplErr } = templateId
            ? await tplQuery.eq('id', templateId).maybeSingle()
            : await tplQuery.eq('status', eventStatus).limit(1).maybeSingle();

          if (tplErr) {
            auto_message = {
              ok: false,
              skipped: true,
              reason: 'template_lookup_failed',
              error: tplErr.message,
            };
          } else if (!tpl?.id) {
            auto_message = { ok: true, skipped: true, reason: 'no_enabled_template' };
          } else if (String(tpl.status ?? '') && String(tpl.status ?? '') !== String(eventStatus)) {
            auto_message = {
              ok: false,
              skipped: true,
              reason: 'template_status_mismatch',
              error: 'Template status does not match selected status',
            };
          } else {
            const baseUrl =
              (process.env.APP_URL ? process.env.APP_URL.replace(/\/$/, '') : null) ??
              getBaseUrlFromHeaders(req.headers);

            const trackingUrl =
              (shipment as any).public_tracking_token && baseUrl
                ? `${baseUrl}/t/${(shipment as any).public_tracking_token}`
                : '';

            const rendered = renderTemplate(String(tpl.body ?? ''), {
              customer_name: customerName,
              tracking_code: (shipment as any).tracking_code ?? '',
              destination: (shipment as any).destination ?? '',
              status: String(eventStatus),
              note: note ?? '',
              tracking_url: trackingUrl,

              // backwards compat
              name: customerName,
              code: (shipment as any).tracking_code ?? '',
            });

            const shouldSend = isTwilioConfigured();
            const provider = shouldSend ? 'twilio_whatsapp' : 'log';
            const initialSendStatus = shouldSend ? 'queued' : 'logged';

            const { data: logRow, error: logErr } = await supabase
              .from('message_logs')
              .insert({
                org_id: (shipment as any).org_id,
                shipment_id: (shipment as any).id,
                template_id: tpl.id,
                to_phone: toE164,
                provider,
                send_status: initialSendStatus,
                body: rendered,
                status: eventStatus,
                direction: 'outbound',
                sent_at: new Date().toISOString(),
                error: null,
              })
              .select('id')
              .single();

            if (logErr) {
              auto_message = { ok: false, skipped: true, reason: 'log_insert_failed', error: logErr.message };
            } else {
              // ✅ Update “Last Message” fields only after log insert succeeds
              await supabase
                .from('shipments')
                .update({
                  last_outbound_message_at: new Date().toISOString(),
                  last_outbound_message_status: String(eventStatus),
                  last_outbound_send_status: initialSendStatus,
                  last_outbound_preview: String(rendered ?? '').slice(0, 140),
                })
                .eq('id', (shipment as any).id);

              if (!shouldSend) {
                auto_message = { ok: true, mode: 'logged_only', log_id: logRow.id };
              } else {
                try {
                  const r = await twilioSendWhatsApp({ toE164, body: rendered });

                  await supabase
                    .from('message_logs')
                    .update({
                      provider_message_id: r.sid,
                      send_status: r.status,
                      error: null,
                      sent_at: new Date().toISOString(),
                    })
                    .eq('id', logRow.id);

                  await supabase
                    .from('shipments')
                    .update({ last_outbound_send_status: String(r.status ?? 'queued') })
                    .eq('id', (shipment as any).id);

                  auto_message = { ok: true, mode: 'sent', log_id: logRow.id, sid: r.sid, status: r.status };
                } catch (e: any) {
                  await supabase
                    .from('message_logs')
                    .update({
                      send_status: 'failed',
                      error: e?.message ?? 'Send failed',
                    })
                    .eq('id', logRow.id);

                  await supabase
                    .from('shipments')
                    .update({ last_outbound_send_status: 'failed' })
                    .eq('id', (shipment as any).id);

                  auto_message = { ok: false, mode: 'failed', log_id: logRow.id, error: e?.message ?? 'Send failed' };
                }
              }
            }
          }
        }
      } catch (e: any) {
        auto_message = { ok: false, skipped: true, reason: 'unexpected', error: e?.message ?? String(e) };
      }
    }

    try {
      revalidatePath('/shipments');
    } catch {}

    return NextResponse.json({ ok: true, updated: data?.[0] ?? null, auto_message });
  } catch (e: any) {
    console.error('events/add failed', e);
    return NextResponse.json({ error: e?.message ?? 'Internal Server Error' }, { status: 500 });
  }
}
export async function GET() {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;
  return new Response('ok', { status: 200 });
}