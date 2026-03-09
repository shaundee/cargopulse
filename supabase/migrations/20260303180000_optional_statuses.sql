-- 1. Extend the shipment_status enum
ALTER TYPE public.shipment_status ADD VALUE IF NOT EXISTS 'customs_processing';
ALTER TYPE public.shipment_status ADD VALUE IF NOT EXISTS 'customs_cleared';
ALTER TYPE public.shipment_status ADD VALUE IF NOT EXISTS 'awaiting_collection';

-- 2. Add enabled_statuses column to org_destinations (empty = no extras enabled)
ALTER TABLE public.org_destinations
  ADD COLUMN IF NOT EXISTS enabled_statuses jsonb NOT NULL DEFAULT '[]'::jsonb;
