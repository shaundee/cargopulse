import 'server-only';

export function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

export function normalizeE164Phone(input: string): string | null {
  const raw = String(input ?? '').trim().replace(/\s+/g, '').replace(/-/g, '');
  if (!raw) return null;

  // Stored as "whatsapp:+447..." sometimes — strip prefix
  const s = raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;

  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return `+${s.slice(2)}`;

  // MVP rule: require E.164 (we won't guess country codes)
  return null;
}

export function getTwilioStatusCallbackUrl(): string | null {
  const base = process.env.APP_URL?.replace(/\/$/, '');
  const secret = process.env.TWILIO_WEBHOOK_SECRET;
  if (!base || !secret) return null;
  return `${base}/api/webhooks/twilio/status?secret=${encodeURIComponent(secret)}`;
}

export async function twilioSendWhatsApp(args: { toE164: string; body: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;
  const authToken = process.env.TWILIO_AUTH_TOKEN!;
  const fromE164 = process.env.TWILIO_WHATSAPP_FROM!;

  const to = `whatsapp:${args.toE164}`;
  const from = fromE164.startsWith('whatsapp:') ? fromE164 : `whatsapp:${fromE164}`;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', from);
  form.set('Body', args.body);

  const statusCallback = getTwilioStatusCallbackUrl();
  if (statusCallback) form.set('StatusCallback', statusCallback);

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = data?.message || `Twilio error (${res.status})`;
    throw new Error(msg);
  }

  return { sid: data.sid as string, status: String(data.status ?? 'queued') };
}
