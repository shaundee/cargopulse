import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { SettingsClient } from './settings-client';

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: member } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!member?.org_id) redirect('/onboarding');

  const { data: org } = await supabase
    .from('organizations')
    .select('id, name, support_phone, logo_url')
    .eq('id', member.org_id)
    .maybeSingle();

  const { data: billing } = await supabase
    .from('organization_billing')
    .select('status, plan_tier, shipment_count, billing_period_start, current_period_end, stripe_customer_id')
    .eq('org_id', member.org_id)
    .maybeSingle();

  const { data: templates } = await supabase
    .from('message_templates')
    .select('id, status, enabled')
    .eq('org_id', member.org_id);

  const { data: miscTemplates } = await supabase
    .from('message_templates_misc')
    .select('id, key, enabled')
    .eq('org_id', member.org_id);

  const isAdmin = ['admin', 'staff'].includes(member.role ?? '');

  return (
    <SettingsClient
      org={org ?? { id: member.org_id, name: '', support_phone: '', logo_url: null }}
      billing={billing ?? null}
      templateCount={(templates ?? []).length}
      miscTemplateCount={(miscTemplates ?? []).length}
      enabledTemplateCount={(templates ?? []).filter((t) => t.enabled).length}
      isAdmin={isAdmin}
      userEmail={user.email ?? ''}
      userRole={member.role ?? 'staff'}
    />
  );
}