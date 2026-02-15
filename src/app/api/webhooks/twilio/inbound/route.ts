import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { normalizeE164Phone } from '@/lib/whatsapp/twilio';

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTrackingCode(text: string) {
  const prefix = String(process.env.TRACKING_PREFIX ?? 'SHP').toUpperCase().trim();
  const safe = escapeRegExp(prefix);
  const re = new RegExp(`\\b${safe}-[A-Z0-9]{6}\\b`, 'i');
  const m = String(text ?? '').match(re);
  return m?.[0]?.toUpperCase() ?? null;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') ?? '';

  if (!process.env.TWILIO_WEBHOOK_SECRET || secret !== process.env.TWILIO_WEBHOOK_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const raw = await req.text();
  const params = new URLSearchParams(raw);

  const fromRaw = params.get('From') ?? ''; // e.g. whatsapp:+447...
  const toRaw = params.get('To') ?? '';     // your Twilio WhatsApp number
  const body = params.get('Body') ?? '';
  const messageSid = params.get('MessageSid') ?? params.get('SmsMessageSid') ?? '';

  const fromE164 = normalizeE164Phone(fromRaw) ?? fromRaw.replace(/^whatsapp:/, '');
  const toE164 = normalizeE164Phone(toRaw) ?? toRaw.replace(/^whatsapp:/, '');

  const numMedia = Number(params.get('NumMedia') ?? '0') || 0;
  const media: Array<{ url: string; contentType?: string | null }> = [];
  for (let i = 0; i < numMedia; i++) {
    const u = params.get(`MediaUrl${i}`) ?? '';
    const ct = params.get(`MediaContentType${i}`);
    if (u) media.push({ url: u, contentType: ct ?? null });
  }

  const supabase = createSupabaseAdminClient();

  // 1) Try match by tracking code in message text (best / unambiguous)
  let shipment: { id: string; org_id: string } | null = null;

  const code = extractTrackingCode(body);
  if (code) {
    const { data } = await supabase
      .from('shipments')
      .select('id, org_id')
      .eq('tracking_code', code)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.id) shipment = data as any;
  }

  // 2) Fallback: match by customer phone → most recent shipment for that customer
  if (!shipment && fromE164) {
    const phoneCandidates = Array.from(
      new Set(
        [fromE164, `whatsapp:${fromE164}`, fromE164.replace('+', ''), fromRaw.replace(/^whatsapp:/, '')]
          .filter(Boolean)
          .map(String)
      )
    );

    const { data: customers } = await supabase
      .from('customers')
      .select('id, org_id')
      .in('phone', phoneCandidates)
      .limit(10);

    const customerIds = (customers ?? []).map((c: any) => c.id);
    if (customerIds.length) {
      const { data: s } = await supabase
        .from('shipments')
        .select('id, org_id')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (s?.id) shipment = s as any;
    }
  }

  // 3) Write inbound log
  if (shipment) {
    await supabase.from('message_logs').insert({
      org_id: shipment.org_id,
      shipment_id: shipment.id,
      direction: 'inbound',
      from_phone: fromE164 || fromRaw.replace(/^whatsapp:/, ''),
      to_phone: toE164 || toRaw.replace(/^whatsapp:/, ''),
      provider: 'twilio_whatsapp',
      provider_message_id: messageSid || null,
      send_status: 'received',
      status: null,
      body: body || null,
      media: media.length ? media : null,
      raw_payload: { raw, fromRaw, toRaw },
      sent_at: new Date().toISOString(),
    });
  } else {
    // Not matched: store separately (so you don't lose customer messages)
    await supabase.from('inbound_messages_unmatched').insert({
      provider: 'twilio_whatsapp',
      provider_message_id: messageSid || null,
      from_phone: fromE164 || fromRaw.replace(/^whatsapp:/, ''),
      to_phone: toE164 || toRaw.replace(/^whatsapp:/, ''),
      body: body || null,
      media: media.length ? media : null,
      raw_payload: { raw, fromRaw, toRaw },
    });
  }

  // Twilio is happy with empty TwiML response
  return new NextResponse('<Response></Response>', {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}
