import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const ALLOWED_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'svg'] as const;

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
  const fileExt = String(body?.fileExt ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!fileExt) return NextResponse.json({ error: 'fileExt is required' }, { status: 400 });
  if (!(ALLOWED_EXTS as readonly string[]).includes(fileExt)) {
    return NextResponse.json({ error: `Unsupported file type. Allowed: ${ALLOWED_EXTS.join(', ')}` }, { status: 400 });
  }

  const orgId = member.org_id as string;
  const filePath = `org/${orgId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('logos')
    .createSignedUploadUrl(filePath);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { data: { publicUrl } } = supabase.storage
    .from('logos')
    .getPublicUrl(filePath);

  return NextResponse.json({ path: filePath, token: data.token, publicUrl });
}
