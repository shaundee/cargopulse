import { createSupabaseServerClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ShipmentsClient } from './shipments-client';

export default async function ShipmentsPage() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get org_id
  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership?.org_id) redirect('/onboarding');

  // Load shipments + customer info
  const { data: shipments, error } = await supabase
    .from('shipments')
    .select('id, tracking_code, destination, current_status, last_event_at, customers(name, phone)')
    .eq('org_id', membership.org_id)
    .order('last_event_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  return <ShipmentsClient initialShipments={(shipments ?? []) as any[]} />;
}
