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

// Evidence stored on a wishlist row is CLIENT-WRITTEN data coming back from
// the database — retained for audit, but it can never make the row "verified":
// any client could write source='musttry' with arbitrary evidence, so the UI
// must not derive a verification claim from these fields (provenance `source`
// requires a server-written record, which does not exist yet). This sanitizer
// additionally drops anything that is not a well-formed https reference.
export function sanitizeEvidence(evidence){
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter(e => e && typeof e === 'object'
      && typeof e.title === 'string' && e.title.trim()
      && typeof e.url === 'string' && /^https:\/\//i.test(e.url))
    .slice(0, 8)
    .map(e => ({ title: e.title.trim(), url: e.url }));
}

export function rowToItem(r){
  return {
    id: r.id, producer: r.producer || '', name: r.name, vintage: r.vintage || '',
    type: r.type || '', grape: r.grape || '', region: r.region || '', country: r.country || '',
    priceExpected: r.price_expected ?? null, why: r.why || '', recommendedBy: r.recommended_by || '',
    source: r.source || 'manual', evidence: sanitizeEvidence(r.evidence),
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

// ── Wine type ───────────────────────────────────────────────────────
// The type travels Must Try → Wishlist → cellar and an UNKNOWN type is a
// state, never "Red". This deterministic inference reads grape and name; when
// nothing matches it returns '' and the UI must ask the user before a cellar
// conversion.
const WHITE_GRAPES = ['chardonnay','sauvignon blanc','riesling','chenin','pinot grigio','pinot gris','pinot blanc','albarino','viognier','gruner veltliner','gruner','vermentino','gewurztraminer','assyrtiko','muscadet','melon de bourgogne','verdejo','garganega','semillon','marsanne','roussanne','trebbiano','cortese','falanghina','fiano','godello','torrontes','verdicchio','savagnin','furmint','moschofilero','picpoul','vinho verde','muscat','muller-thurgau','sylvaner','silvaner','arneis','greco','vermentino'];
const RED_GRAPES = ['cabernet sauvignon','cabernet franc','merlot','pinot noir','syrah','shiraz','grenache','garnacha','malbec','zinfandel','primitivo','sangiovese','nebbiolo','barbera','tempranillo','gamay','mourvedre','monastrell','carignan','nero d','frappato','montepulciano','touriga','bobal','dolcetto','aglianico','mencia','listan prieto','carmenere','petite sirah','petit verdot','tannat','cinsault','corvina','lagrein','blaufrankisch','zweigelt','xinomavro','agiorgitiko','monica','nerello','trousseau','poulsard','schiava','saperavi'];
const fold = (s)=> String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function inferWineType({ grape, name, region } = {}){
  const hay = fold([grape, name, region].filter(Boolean).join(' '));
  if (!hay) return '';
  // Sparkling is checked BEFORE rosé so a sparkling rosé files as Sparkling.
  if (/champagne|sparkling|\bbrut\b|\bcava\b|prosecco|cremant|spumante|franciacorta|pet[- ]?nat|lambrusco|sekt/.test(hay)) return 'Sparkling';
  if (/\bport\b|\bporto\b|\bsherry\b|\bmadeira\b|\bmarsala\b|\bvermouth\b|\boloroso\b|\bamontillado\b|\bpedro ximenez\b|\btawny\b/.test(hay)) return 'Fortified';
  if (/\bros[e]\b|rosato|rosado|\brose\s+wine\b/.test(hay)) return 'Rosé';
  const g = fold(grape);
  if (g){
    if (WHITE_GRAPES.some(w => g.includes(w))) return 'White';
    if (RED_GRAPES.some(r => g.includes(r))) return 'Red';
  }
  // A grape word appearing in the NAME counts too (e.g. "Estate Chardonnay").
  if (WHITE_GRAPES.some(w => hay.includes(w))) return 'White';
  if (RED_GRAPES.some(r => hay.includes(r))) return 'Red';
  return '';   // unknown stays unknown — never defaulted
}

// True when a cellar conversion cannot proceed without the user choosing the
// wine's type first.
export function needsTypeSelection(item){
  return !(item && item.type);
}

// ── "I bought this" — the ONLY path from Wishlist into the cellar ───
// The authoritative implementation is the buy_wishlist_item() database
// function in the migration (atomic + idempotent). This mapping documents and
// tests the intended field semantics, and the SQL mirrors it:
//   verdict 'totry'  -> the bottle is now OWNED and Unopened
//   sample  false    -> a bought bottle is real user data, never a demo
//   price   null     -> price_expected was an expectation, not what was paid;
//                       carrying it over would fabricate a purchase record
//   note    <- why   -> the user's own words travel with the bottle
//   type             -> the item's type, or the user's explicit choice;
//                       an unknown type REFUSES conversion, never becomes Red
export function wishlistToCellarWine(item, chosenType){
  const type = item.type || chosenType || '';
  if (!type){
    const e = new Error('wine type required before conversion');
    e.needsType = true;
    throw e;
  }
  return {
    producer: item.producer || null,
    name: item.name,
    vintage: item.vintage || null,
    type,
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

// ── Purchase orchestration ──────────────────────────────────────────
// `rpc` performs the atomic server-side purchase (buy_wishlist_item): insert
// the cellar wine and resolve the item in ONE transaction, returning the wine
// — and calling it again for an already-bought item returns the SAME wine
// (idempotent), so a retry after a lost response can never create a duplicate.
// This orchestrator adds exactly one retry for transient failures; permanent
// errors surface to the caller.
export function isTransientError(e){
  if (!e) return false;
  if (e.transient === true) return true;
  const msg = String(e.message || '');
  return /network|fetch|timeout|timed out|socket|connection|load failed|failed to fetch/i.test(msg);
}

export async function purchaseWishlistItem(rpc, itemId, chosenType){
  try {
    return await rpc(itemId, chosenType);
  } catch(e){
    if (!isTransientError(e)) throw e;
    // The first call may or may not have committed; the server function is
    // idempotent either way, so one retry is safe and never duplicates.
    return await rpc(itemId, chosenType);
  }
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
