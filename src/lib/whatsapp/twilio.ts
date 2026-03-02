import 'server-only';

export function isTwilioConfigured() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_WHATSAPP_FROM
  );
}

export function normalizeE164Phone(
  input: string,
  opts?: { defaultCountry?: 'GB' | 'JM' | 'US' | 'CA' }
): string | null {
  const raw0 = String(input ?? '').trim();
  if (!raw0) return null;

  const raw = raw0
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/\(/g, '')
    .replace(/\)/g, '');

  const s0 = raw.startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;

  if (s0.startsWith('+')) return s0;
  if (s0.startsWith('00')) return `+${s0.slice(2)}`;

  const digits = s0.replace(/[^0-9]/g, '');
  if (!digits) return null;

  const cc = opts?.defaultCountry ?? 'GB';

  // If it already looks like country-code (no +), handle a couple common cases
  if (digits.startsWith('44') && digits.length >= 10) return `+${digits}`;
  if (digits.startsWith('1') && digits.length >= 10) return `+${digits}`;

  if (cc === 'GB') {
    // 07xxxxxxxxx -> +44...
    if (digits.startsWith('0')) return `+44${digits.slice(1)}`;
    return null;
  }

  if (cc === 'JM') {
    // Jamaica is NANP (+1). Common local patterns: 876xxxxxxx (10 digits) or xxxxxxx (7 digits)
    if (digits.length === 7) return `+1876${digits}`;
    if (digits.length === 10 && digits.startsWith('876')) return `+1${digits}`;
    if (digits.startsWith('0')) return `+1${digits.slice(1)}`;
    return null;
  }

  if (cc === 'US' || cc === 'CA') {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
    return null;
  }

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
