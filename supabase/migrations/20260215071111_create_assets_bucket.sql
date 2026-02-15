insert into storage.buckets (id, name, public)
values ('assets', 'assets', false)
on conflict (id) do nothing;
