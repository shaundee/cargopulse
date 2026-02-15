import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';

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

  const body = await req.json().catch(() => null);

  const shipmentId = String(body?.shipmentId ?? '').trim();
  const status = String(body?.status ?? '').trim();
  const note = body?.note == null ? null : String(body.note).trim();
  const autoLog = Boolean(body?.autoLog ?? false);

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 });

  // Enforce your rule: delivered is set by POD capture, not manual status updates
  if (isDelivered(status)) {
    return NextResponse.json({ error: 'Delivered is set via POD capture. Use Proof of Delivery.' }, { status: 400 });
  }

  // Load shipment + customer (also lets us enforce delivered lock server-side)
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, tracking_code, destination, current_status, customers(name, phone)')
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

  if (isDelivered(shipment.current_status)) {
    return NextResponse.json({ error: 'Shipment is delivered and locked. Use Replace POD if needed.' }, { status: 400 });
  }

  // 1) Atomic: insert event + update shipment status
  const { data, error } = await supabase.rpc('add_shipment_event', {
    p_shipment_id: shipmentId,
    p_status: status,
    p_note: note,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 2) Optional: auto-log/send message using template for this status
  let auto_message: any = null;

  if (autoLog) {
    try {
      const customer = Array.isArray(shipment.customers) ? shipment.customers[0] : shipment.customers;
      const customerName = (customer?.name ?? '').trim();
      const customerPhone = (customer?.phone ?? '').trim();

      if (!customerPhone) {
        auto_message = { ok: true, skipped: true, reason: 'no_customer_phone' };
      } else {
        const { data: tpl, error: tplErr } = await supabase
          .from('message_templates')
          .select('id, body, enabled, status')
          .eq('org_id', shipment.org_id)
          .eq('status', status)
          .eq('enabled', true)
          .limit(1)
          .maybeSingle();

        if (tplErr) {
          auto_message = { ok: false, skipped: true, reason: 'template_lookup_failed', error: tplErr.message };
        } else if (!tpl?.id) {
          auto_message = { ok: true, skipped: true, reason: 'no_enabled_template' };
        } else {
          const rendered = renderTemplate(String(tpl.body ?? ''), {
            // preferred keys
            customer_name: customerName,
            tracking_code: shipment.tracking_code ?? '',
            destination: shipment.destination ?? '',
            status: String(status),
            note: note ?? '',

            // backwards compat
            name: customerName,
            code: shipment.tracking_code ?? '',
          });

          const toE164 = normalizeE164Phone(customerPhone);
          const shouldSend = isTwilioConfigured() && Boolean(toE164);

          const provider = shouldSend ? 'twilio_whatsapp' : 'log';
          const initialSendStatus = shouldSend ? 'queued' : 'logged';

          const { data: logRow, error: logErr } = await supabase
            .from('message_logs')
            .insert({
              org_id: shipment.org_id,
              shipment_id: shipment.id,
              template_id: tpl.id,
              to_phone: customerPhone,
              provider,
              send_status: initialSendStatus,
              body: rendered,
              status: status,
              sent_at: new Date().toISOString(),
              error: null,
            })
            .select('id')
            .single();

          if (logErr) {
            auto_message = { ok: false, skipped: true, reason: 'log_insert_failed', error: logErr.message };
          } else if (!shouldSend) {
            auto_message = { ok: true, mode: 'logged_only', log_id: logRow.id, phone_ok: Boolean(toE164) };
          } else {
            try {
              const r = await twilioSendWhatsApp({ toE164: toE164!, body: rendered });

              await supabase
                .from('message_logs')
                .update({
                  provider_message_id: r.sid,
                  send_status: r.status,
                  error: null,
                  sent_at: new Date().toISOString(),
                })
                .eq('id', logRow.id);

              auto_message = { ok: true, mode: 'sent', log_id: logRow.id, sid: r.sid, status: r.status };
            } catch (e: any) {
              await supabase
                .from('message_logs')
                .update({
                  send_status: 'failed',
                  error: e?.message ?? 'Send failed',
                })
                .eq('id', logRow.id);

              auto_message = { ok: false, mode: 'failed', log_id: logRow.id, error: e?.message ?? 'Send failed' };
            }
          }
        }
      }
    } catch (e: any) {
      auto_message = { ok: false, skipped: true, reason: 'unexpected', error: e?.message ?? String(e) };
    }
  }

  revalidatePath('/shipments');
  return NextResponse.json({ ok: true, updated: data?.[0] ?? null, auto_message });
}
