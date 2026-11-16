begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (btrim(full_name) <> ''),
  role text not null default 'teacher' check (role in ('teacher', 'dispatcher', 'admin'))
);

create table if not exists public.schedule_data (
  id text primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_metadata (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.schedule_data enable row level security;
alter table public.app_metadata enable row level security;

revoke all on public.profiles, public.schedule_data, public.app_metadata from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.schedule_data, public.app_metadata to authenticated;
grant select, insert, update, delete on public.profiles, public.schedule_data, public.app_metadata to service_role;

drop policy if exists pwa_read_own_profile on public.profiles;
create policy pwa_read_own_profile on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists pwa_staff_read_schedule on public.schedule_data;
create policy pwa_staff_read_schedule on public.schedule_data for select to authenticated
  using ((select exists (select 1 from public.profiles where id = (select auth.uid()))));

drop policy if exists pwa_dispatch_insert_schedule on public.schedule_data;
create policy pwa_dispatch_insert_schedule on public.schedule_data for insert to authenticated
  with check (id = 'default' and (select role from public.profiles where id = (select auth.uid())) in ('dispatcher', 'admin'));

drop policy if exists pwa_dispatch_update_schedule on public.schedule_data;
create policy pwa_dispatch_update_schedule on public.schedule_data for update to authenticated
  using (id = 'default' and (select role from public.profiles where id = (select auth.uid())) in ('dispatcher', 'admin'))
  with check (id = 'default' and (select role from public.profiles where id = (select auth.uid())) in ('dispatcher', 'admin'));

-- Remove the anonymous policy from the older migration when it was applied.
drop policy if exists allow_all_app_metadata on public.app_metadata;
drop policy if exists pwa_staff_read_subgroups on public.app_metadata;
create policy pwa_staff_read_subgroups on public.app_metadata for select to authenticated
  using (key = 'student_subgroups' and (select exists (select 1 from public.profiles where id = (select auth.uid()))));

drop policy if exists pwa_dispatch_insert_subgroups on public.app_metadata;
create policy pwa_dispatch_insert_subgroups on public.app_metadata for insert to authenticated
  with check (key = 'student_subgroups' and jsonb_typeof(data) = 'object'
    and (select role from public.profiles where id = (select auth.uid())) in ('dispatcher', 'admin'));

drop policy if exists pwa_dispatch_update_subgroups on public.app_metadata;
create policy pwa_dispatch_update_subgroups on public.app_metadata for update to authenticated
  using (key = 'student_subgroups' and (select role from public.profiles where id = (select auth.uid())) in ('dispatcher', 'admin'))
  with check (key = 'student_subgroups' and jsonb_typeof(data) = 'object'
    and (select role from public.profiles where id = (select auth.uid())) in ('dispatcher', 'admin'));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'schedule_data'
    )
  then
    alter publication supabase_realtime add table public.schedule_data;
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
