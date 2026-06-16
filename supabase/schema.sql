-- Wine Memory — Supabase schema (minimal).
-- Run once in the Supabase SQL Editor (Dashboard → SQL → New query → paste → Run).
-- Covers: user-specific wines + pairings, RLS isolation, and a bottle-photos bucket.
-- My Palate is DERIVED in the client from wines + pairings — no table here by design.

-- ── wines ───────────────────────────────────────────────────────────
create table if not exists public.wines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  producer   text,
  name       text not null,
  vintage    text,                         -- text so 'NV' is allowed
  type       text,
  grape      text,
  region     text,
  country    text,
  loc        jsonb,                         -- [lng, lat]
  verdict    text check (verdict in ('buy','maybe','no','totry')),
  tags       text[] default '{}',
  note       text,
  "where"    text,
  source     text,
  price      numeric,
  photo      text,                          -- Storage URL, nullable (honest imagery)
  family     text,
  flavor     jsonb,                          -- {body,acidity,tannin,fruit,oak}
  pairings   text[] default '{}',
  sample     boolean default false,
  added      date default current_date,
  created_at timestamptz default now()
);
create index if not exists wines_user_idx on public.wines (user_id, created_at desc);

-- ── pairings (My Favorite Pairings / pairing history) ───────────────
create table if not exists public.pairings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  dish       text,
  style      text,
  why        text,
  type       text,
  wine_id    uuid references public.wines on delete set null,  -- related_saved_wine_id
  created_at timestamptz default now()
);
create index if not exists pairings_user_idx on public.pairings (user_id, created_at desc);

-- ── dining_experiences (saved Dining Out recommendations) ───────────
create table if not exists public.dining_experiences (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  dish           text,
  place          text,
  dishes         jsonb default '[]'::jsonb,
  wines          jsonb default '[]'::jsonb,
  recommendation jsonb,
  pick_name      text,
  pick_price     numeric,
  created_at     timestamptz default now()
);
create index if not exists dining_user_idx on public.dining_experiences (user_id, created_at desc);

-- ── Row Level Security — each user sees only their own rows ──────────
alter table public.wines               enable row level security;
alter table public.pairings            enable row level security;
alter table public.dining_experiences  enable row level security;

drop policy if exists "own rows" on public.dining_experiences;
create policy "own rows" on public.dining_experiences for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own rows" on public.wines;
create policy "own rows" on public.wines for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own rows" on public.pairings;
create policy "own rows" on public.pairings for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Role grants — let signed-in users touch the tables at all ───────
-- RLS (above) restricts WHICH rows each user sees; these grants let the
-- `authenticated` role reach the tables. `anon` is intentionally NOT granted —
-- the app requires sign-in, so unauthenticated requests get nothing.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.wines               to authenticated;
grant select, insert, update, delete on public.pairings            to authenticated;
grant select, insert, update, delete on public.dining_experiences  to authenticated;

-- ── Storage: bottle photos ──────────────────────────────────────────
-- Public-read bucket (label photos aren't sensitive); writes scoped to the
-- user's own folder:  bottle-photos/{user_id}/{file}.jpg
insert into storage.buckets (id, name, public)
values ('bottle-photos', 'bottle-photos', true)
on conflict (id) do nothing;

drop policy if exists "photos public read"   on storage.objects;
drop policy if exists "photos own insert"     on storage.objects;
drop policy if exists "photos own update"     on storage.objects;
drop policy if exists "photos own delete"     on storage.objects;

create policy "photos public read" on storage.objects for select
  using (bucket_id = 'bottle-photos');

create policy "photos own insert" on storage.objects for insert
  with check (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos own update" on storage.objects for update
  using (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos own delete" on storage.objects for delete
  using (bucket_id = 'bottle-photos' and (storage.foldername(name))[1] = auth.uid()::text);
