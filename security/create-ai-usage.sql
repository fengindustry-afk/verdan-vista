-- ============================================================================
-- AI usage log — one row per vision-LLM call made by the app (receipt
-- extraction etc.). Written ONLY by edge functions via the service role;
-- clients can read it so Settings can show per-model usage bars.
--
-- Note: this meters what THIS app consumes. Other apps sharing the same
-- Google/xAI API key are not visible here — check the provider consoles for
-- the full account picture.
--
-- Run in the Supabase SQL editor. Safe to re-run (idempotent).
-- ============================================================================

begin;

create table if not exists public.ai_usage_log (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  user_id       uuid,
  user_email    text,
  purpose       text not null,             -- e.g. 'receipt-extract'
  provider      text not null,             -- 'gemini' | 'grok'
  model         text,                      -- exact model id billed
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  ok            boolean not null default true,
  ms            integer,                   -- provider round-trip latency
  error         text                       -- truncated failure message
);

create index if not exists ai_usage_log_created_at_idx
  on public.ai_usage_log (created_at desc);

alter table public.ai_usage_log enable row level security;
alter table public.ai_usage_log force row level security;

-- Read-only for signed-in users (usage dashboards). No insert/update/delete
-- policies: only the service role (which bypasses RLS) writes rows, so a
-- browser session can never forge or scrub usage history.
drop policy if exists ai_usage_select on public.ai_usage_log;
create policy ai_usage_select on public.ai_usage_log
  for select to authenticated using (true);

commit;
