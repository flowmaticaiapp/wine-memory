-- Wine Memory — dining_experiences table (run once in Supabase SQL Editor).
-- Persists Dining Out recommendations so they survive refresh / re-login.
-- Idempotent: safe to run more than once.

create table if not exists public.dining_experiences (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  dish           text,
  place          text,                          -- restaurant name (optional)
  dishes         jsonb default '[]'::jsonb,     -- menu dishes read (array of strings)
  wines          jsonb default '[]'::jsonb,     -- wine list read/pasted (array of objects)
  recommendation jsonb,                          -- the AI recommendation result
  pick_name      text,                          -- best matched wine on the list, if any
  pick_price     numeric,
  created_at     timestamptz default now()
);
create index if not exists dining_user_idx on public.dining_experiences (user_id, created_at desc);

alter table public.dining_experiences enable row level security;

drop policy if exists "own rows" on public.dining_experiences;
create policy "own rows" on public.dining_experiences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.dining_experiences to authenticated;
