import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShellClient } from './app-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) redirect('/onboarding');

  const role = (membership.role ?? 'staff') as 'admin' | 'staff' | 'field' | 'agent';

  // Agents should always be in the agent portal.
  // cp_mode=agent cookie may be missing if they logged in via /login directly
  // rather than via magic link. Redirect them unconditionally to /agent —
  // the agent page itself is inside this layout so this only fires when
  // they land on a non-agent route (dashboard, shipments, etc.)
  const cpMode = (await cookies()).get('cp_mode')?.value ?? '';
  if (role === 'agent' && cpMode !== 'agent') {
    // Redirect to the mode-on route which sets the cookie and then goes to /agent
    redirect('/api/agent/mode/on');
  }

  return <AppShellClient role={role}>{children}</AppShellClient>;
}