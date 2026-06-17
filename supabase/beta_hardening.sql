-- Wine Memory — beta hardening tables (run once in Supabase SQL Editor).
-- Idempotent. Adds: ai_usage (cost/limit logging) + events (lightweight analytics).

-- ── ai_usage: one row per AI request (powers per-user daily limits + monitoring) ──
create table if not exists public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  fn         text not null,                  -- sommelier | wine-search | dining-recommend | menu-vision | label-identify
  kind       text,                           -- optional metadata
  created_at timestamptz default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
drop policy if exists "own rows" on public.ai_usage;
create policy "own rows" on public.ai_usage for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.ai_usage to authenticated;

-- ── events: lightweight product analytics (client fire-and-forget) ──
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  event      text not null,                  -- signup | wine_added | note_added | sommelier_question | dining_opened | dining_saved | label_scan | region_search | region_view
  props      jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists events_event_time on public.events (event, created_at desc);
create index if not exists events_user_time  on public.events (user_id, created_at desc);
alter table public.events enable row level security;
drop policy if exists "own rows" on public.events;
create policy "own rows" on public.events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert on public.events to authenticated;
