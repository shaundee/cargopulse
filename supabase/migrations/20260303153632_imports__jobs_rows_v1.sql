create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,

  kind text not null default 'shipments' check (kind in ('shipments')),

  filename text not null,
  storage_path text,

  status text not null default 'created'
    check (status in ('created','parsed','importing','complete','failed')),

  mapping jsonb not null default '{}'::jsonb,
  defaults jsonb not null default '{}'::jsonb,

  total_rows int not null default 0,
  imported_rows int not null default 0,
  error_rows int not null default 0,

  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists import_jobs_org_created_idx
  on public.import_jobs (org_id, created_at desc);

create table if not exists public.import_rows (
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  row_no int not null,

  status text not null default 'pending'
    check (status in ('pending','imported','error','skipped')),

  raw jsonb not null default '{}'::jsonb,
  normalized jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,

  shipment_id uuid references public.shipments(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (job_id, row_no)
);

create index if not exists import_rows_job_status_idx
  on public.import_rows (job_id, status, row_no);

alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;

create policy "import_jobs_crud_member"
on public.import_jobs
for all
using (public.is_org_member(org_id))
with check (public.is_org_member(org_id));

create policy "import_rows_crud_member"
on public.import_rows
for all
using (
  exists (
    select 1
    from public.import_jobs j
    where j.id = import_rows.job_id
      and public.is_org_member(j.org_id)
  )
)
with check (
  exists (
    select 1
    from public.import_jobs j
    where j.id = import_rows.job_id
      and public.is_org_member(j.org_id)
  )
);

notify pgrst, 'reload schema';