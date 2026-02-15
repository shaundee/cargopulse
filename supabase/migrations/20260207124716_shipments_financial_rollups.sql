-- 1) Add rollup columns onto shipments (fast to query in lists)
alter table public.shipments
  add column if not exists balance_pence integer not null default 0,
  add column if not exists total_charged_pence integer not null default 0,
  add column if not exists total_paid_pence integer not null default 0,
  add column if not exists last_financial_at timestamptz;

-- 2) Recalc function (SECURITY DEFINER so trigger can always update shipments row)
create or replace function public.recalc_shipment_financials(_shipment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Update from ledger aggregate if there are rows
  update public.shipments s
  set
    balance_pence = x.balance_pence,
    total_charged_pence = x.total_charged_pence,
    total_paid_pence = x.total_paid_pence,
    last_financial_at = x.last_financial_at
  from (
    select
      l.shipment_id,
      coalesce(sum(l.amount_pence), 0) as balance_pence,
      coalesce(sum(case when l.amount_pence > 0 then l.amount_pence else 0 end), 0) as total_charged_pence,
      coalesce(sum(case when l.amount_pence < 0 then -l.amount_pence else 0 end), 0) as total_paid_pence,
      max(l.created_at) as last_financial_at
    from public.shipment_ledger l
    where l.shipment_id = _shipment_id
    group by l.shipment_id
  ) x
  where s.id = _shipment_id;

  -- If no ledger rows, force zero
  if not found then
    update public.shipments
    set balance_pence = 0,
        total_charged_pence = 0,
        total_paid_pence = 0,
        last_financial_at = null
    where id = _shipment_id;
  end if;
end;
$$;

-- 3) Trigger: recalc after any ledger change
create or replace function public.shipment_ledger_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare sid uuid;
begin
  sid := coalesce(new.shipment_id, old.shipment_id);
  perform public.recalc_shipment_financials(sid);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_shipment_ledger_recalc on public.shipment_ledger;

create trigger trg_shipment_ledger_recalc
after insert or update or delete on public.shipment_ledger
for each row execute function public.shipment_ledger_after_change();

-- 4) Backfill existing shipments (safe for current small dataset)
do $$
declare r record;
begin
  for r in (select id from public.shipments) loop
    perform public.recalc_shipment_financials(r.id);
  end loop;
end $$;

notify pgrst, 'reload schema';
