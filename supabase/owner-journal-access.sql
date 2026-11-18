begin;

do $$
declare
  owner_id uuid := null; -- Replace NULL with the quoted User UID from Authentication > Users.
  table_name text;
begin
  if owner_id is null or not exists (select 1 from auth.users where id = owner_id) then
    raise exception 'Set owner_id to the UID of the existing owner account before running';
  end if;

  foreach table_name in array array['journal_entries', 'students'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon', table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('drop policy if exists owner_access on public.%I', table_name);
    execute format('drop policy if exists owner_required on public.%I', table_name);
    execute format(
      'create policy owner_access on public.%I for all to authenticated
       using ((select auth.uid()) = %L::uuid) with check ((select auth.uid()) = %L::uuid)',
      table_name, owner_id, owner_id
    );
    execute format(
      'create policy owner_required on public.%I as restrictive for all to public
       using ((select auth.uid()) = %L::uuid) with check ((select auth.uid()) = %L::uuid)',
      table_name, owner_id, owner_id
    );
  end loop;

  drop policy if exists allow_all_journal on public.journal_entries;
  drop policy if exists allow_all_students on public.students;
end;
$$;

notify pgrst, 'reload schema';
commit;

select
  not has_table_privilege('anon', 'public.journal_entries', 'SELECT,INSERT,UPDATE,DELETE') as journal_guests_blocked,
  not has_table_privilege('anon', 'public.students', 'SELECT,INSERT,UPDATE,DELETE') as student_guests_blocked,
  (select count(*) = 2 from pg_policies where schemaname = 'public'
    and tablename in ('journal_entries', 'students')
    and policyname = 'owner_required' and permissive = 'RESTRICTIVE') as owner_required;
