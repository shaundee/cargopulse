alter table public.shipments
  drop constraint if exists shipments_cargo_type_check;

alter table public.shipments
  add constraint shipments_cargo_type_check
  check (cargo_type in (
    'general','barrel','box','crate','pallet','vehicle','machinery','mixed','other'
  ));
