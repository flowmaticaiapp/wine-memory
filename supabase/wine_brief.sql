-- Wine Memory — sommelier brief columns (run once in Supabase SQL Editor).
-- Idempotent. Adds blurb/style/tastes_like/pairs_with to wines so the
-- AI-generated description + chips persist and show on the Wine Detail page.
-- Existing rows get NULL/empty defaults and keep working (the brief is optional).

alter table public.wines add column if not exists blurb       text;
alter table public.wines add column if not exists style       text;
alter table public.wines add column if not exists tastes_like text[] default '{}';
alter table public.wines add column if not exists pairs_with  text[] default '{}';
