import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function getOrgIdForUser(userId: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.org_id) throw new Error('No organization membership');

  return data.org_id as string;
}
