-- ─── Normalise destination casing ────────────────────────────────────────────
-- Historical data was stored with inconsistent casing (e.g. 'jamaica' instead
-- of 'Jamaica').  This migration:
--   1. Normalises shipments.destination to canonical title-case values.
--   2. Merges duplicate lowercase org_destinations rows into the canonical row,
--      preserving any enabled_statuses that were configured on the old row.
--   3. Cleans up the now-redundant lowercase rows.

-- ── 1. Normalise shipments.destination ───────────────────────────────────────

update public.shipments
set destination = 'Jamaica'
where lower(trim(destination)) = 'jamaica'
  and destination <> 'Jamaica';

update public.shipments
set destination = 'Trinidad & Tobago'
where lower(trim(destination)) in ('trinidad & tobago', 'trinidad and tobago', 'trinidad')
  and destination <> 'Trinidad & Tobago';

update public.shipments
set destination = 'Barbados'
where lower(trim(destination)) = 'barbados'
  and destination <> 'Barbados';

update public.shipments
set destination = 'Guyana'
where lower(trim(destination)) = 'guyana'
  and destination <> 'Guyana';

-- ── 2. Merge enabled_statuses from old casing rows into canonical rows ────────
-- If the canonical row has an empty/null enabled_statuses and the old row has
-- values, copy them across before deleting.

update public.org_destinations canonical
set enabled_statuses = old.enabled_statuses
from public.org_destinations old
where canonical.org_id = old.org_id
  and canonical.name = 'Jamaica'
  and lower(old.name) = 'jamaica'
  and old.name <> 'Jamaica'
  and (canonical.enabled_statuses is null or canonical.enabled_statuses = '[]'::jsonb)
  and old.enabled_statuses is not null
  and old.enabled_statuses <> '[]'::jsonb;

update public.org_destinations canonical
set enabled_statuses = old.enabled_statuses
from public.org_destinations old
where canonical.org_id = old.org_id
  and canonical.name = 'Trinidad & Tobago'
  and lower(old.name) in ('trinidad & tobago', 'trinidad and tobago', 'trinidad')
  and old.name <> 'Trinidad & Tobago'
  and (canonical.enabled_statuses is null or canonical.enabled_statuses = '[]'::jsonb)
  and old.enabled_statuses is not null
  and old.enabled_statuses <> '[]'::jsonb;

-- ── 3. Delete the old lowercase / non-canonical rows ─────────────────────────

delete from public.org_destinations
where lower(trim(name)) = 'jamaica'
  and name <> 'Jamaica';

delete from public.org_destinations
where lower(trim(name)) in ('trinidad & tobago', 'trinidad and tobago', 'trinidad')
  and name <> 'Trinidad & Tobago';

delete from public.org_destinations
where lower(trim(name)) = 'barbados'
  and name <> 'Barbados';

delete from public.org_destinations
where lower(trim(name)) = 'guyana'
  and name <> 'Guyana';
