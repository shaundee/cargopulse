import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { blockIfAgentMode } from '@/lib/auth/block-agent-mode';

const CARGO_ALLOWED = new Set([
  'general', 'barrel', 'box', 'crate', 'pallet',
  'vehicle', 'machinery', 'mixed', 'other',
]);

const PACKING_CATS = new Set([
  'Clothing', 'Food & Groceries', 'Electronics',
  'Household Goods', 'Personal Care', 'Documents', 'Other',
]);

function sanitiseCargoMeta(
  cargoType: string,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  // Preserve all existing fields; only sanitise packing-list fields
  const meta: Record<string, unknown> = { ...raw };

  if (cargoType === 'barrel' || cargoType === 'box') {
    if (meta.quantity !== undefined) {
      const n = Number(meta.quantity);
      if (Number.isFinite(n) && n >= 0) meta.quantity = Math.trunc(n);
      else delete meta.quantity;
    }
    if (Array.isArray(meta.contents)) {
      const sanitised = meta.contents
        .filter((c: any) => c && PACKING_CATS.has(String(c.category ?? '')))
        .map((c: any) => ({
          category: String(c.category),
          description: String(c.description ?? '').trim() || null,
          qty: Math.max(1, Math.trunc(Number(c.qty) || 1)),
        }));
      if (sanitised.length > 0) meta.contents = sanitised;
      else delete meta.contents;
    }
  } else {
    // Non-barrel/box — strip packing fields to avoid stale data
    delete meta.contents;
  }

  return meta;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const blocked = await blockIfAgentMode();
  if (blocked) return blocked;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: shipmentId } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const cargoTypeRaw = String(body?.cargoType ?? 'general');
  const cargoType = CARGO_ALLOWED.has(cargoTypeRaw) ? cargoTypeRaw : 'general';
  const cargoMetaRaw =
    body?.cargoMeta && typeof body.cargoMeta === 'object'
      ? (body.cargoMeta as Record<string, unknown>)
      : {};
  const cargoMeta = sanitiseCargoMeta(cargoType, cargoMetaRaw);

  // Auth: verify org membership
  const { data: membership, error: memErr } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 400 });
  if (!membership?.org_id)
    return NextResponse.json({ error: 'No organization membership' }, { status: 400 });
  const orgId = membership.org_id as string;

  const { error } = await supabase
    .from('shipments')
    .update({ cargo_type: cargoType, cargo_meta: cargoMeta })
    .eq('id', shipmentId)
    .eq('org_id', orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
