import { redirect } from 'next/navigation';
import { IconCamera } from '@tabler/icons-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EmptyState } from '../_components/EmptyState';
import { PodClient, type PodShipment } from './pod-client';

export default async function PodPage() {
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

  const orgId = membership.org_id as string;

  const { data: delivered } = await supabase
    .from('shipments')
    .select('id, tracking_code, destination, service_type, last_event_at, customers(name)')
    .eq('org_id', orgId)
    .in('current_status', ['delivered', 'collected_by_customer'])
    .order('last_event_at', { ascending: false })
    .limit(200);

  if (!delivered?.length) {
    return (
      <EmptyState
        icon={<IconCamera size={28} />}
        title="No deliveries to confirm yet"
        description="When a shipment is delivered, you can capture proof of delivery here — photo, receiver name, and signature."
      />
    );
  }

  const ids = delivered.map(s => s.id);
  const { data: podRecords } = await supabase
    .from('pod')
    .select('shipment_id, receiver_name, delivered_at, photo_url')
    .in('shipment_id', ids);

  const podMap = new Map((podRecords ?? []).map(p => [p.shipment_id, p]));

  const shipments: PodShipment[] = delivered.map(s => ({
    id: s.id,
    tracking_code: s.tracking_code,
    destination: s.destination,
    service_type: (s as any).service_type ?? null,
    last_event_at: s.last_event_at,
    customers: (s as any).customers as { name: string } | null,
    pod: podMap.get(s.id) ?? null,
  }));

  return <PodClient shipments={shipments} />;
}
