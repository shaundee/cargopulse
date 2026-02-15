-- Public tracking link token (non-guessable URL)
alter table public.shipments
  add column if not exists public_tracking_token uuid;

update public.shipments
set public_tracking_token = gen_random_uuid()
where public_tracking_token is null;

alter table public.shipments
  alter column public_tracking_token set default gen_random_uuid(),
  alter column public_tracking_token set not null;

create unique index if not exists shipments_public_tracking_token_unique
  on public.shipments (public_tracking_token);

notify pgrst, 'reload schema';
