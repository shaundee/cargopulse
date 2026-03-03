-- ─── Free-tier monthly shipment_count reset ──────────────────────────────────
-- Requires pg_cron extension enabled in Supabase Dashboard:
--   Dashboard → Database → Extensions → pg_cron → Enable
--
-- If pg_cron is not yet enabled, run this migration manually after enabling it.

select cron.schedule(
  'reset-free-tier-shipment-count',
  '0 0 1 * *',   -- 1st of each month at 00:00 UTC
  $$
    update public.organization_billing
    set shipment_count = 0,
        billing_period_start = now()
    where plan_tier = 'free';
  $$
);
