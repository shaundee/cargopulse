import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AgentClient } from './agent-client';

export default async function AgentPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/agent');

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const role = (member?.role ?? 'admin') as 'admin' | 'staff' | 'field' | 'agent';

  // Allow admin/staff to use agent portal too (best for ops/testing)
  const allowAgent = role === 'admin' || role === 'staff' || role === 'agent';
  if (!allowAgent) redirect('/dashboard');

  return <AgentClient />;
}
