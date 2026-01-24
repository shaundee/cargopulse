import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => vars[key] ?? '');
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const shipmentId = String(body?.shipmentId ?? '').trim();
  const templateId = String(body?.templateId ?? '').trim();

  if (!shipmentId) return NextResponse.json({ error: 'shipmentId is required' }, { status: 400 });
  if (!templateId) return NextResponse.json({ error: 'templateId is required' }, { status: 400 });

  // Load shipment + customer
  const { data: shipment, error: shipErr } = await supabase
    .from('shipments')
    .select('id, org_id, tracking_code, destination, current_status, customers(name, phone)')
    .eq('id', shipmentId)
    .maybeSingle();

  if (shipErr) return NextResponse.json({ error: shipErr.message }, { status: 400 });
  if (!shipment) return NextResponse.json({ error: 'Shipment not found' }, { status: 404 });

  // Load template
const { data: tpl, error: tplErr } = await supabase
  .from('message_templates')
  .select('id, org_id, status, name, body, enabled')
  .eq('id', templateId)
  .eq('org_id', shipment.org_id)
  .maybeSingle();


  if (tplErr) return NextResponse.json({ error: tplErr.message }, { status: 400 });
  if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (!tpl.enabled) return NextResponse.json({ error: 'Template is disabled' }, { status: 400 });

 const customer = Array.isArray(shipment.customers)
  ? shipment.customers[0]
  : shipment.customers;

const customerName = customer?.name ?? '';
const customerPhone = customer?.phone ?? '';

  const rendered = renderTemplate(String(tpl.body ?? ''), {
    customer_name: customerName,
    tracking_code: shipment.tracking_code ?? '',
    destination: shipment.destination ?? '',
    status: shipment.current_status ?? '',
  });

  // For now: LOG ONLY (no WhatsApp provider yet)
  const { data: log, error: logErr } = await supabase
    .from('message_logs')
    .insert({
      shipment_id: shipment.id,
      template_id: tpl.id,
      to_phone: customerPhone,
      channel: 'whatsapp',
      status: shipment.current_status,
      body: rendered,
      created_by: user.id,
      org_id: shipment.org_id,

    })
    .select('id, created_at')
    .single();

  if (logErr) return NextResponse.json({ error: logErr.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    rendered,
    log_id: log.id,
  });
}
