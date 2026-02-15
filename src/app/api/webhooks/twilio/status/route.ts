import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret') ?? '';
  if (!process.env.TWILIO_WEBHOOK_SECRET || secret !== process.env.TWILIO_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await req.text();
  const params = new URLSearchParams(raw);

  const sid = params.get('MessageSid') ?? '';
  const status = String(params.get('MessageStatus') ?? '').toLowerCase();
  const errorCode = params.get('ErrorCode');
  const errorMessage = params.get('ErrorMessage');

  if (!sid || !status) return NextResponse.json({ ok: true });

  const supabase = createSupabaseAdminClient();

  const patch: Record<string, any> = { send_status: status };

  if (status === 'failed' || status === 'undelivered') {
    patch.error = [errorCode, errorMessage].filter(Boolean).join(' ') || 'Delivery failed';
  } else {
    patch.error = null;
  }

  if (status === 'sent' || status === 'delivered') {
    patch.sent_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('message_logs')
    .update(patch)
    .eq('provider_message_id', sid);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
