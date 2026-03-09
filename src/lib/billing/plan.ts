export const PLAN_LIMITS = {
  free:    { shipments: 10,       whatsapp: false, agentPortal: false, bol: false, multiDest: false },
  flex:    { shipments: Infinity, whatsapp: true,  agentPortal: false, bol: false, multiDest: false },
  starter: { shipments: 75,       whatsapp: true,  agentPortal: false, bol: false, multiDest: false },
  pro:     { shipments: 250,      whatsapp: true,  agentPortal: true,  bol: true,  multiDest: true  },
  pause:   { shipments: 0,        whatsapp: false, agentPortal: false, bol: false, multiDest: false },
} as const;

export type PlanTier = keyof typeof PLAN_LIMITS;

export type BillingRow = {
  status: string;
  plan_tier?: string | null;
  shipment_count?: number | null;
  billing_period_start?: string | null;
  stripe_customer_id?: string | null;
};

export function getPlanTier(b: BillingRow | null): PlanTier {
  const t = String(b?.plan_tier ?? 'free').toLowerCase();
  if (t === 'flex' || t === 'starter' || t === 'pro' || t === 'pause') return t;
  return 'free';
}
export function getDisplayPlanTier(b: BillingRow | null): PlanTier {
  const tier = getPlanTier(b);
  const status = String(b?.status ?? 'inactive').toLowerCase();

  if (tier !== 'free' && (status === 'inactive' || status === 'canceled')) {
    return 'free';
  }

  return tier;
}
export function isBillingActive(b: BillingRow | null): boolean {
  const status = String(b?.status ?? 'inactive').toLowerCase();
  const tier = getPlanTier(b);

  // Free plan is usable without Stripe subscription.
  if (tier === 'free') return true;

  return status === 'active' || status === 'trialing';
}

export function canCreateShipment(b: BillingRow | null):
  | { allowed: true; overage: boolean }
  | { allowed: false; reason: string } {
  if (!isBillingActive(b)) return { allowed: false, reason: 'subscription_required' };

  const tier = getPlanTier(b);
  const count = b?.shipment_count ?? 0;

  if (tier === 'pause') return { allowed: false, reason: 'paused_plan' };
  if (tier === 'free' && count >= PLAN_LIMITS.free.shipments) {
    return { allowed: false, reason: 'free_limit_reached' };
  }
  if (tier === 'flex') return { allowed: true, overage: true };
  if (tier === 'starter') return { allowed: true, overage: count >= PLAN_LIMITS.starter.shipments };
  if (tier === 'pro') return { allowed: true, overage: count >= PLAN_LIMITS.pro.shipments };

  return { allowed: true, overage: false };
}

export function getShipmentMeterEventName(b: BillingRow | null, overage: boolean): string | null {
  const tier = getPlanTier(b);

  if (tier === 'flex') return 'cargopulse_flex_shipment';
  if (!overage) return null;
  if (tier === 'starter') return 'cargopulse_starter_shipment';
  if (tier === 'pro') return 'cargopulse_pro_shipment';

  return null;
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
