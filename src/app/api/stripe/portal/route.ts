import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, organizations:organizations(id, stripe_customer_id)')
    .eq('user_id', auth.user.id)
    .eq('role', 'admin')
    .maybeSingle();

  const org = (membership as any)?.organizations;
  const customerId = org?.stripe_customer_id as string | null;
  if (!customerId) return NextResponse.json({ error: 'No Stripe customer yet' }, { status: 400 });

  const appUrl = process.env.APP_URL ?? 'http://localhost:3000';

  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/settings/billing`,
  });

  return NextResponse.json({ url: portal.url });
}