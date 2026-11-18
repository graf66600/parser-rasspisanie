begin;

create or replace function public.publish_imported_schedule(
  teacher_names text[],
  lesson_rows jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if coalesce(cardinality(teacher_names), 0) = 0
    or exists (select 1 from unnest(teacher_names) as t(name) where name is null or btrim(name) = '')
    or jsonb_typeof(lesson_rows) is distinct from 'array'
  then
    raise exception 'Invalid schedule import' using errcode = '22023';
  end if;

  if jsonb_array_length(lesson_rows) = 0 or exists (
    select 1 from jsonb_array_elements(lesson_rows) as rows(lesson)
    where (lesson ->> 'teacher_name' = any(teacher_names)) is not true
  ) then
    raise exception 'Missing lessons or unknown teacher' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(758866412071::bigint);

  insert into public.teachers (name, is_default)
  select distinct name, name = 'Трипольский' from unnest(teacher_names) as t(name)
  on conflict (name) do update set is_default = excluded.is_default;

  delete from public.lessons
  where teacher_name in (
    select distinct lesson ->> 'teacher_name'
    from jsonb_array_elements(lesson_rows) as rows(lesson)
  );

  insert into public.lessons (
    id, teacher_name, day_of_week, day_name, lesson_number, start_time, end_time,
    subject, group_name, subgroup, classroom, week_type
  )
  select
    l.id, l.teacher_name, l.day_of_week, l.day_name, l.lesson_number, l.start_time, l.end_time,
    l.subject, l.group_name, l.subgroup, l.classroom, l.week_type
  from jsonb_to_recordset(lesson_rows) as l(
    id text, teacher_name text, day_of_week integer, day_name text, lesson_number integer,
    start_time text, end_time text, subject text, group_name text, subgroup text,
    classroom text, week_type text
  );
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.publish_imported_schedule(text[], jsonb) from public, anon, authenticated;
grant execute on function public.publish_imported_schedule(text[], jsonb) to service_role;
grant select, insert, update on public.teachers to service_role;
grant select, insert, delete on public.lessons to service_role;

notify pgrst, 'reload schema';
commit;

select
  has_function_privilege('service_role', 'public.publish_imported_schedule(text[], jsonb)', 'EXECUTE') as server_can_publish,
  not has_function_privilege('anon', 'public.publish_imported_schedule(text[], jsonb)', 'EXECUTE') as guests_blocked,
  not has_function_privilege('authenticated', 'public.publish_imported_schedule(text[], jsonb)', 'EXECUTE') as browser_blocked;
