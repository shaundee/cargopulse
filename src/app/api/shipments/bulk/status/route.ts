import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isTwilioConfigured, normalizeE164Phone, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';
import { getBaseUrlFromHeaders } from '@/lib/http/base-url';

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

  const shipmentIds: string[] = Array.isArray(body?.shipmentIds) ? body.shipmentIds : [];
  const status = String(body?.status ?? '').trim();
  const note = body?.note == null ? null : String(body.note).trim();
  const autoLog = Boolean(body?.autoLog ?? false);

  if (!shipmentIds.length) return NextResponse.json({ error: 'shipmentIds is required' }, { status: 400 });
  if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 });

  if (isDelivered(status)) {
    return NextResponse.json({ error: 'Delivered is set via POD capture.' }, { status: 400 });
  }

  // Resolve org
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id) return NextResponse.json({ error: 'No org membership' }, { status: 403 });

  // Load shipments for this org only
  const { data: shipments, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, tracking_code, destination, current_status, public_tracking_token, customers(name, phone)')
    .eq('org_id', membership.org_id)
    .in('id', shipmentIds);

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });

  const baseUrl = getBaseUrlFromHeaders(req.headers);

  let updated = 0;
  let skipped = 0;

  const results: Array<{ id: string; ok: boolean; reason?: string }> = [];

  for (const s of shipments ?? []) {
    try {
      if (isDelivered((s as any).current_status)) {
        skipped++;
        results.push({ id: s.id, ok: false, reason: 'delivered_locked' });
        continue;
      }

      const { error: rpcErr } = await supabase.rpc('add_shipment_event', {
        p_shipment_id: s.id,
        p_status: status,
        p_note: note,
      });

      if (rpcErr) throw new Error(rpcErr.message);

      updated++;

      // Optional auto log/send (same behavior as single update)
      if (autoLog) {
        const customer = Array.isArray((s as any).customers) ? (s as any).customers[0] : (s as any).customers;
        const customerName = (customer?.name ?? '').trim();
        const customerPhone = (customer?.phone ?? '').trim();

        if (customerPhone) {
          const { data: tpl } = await supabase
            .from('message_templates')
            .select('id, body, enabled, status')
            .eq('org_id', membership.org_id)
            .eq('status', status)
            .eq('enabled', true)
            .limit(1)
            .maybeSingle();

          if (tpl?.id) {
            const trackingUrl =
              (s as any).public_tracking_token && baseUrl
                ? `${baseUrl}/t/${(s as any).public_tracking_token}`
                : '';

            const rendered = renderTemplate(String(tpl.body ?? ''), {
              customer_name: customerName,
              tracking_code: (s as any).tracking_code ?? '',
              destination: (s as any).destination ?? '',
              status: String(status),
              note: note ?? '',
              tracking_url: trackingUrl,

              name: customerName,
              code: (s as any).tracking_code ?? '',
            });

            const toE164 = normalizeE164Phone(customerPhone);
            const shouldSend = isTwilioConfigured() && Boolean(toE164);

            const provider = shouldSend ? 'twilio_whatsapp' : 'log';
            const initialSendStatus = shouldSend ? 'queued' : 'logged';

            const { data: logRow } = await supabase
              .from('message_logs')
              .insert({
                org_id: membership.org_id,
                shipment_id: s.id,
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

            if (shouldSend && logRow?.id) {
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
              } catch (e: any) {
                await supabase
                  .from('message_logs')
                  .update({ send_status: 'failed', error: e?.message ?? 'Send failed' })
                  .eq('id', logRow.id);
              }
            }
          }
        }
      }

      results.push({ id: s.id, ok: true });
    } catch (e: any) {
      skipped++;
      results.push({ id: s.id, ok: false, reason: e?.message ?? 'failed' });
    }
  }

  revalidatePath('/shipments');
  return NextResponse.json({ ok: true, updated, skipped, results });
}
