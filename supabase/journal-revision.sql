begin;

alter table public.journal_entries
  add column if not exists revision uuid not null default gen_random_uuid();

create or replace function public.refresh_journal_entry_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision := pg_catalog.gen_random_uuid();
  return new;
end;
$$;

revoke execute on function public.refresh_journal_entry_revision() from public;

drop trigger if exists refresh_journal_entry_revision on public.journal_entries;
create trigger refresh_journal_entry_revision
before insert or update on public.journal_entries
for each row execute function public.refresh_journal_entry_revision();

notify pgrst, 'reload schema';
commit;

-- Verify the result without reading journal records.
select exists (
  select 1
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'journal_entries'
    and column_name = 'revision'
    and data_type = 'uuid'
    and is_nullable = 'NO'
) as revision_column_ready,
exists (
  select 1
  from pg_catalog.pg_trigger
  where tgrelid = 'public.journal_entries'::regclass
    and tgname = 'refresh_journal_entry_revision'
    and tgenabled in ('O', 'A')
    and not tgisinternal
) as revision_trigger_ready;
