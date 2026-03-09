import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShellClient } from './app-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPlanTier, PLAN_LIMITS, type PlanTier } from '@/lib/billing/plan';

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

  const cpMode = (await cookies()).get('cp_mode')?.value ?? '';
  if (role === 'agent' && cpMode !== 'agent') {
    redirect('/api/agent/mode/on');
  }

  const [{ data: org }, { data: billing }] = await Promise.all([
    supabase.from('organizations').select('id, name').eq('id', membership.org_id).maybeSingle(),
    supabase.from('organization_billing').select('status, plan_tier, shipment_count').eq('org_id', membership.org_id).maybeSingle(),
  ]);

  const planTier = getPlanTier(billing as { status: string; plan_tier?: string | null } | null) as PlanTier;
  const shipmentCount = billing?.shipment_count ?? 0;
  const rawLimit = PLAN_LIMITS[planTier].shipments;
  const shipmentLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
  const rawName = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').trim();
  const userName = rawName || (user.email?.split('@')[0] ?? 'User');

  return (
    <AppShellClient
      role={role}
      orgName={org?.name ?? ''}
      planTier={planTier}
      shipmentCount={shipmentCount}
      shipmentLimit={shipmentLimit}
      userName={userName}
      userEmail={user.email ?? ''}
      isAdmin={role === 'admin' || role === 'staff'}
    >
      {children}
    </AppShellClient>
  );
}
