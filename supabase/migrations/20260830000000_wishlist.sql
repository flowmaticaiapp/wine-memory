-- Wine Memory — Wishlist (additive migration; FILE ONLY until approved).
--
-- DO NOT RUN without explicit approval. When approved, run first on the TEST
-- Supabase project per PREVIEW_RUNBOOK.md, never directly on production.
--
-- WHAT THIS IS. Wishlist is a separate concept from the cellar:
--   * Unopened (wines.verdict = 'totry')  — a bottle the user OWNS but has
--     not tasted or rated. Lives in public.wines. Unchanged by this file.
--   * Wishlist                            — a specific bottle the user does
--     NOT own. Lives here, in its own table.
--
-- WHY A SEPARATE TABLE, not a flag on wines: every derivation in the app —
-- cellar counts, palate analysis, taste signature, owned-bottle matching,
-- sample exclusion — reads public.wines. A wishlist row in its own table is
-- structurally incapable of leaking into any of those calculations; no filter
-- can be forgotten, because there is nothing to filter out.
--
-- Additive only: no existing table, column, policy, or bucket is touched.

create table if not exists public.wishlist (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users on delete cascade,
  producer       text,
  name           text not null,
  vintage        text,                         -- text so 'NV' is allowed (matches wines)
  type           text,
  grape          text,
  region         text,
  country        text,
  price_expected numeric,                      -- "price to expect" — user-entered, never a market claim
  why            text,                         -- why it's worth trying
  recommended_by text,                         -- who recommended it
  source         text not null default 'manual'
                   check (source in ('manual','musttry')),
  -- When saved from a verified Must Try recommendation, the supporting source
  -- records ride along so the item's provenance is auditable later:
  -- [{ title, url }, ...]. NULL for manual entries (provenance: user).
  evidence       jsonb,
  status         text not null default 'active'
                   check (status in ('active','bought')),
  -- "I bought this": the cellar wine the item converted into. The wishlist row
  -- is kept (status='bought') as history rather than silently deleted.
  bought_wine_id uuid references public.wines on delete set null,
  resolved_at    timestamptz,
  created_at     timestamptz default now()
);
create index if not exists wishlist_user_idx on public.wishlist (user_id, created_at desc);

-- ── Row Level Security — each user sees only their own wishlist ─────
alter table public.wishlist enable row level security;

drop policy if exists "own rows" on public.wishlist;
create policy "own rows" on public.wishlist for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.wishlist to authenticated;
-- `anon` is intentionally NOT granted — the app requires sign-in.

-- ── "I bought this" — atomic + idempotent purchase ──────────────────
-- One transaction: insert the cellar wine AND resolve the wishlist item, or
-- neither. Idempotent: calling it again for an already-bought item returns
-- the SAME wine instead of creating a duplicate, so a client that lost the
-- response can safely retry.
--
-- SECURITY INVOKER (the default) is deliberate: the function runs AS the
-- calling user, so RLS on both tables applies, and the explicit
-- user_id = auth.uid() predicates are a second lock on the same door.
-- The wine's type comes from the item, or from the caller's explicit choice —
-- an unknown type is refused, never defaulted to 'Red'.
create or replace function public.buy_wishlist_item(p_item_id uuid, p_type text default null)
returns public.wines
language plpgsql
as $$
declare
  v_item public.wishlist%rowtype;
  v_wine public.wines%rowtype;
  v_type text;
begin
  select * into v_item from public.wishlist
    where id = p_item_id and user_id = auth.uid()
    for update;                       -- serialises concurrent double-taps
  if not found then
    raise exception 'wishlist item not found';
  end if;

  if v_item.status = 'bought' then    -- idempotent replay: hand back the wine
    select * into v_wine from public.wines
      where id = v_item.bought_wine_id and user_id = auth.uid();
    if found then return v_wine; end if;
    raise exception 'wishlist item was already bought';
  end if;

  v_type := coalesce(nullif(v_item.type, ''), nullif(p_type, ''));
  if v_type is null then
    raise exception 'wine type required before conversion';
  end if;

  insert into public.wines
    (user_id, producer, name, vintage, type, grape, region, country,
     verdict, sample, price, note, tags, "where", source)
  values
    (auth.uid(), v_item.producer, v_item.name, v_item.vintage, v_type,
     coalesce(v_item.grape, ''), v_item.region, v_item.country,
     'totry',                         -- owned and Unopened
     false,                           -- a bought bottle is never a sample
     null,                            -- price_expected is not a purchase price
     coalesce(v_item.why, ''), '{}', 'home', 'wishlist')
  returning * into v_wine;

  update public.wishlist
     set status = 'bought', bought_wine_id = v_wine.id, resolved_at = now()
   where id = v_item.id;

  return v_wine;
end $$;

revoke all on function public.buy_wishlist_item(uuid, text) from public;
grant execute on function public.buy_wishlist_item(uuid, text) to authenticated;

-- ── User-isolation verification (run on the TEST project after applying) ──
-- 1. Sign in as user A, insert a wishlist row through the app.
-- 2. Sign in as user B (second test account): SELECT * FROM wishlist must
--    return zero rows, and an UPDATE/DELETE against A's row id must affect
--    zero rows (RLS filters it out before the write).
-- 3. In the SQL editor as service role: confirm the row's user_id = A.
-- 4. As user B, call buy_wishlist_item(<A's item id>): must fail with
--    'wishlist item not found' (RLS + the explicit ownership predicate).
-- 5. As user A, call buy_wishlist_item twice for the same item (simulating a
--    double-tap or a retry after a lost response): the second call must
--    return the SAME wine id, and the wines table must hold exactly one new
--    row for it.
-- 6. As user A, buy an item with no type and pass no type: must fail with
--    'wine type required before conversion'; nothing is inserted.
-- 7. Client tests (tests/wishlist.test.js) additionally prove wishlist rows
--    never enter the wines list, cellar counts, or palate calculations, and
--    that the client retry path never issues more than one retry.

-- ── DOCUMENTED, NOT CREATED: proposed bottle_reactions table ────────
-- "Not for me" on a Must Try recommendation should eventually be a permanent,
-- explicit user reaction (per the product standard: genuine user reactions may
-- shape personalization). Until this structure is reviewed and approved, the
-- app stores dismissals per-user on the device only. Proposed shape:
--
--   create table public.bottle_reactions (
--     id         uuid primary key default gen_random_uuid(),
--     user_id    uuid not null default auth.uid() references auth.users on delete cascade,
--     producer   text not null,
--     name       text not null,
--     vintage    text,                          -- reaction is per bottle+vintage
--     reaction   text not null check (reaction in ('not_for_me')),
--     context    text,                          -- e.g. 'musttry'
--     created_at timestamptz default now(),
--     unique (user_id, producer, name, vintage, reaction)
--   );
--   -- plus the same RLS "own rows" policy and authenticated-only grants.
--
-- Not created here because it is not needed for this bundle to function and
-- deserves its own review (retention, undo, and whether dismissals decay).
