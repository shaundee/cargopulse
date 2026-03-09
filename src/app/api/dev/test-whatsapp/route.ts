import { NextResponse } from 'next/server';
import { isTwilioConfigured, twilioSendWhatsApp } from '@/lib/whatsapp/twilio';

// Dev-only — blocked in production
export async function POST(req: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const to: string = body?.to ?? '';

  if (!to) {
    return NextResponse.json({ error: 'to (E.164 phone number) is required' }, { status: 400 });
  }

  if (!isTwilioConfigured()) {
    return NextResponse.json({ error: 'Twilio not configured (check TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM in .env.local)' }, { status: 500 });
  }

  try {
    const result = await twilioSendWhatsApp({
      toE164: to,
      body: 'CargoPulse test message — if you see this, WhatsApp delivery is working ✅',
    });
    return NextResponse.json({ ok: true, sid: result.sid, status: result.status });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? 'Unknown error' }, { status: 200 });
  }
}
