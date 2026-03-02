import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!member?.org_id) return NextResponse.json({ error: 'No org' }, { status: 400 });
  if (!['admin', 'staff'].includes(member.role)) {
    return NextResponse.json({ error: 'Admin or staff only' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  // Only allow safe fields to be updated
  const patch: Record<string, string> = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    patch.name = body.name.trim().slice(0, 100);
  }
  if (typeof body.support_phone === 'string') {
    patch.support_phone = body.support_phone.trim().slice(0, 30);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', member.org_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}