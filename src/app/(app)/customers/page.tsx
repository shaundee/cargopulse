import { redirect } from 'next/navigation';
import { IconUsers } from '@tabler/icons-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EmptyState } from '../_components/EmptyState';
import { CustomersClient, type CustomerRow } from './customers-client';

export default async function CustomersPage() {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) redirect('/onboarding');

  const { data: customers } = await supabase
    .from('customers')
    .select(`
      id, name, phone, created_at,
      shipments(id, tracking_code, destination, current_status, service_type, last_event_at)
    `)
    .eq('org_id', membership.org_id)
    .order('created_at', { ascending: false });

  if (!customers?.length) {
    return (
      <EmptyState
        icon={<IconUsers size={28} />}
        title="No customers yet"
        description="Customers are created automatically when you book a shipment."
      />
    );
  }

  return <CustomersClient customers={customers as CustomerRow[]} />;
}
