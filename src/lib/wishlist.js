// wishlist.js — the Wishlist concept and its data access.
//
// Wishlist is NOT the Unopened cellar filter:
//   * Unopened (wines.verdict='totry') — a bottle the user OWNS but has not
//     tasted or rated yet. Lives in the wines table.
//   * Wishlist — a specific bottle the user does NOT own. Lives in its own
//     table (supabase/migrations/20260830000000_wishlist.sql), so wishlist
//     rows are structurally incapable of entering cellar counts, palate
//     analysis, owned-bottle matching, or sample-exclusion calculations —
//     those all read the wines table, and a wishlist row is never in it.
//
// Items enter through the manual "A wine to try" form (provenance: user) or
// "Save to Wishlist" on a verified Must Try recommendation (provenance:
// source — its evidence records ride along). "I bought this" converts an item
// into a REAL cellar wine (Unopened, never a sample) and resolves the item.
//
// This module is PURE (node-testable). Data access lives in db.js.

export const WISHLIST_COLS = 'id,producer,name,vintage,type,grape,region,country,price_expected,why,recommended_by,source,evidence,status,bought_wine_id,created_at';

export function rowToItem(r){
  return {
    id: r.id, producer: r.producer || '', name: r.name, vintage: r.vintage || '',
    type: r.type || '', grape: r.grape || '', region: r.region || '', country: r.country || '',
    priceExpected: r.price_expected ?? null, why: r.why || '', recommendedBy: r.recommended_by || '',
    source: r.source || 'manual', evidence: Array.isArray(r.evidence) ? r.evidence : [],
    status: r.status || 'active', boughtWineId: r.bought_wine_id || null,
    added: (r.created_at || '').slice(0, 10),
  };
}

export function itemToRow(i){
  return {
    producer: i.producer || null, name: i.name, vintage: i.vintage != null && i.vintage !== '' ? String(i.vintage) : null,
    type: i.type || null, grape: i.grape || '', region: i.region || null, country: i.country || null,
    price_expected: i.priceExpected ?? null, why: i.why || null, recommended_by: i.recommendedBy || null,
    source: i.source === 'musttry' ? 'musttry' : 'manual',
    evidence: (i.source === 'musttry' && Array.isArray(i.evidence) && i.evidence.length) ? i.evidence : null,
  };
}

// ── Duplicate handling ──────────────────────────────────────────────
// Same bottle = same producer + name + vintage, case-insensitively, with
// whitespace collapsed. An empty vintage only matches another empty vintage —
// a 2019 and an NV of the same wine are different bottles.
export function bottleKey(i){
  const norm = (s)=> String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${norm(i.producer)}|${norm(i.name)}|${norm(i.vintage)}`;
}

export function findDuplicate(items, candidate){
  const key = bottleKey(candidate);
  return (items || []).find(i => i.status !== 'bought' && bottleKey(i) === key) || null;
}

// ── "I bought this" — the ONLY path from Wishlist into the cellar ───
// Explicit and lossless where it should be, silent where it must be:
//   verdict 'totry'  -> the bottle is now OWNED and Unopened
//   sample  false    -> a bought bottle is real user data, never a demo
//   price   null     -> price_expected was an expectation, not what was paid;
//                       carrying it over would fabricate a purchase record
//   note    <- why   -> the user's own words travel with the bottle
export function wishlistToCellarWine(item){
  return {
    producer: item.producer || null,
    name: item.name,
    vintage: item.vintage || null,
    type: item.type || 'Red',
    grape: item.grape || '',
    region: item.region || null,
    country: item.country || null,
    verdict: 'totry',
    sample: false,
    price: null,
    note: item.why || '',
    tags: [],
    where: 'home',
    source: 'wishlist',
  };
}

// ── Availability ────────────────────────────────────────────────────
// The wishlist table exists only after its migration has been applied (test
// project first, production only with approval). Until then the screen shows
// an honest unavailable state instead of an error.
export function isMissingTable(error){
  if (!error) return false;
  const code = error.code || '';
  const msg = String(error.message || '');
  return code === '42P01' || code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(msg);
}

