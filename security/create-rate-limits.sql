-- ============================================================================
-- Insert rate limits (2026-07-23) for the two append-friendly tables whose
-- insert policy is `with check (true)`: ops_events and edit_history. Any
-- authenticated session can write them directly via PostgREST, bypassing every
-- app- and function-level throttle — so the floor lives here, in the database.
--
-- Generic BEFORE INSERT trigger: reject when the table already received more
-- than N rows in the last minute. Whole-table caps (ops_events rows carry no
-- user id), sized far above legitimate peaks — this is a flood dam, not a
-- fairness scheduler. Service-role and direct connections are exempt: their
-- writers (edge functions, migrations) have their own guards.
--
-- Run in the Supabase SQL editor. Idempotent.
-- ============================================================================

begin;

create or replace function public.enforce_insert_rate()
returns trigger
language plpgsql
security definer            -- count past RLS (ops_events select is Admin-only)
set search_path = public
as $$
declare
  cap    int := tg_argv[0]::int;
  recent int;
begin
  -- Only throttle PostgREST authenticated sessions; service role is exempt.
  if current_user <> 'authenticated' then
    return new;
  end if;
  execute format(
    'select count(*) from %I.%I where updated_at > now() - interval ''1 minute''',
    tg_table_schema, tg_table_name
  ) into recent;
  if recent >= cap then
    raise exception 'Rate limit: % inserts/minute on % — try again shortly.',
      cap, tg_table_name;
  end if;
  return new;
end;
$$;

-- ops_events: the bell gets at most one legit event per failure kind per minute
-- per client, so 60/min table-wide is already generous.
drop trigger if exists ops_events_insert_rate on public.ops_events;
create trigger ops_events_insert_rate
  before insert on public.ops_events
  for each row execute function public.enforce_insert_rate('60');

-- edit_history: bulk imports legitimately burst hundreds of rows; the dam only
-- has to stop unbounded flooding of the append-only log.
drop trigger if exists edit_history_insert_rate on public.edit_history;
create trigger edit_history_insert_rate
  before insert on public.edit_history
  for each row execute function public.enforce_insert_rate('600');

-- The count above scans the last minute — keep it indexed on both tables.
create index if not exists ops_events_updated_at_idx
  on public.ops_events (updated_at desc);
create index if not exists edit_history_updated_at_idx
  on public.edit_history (updated_at desc);

commit;
