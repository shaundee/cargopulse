export const PLAN_LIMITS = {
  free:    { shipments: 10,       whatsapp: false, agentPortal: false, bol: false, multiDest: false },
  starter: { shipments: 75,       whatsapp: true,  agentPortal: false, bol: false, multiDest: false },
  pro:     { shipments: Infinity, whatsapp: true,  agentPortal: true,  bol: true,  multiDest: true  },
} as const;

export type PlanTier = 'free' | 'starter' | 'pro';

export type BillingRow = {
  status: string;
  plan_tier?: string | null;
  shipment_count?: number | null;
  billing_period_start?: string | null;
  stripe_customer_id?: string | null;
};

export function getPlanTier(b: BillingRow | null): PlanTier {
  const t = b?.plan_tier ?? 'free';
  if (t === 'starter' || t === 'pro') return t;
  return 'free';
}

export function isBillingActive(b: BillingRow | null): boolean {
  return ['active', 'trialing'].includes(String(b?.status ?? 'inactive').toLowerCase());
}

export function canCreateShipment(b: BillingRow | null):
  | { allowed: true; overage: boolean }
  | { allowed: false; reason: string } {
  if (!isBillingActive(b)) return { allowed: false, reason: 'subscription_required' };
  const tier = getPlanTier(b);
  const count = b?.shipment_count ?? 0;
  if (tier === 'free' && count >= PLAN_LIMITS.free.shipments)
    return { allowed: false, reason: 'free_limit_reached' };
  return { allowed: true, overage: tier === 'starter' && count >= PLAN_LIMITS.starter.shipments };
}

export function canSendWhatsApp(b: BillingRow | null): boolean {
  return isBillingActive(b) && PLAN_LIMITS[getPlanTier(b)].whatsapp;
}

export function canUseAgentPortal(b: BillingRow | null): boolean {
  return isBillingActive(b) && PLAN_LIMITS[getPlanTier(b)].agentPortal;
}

export function canUseBOL(b: BillingRow | null): boolean {
  return isBillingActive(b) && PLAN_LIMITS[getPlanTier(b)].bol;
}

export function canAddDestination(b: BillingRow | null, existingCount: number): boolean {
  return isBillingActive(b) && (PLAN_LIMITS[getPlanTier(b)].multiDest || existingCount < 1);
}
