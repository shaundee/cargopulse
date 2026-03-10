-- Add pod_signature to shipment_assets kind constraint.
-- Note: existing POD photos are stored in the `pod` table (photo_url column),
-- NOT in shipment_assets. Only pickup_photo and pickup_signature currently use
-- shipment_assets. This migration adds pod_signature for agent POD signatures.

alter table public.shipment_assets
  drop constraint shipment_assets_kind_check;

alter table public.shipment_assets
  add constraint shipment_assets_kind_check
  check (kind in ('pickup_photo', 'pickup_signature', 'pod_signature'));
