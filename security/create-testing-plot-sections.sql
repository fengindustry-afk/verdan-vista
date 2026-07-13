-- ============================================================================
-- Testing Plot Sections F & H — new document-store tables
--   plot_observations : Section F (Pemerhatian Visual) — dated field notes
--   plot_applications : Section H (Rekod Aplikasi Produk) — product application log
--
-- Sections A–E already have tables (trees / readings / soil_samples); G is a
-- computed comparison (no storage). Shape (id text, data jsonb, updated_at) like
-- every other collection. Run in the Supabase SQL editor. Idempotent.
-- Apply security/rls.sql first (uses public.has_role()).
-- ============================================================================

begin;

create table if not exists public.plot_observations (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.plot_applications (
  id         text primary key,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array['plot_observations', 'plot_applications'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);

    -- Drop the legacy wide-open policy the shared schema recreates per table.
    execute format('drop policy if exists anon_all on public.%I;', t);

    execute format('drop policy if exists %1$s_select on public.%1$I;', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (auth.uid() is not null);', t);

    execute format('drop policy if exists %1$s_insert on public.%1$I;', t);
    execute format('create policy %1$s_insert on public.%1$I for insert to authenticated with check (public.has_role(''Operator'',''Manager'',''Admin''));', t);

    execute format('drop policy if exists %1$s_update on public.%1$I;', t);
    execute format('create policy %1$s_update on public.%1$I for update to authenticated using (public.has_role(''Operator'',''Manager'',''Admin'')) with check (public.has_role(''Operator'',''Manager'',''Admin''));', t);

    execute format('drop policy if exists %1$s_delete on public.%1$I;', t);
    execute format('create policy %1$s_delete on public.%1$I for delete to authenticated using (public.has_role(''Manager'',''Admin''));', t);
  end loop;
end $$;

commit;
