// candidates.js — the candidate-provider boundary.
//
// WHY THIS EXISTS
// The ranking engine must not know where a candidate came from. Today the only
// providers are the user's own cellar and Wine Memory's style guidance. Later
// there may be a researched catalogue, a participating store's inventory, a
// restaurant list or an imported shopping list. Each of those changes WHAT is
// available; none of them should change HOW a wine is judged against a meal.
//
// So a provider's only job is to return candidates in the shape below. The
// ranker sees that shape and nothing else — no store IDs, no fetch logic, no
// knowledge that a store exists at all.
//
// NOTHING RETAILER-FACING IS BUILT HERE. There are no store tables, no
// integrations, no authentication and no network calls. `fromStoreInventory`
// takes an array that a caller supplies, which is what lets the boundary be
// tested now and connected later without touching the ranker.

// ── The candidate shape ─────────────────────────────────────────────
//
//   id          stable within its source
//   producer    winery
//   name        wine or cuvée
//   vintage     year, or 'NV'
//   grape       grape or blend, as recorded
//   region      region or appellation
//   country
//   type        Red | White | Rosé | Sparkling | …
//   price       number, or null when unknown
//   source      'cellar' | 'style' | 'catalog' | 'store' | 'list'
//   provenance  'user' | 'rule' | 'ai' | 'source' — how this candidate is known
//   verdict     cellar only: the user's own rating
//   availability  store only, and NEVER an intrinsic wine fact:
//                 { merchantId, sku, status, price, salePrice, location, updatedAt }
//   placement     store only: { sponsored, featured, staffPick, bestValue, onSale, newArrival }
//
// Two rules the shape enforces by construction:
//   1. Retailer price, stock and shelf data live under `availability`, never on
//      the wine. A catalogue wine is the same wine in every shop.
//   2. `placement` is carried separately from everything the ranker reads, so a
//      commercial relationship cannot reach the organic score. See rankCandidates.

const wordsOf = (s)=> String(s||'').toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);

// Whole-word grape matching. Loose first-word matching turned "Pinot Noir" into
// "pinot" and matched a Pinot Grigio; it must not come back, here or anywhere.
export function matchesGrape(candidate, targets){
  const hay = new Set([...wordsOf(candidate.grape), ...wordsOf(candidate.name)]);
  return (targets||[]).some(t=>{
    const need = wordsOf(t);
    return need.length>0 && need.every(w=>hay.has(w));
  });
}

// ── Providers ───────────────────────────────────────────────────────

// The user's own bottles. Samples are excluded by the caller, which owns the
// personalisation pool; this provider only reshapes.
export function fromCellar(wines){
  return (wines||[]).map(w=>({
    id:w.id, producer:w.producer, name:w.name, vintage:w.vintage, grape:w.grape,
    region:w.region, country:w.country, type:w.type, price:w.price ?? null,
    source:'cellar', provenance:'user', verdict:w.verdict,
  }));
}

// Wine Memory's own guidance, expressed as buyable styles rather than bottles.
// These carry no producer and no vintage on purpose — nothing here is a
// specific bottle, so nothing here can be mistaken for one.
export function fromStyleGuidance(result){
  const p = (result && result.primary) || {};
  const rows = [
    { grape:p.grape, region:p.deeperTitle || null, lead:true },
    ...((result && result.others) || []).map(o=>({ grape:o.grape, region:null, lead:false })),
  ].filter(r=>r.grape);
  return rows.map((r,i)=>({
    id:`style:${r.grape}`, producer:null, name:r.grape, vintage:null, grape:r.grape,
    region:r.region, country:null, type:null, price:null,
    source:'style', provenance:'rule', lead:r.lead, rank:i,
  }));
}

// FUTURE. A participating store's current offer for catalogue wines. The items
// are supplied by the caller — this function performs no lookup and knows no
// merchant. Anything the store says about stock, price or shelf goes under
// `availability`; anything commercial goes under `placement`.
//
// The AI may rank and explain these candidates. It must never add a bottle that
// is not in this list, which is exactly why the list is passed in rather than
// generated.
export function fromStoreInventory(items){
  return (items||[]).map(it=>({
    id:it.sku, producer:it.producer, name:it.name, vintage:it.vintage, grape:it.grape,
    region:it.region, country:it.country, type:it.type,
    price: it.salePrice ?? it.price ?? null,
    source:'store', provenance: it.catalogWineId ? 'source' : 'ai',
    catalogWineId: it.catalogWineId ?? null,
    availability:{
      merchantId:it.merchantId, sku:it.sku, status:it.status ?? 'unknown',
      price:it.price ?? null, salePrice:it.salePrice ?? null,
      location:it.location ?? null, updatedAt:it.updatedAt ?? null,
    },
    placement:{
      sponsored:!!it.sponsored, featured:!!it.featured, staffPick:!!it.staffPick,
      bestValue:!!it.bestValue, onSale: it.salePrice!=null, newArrival:!!it.newArrival,
    },
  }));
}

// ── Ranking ─────────────────────────────────────────────────────────

const VERDICT_BONUS = { buy:3, totry:1, maybe:0, no:-4 };

// Score a candidate against the pairing and the user's preferences.
//
// `placement` is deliberately not read. A sponsored bottle earns exactly the
// score its fit earns; commercial standing may change how a result is LABELLED,
// never where it ranks. That separation is the whole point of keeping the two
// fields apart, and the test suite asserts it.
export function scoreCandidate(candidate, request){
  const targets = request.targetGrapes || [];
  const avoid = request.avoidGrapes || [];
  if (avoid.length && matchesGrape(candidate, avoid)) return null;   // excluded outright

  let score = 0;
  if (matchesGrape(candidate, targets)) score += 10;
  else if (candidate.source === 'style') score += 6;   // guidance is the style itself
  else return null;                                    // a bottle that does not fit is not a candidate

  // The user's own history, where we have it.
  if (candidate.source === 'cellar' && candidate.verdict in VERDICT_BONUS) {
    score += VERDICT_BONUS[candidate.verdict];
  }
  // Style guidance keeps the order the rules put it in.
  if (candidate.source === 'style') score += (candidate.lead ? 2 : 0) - (candidate.rank || 0) * 0.1;

  // Preferred grapes and regions the user has told us about.
  if ((request.preferredGrapes||[]).length && matchesGrape(candidate, request.preferredGrapes)) score += 2;

  // Availability is a requirement, not a preference — see applyRequirements.
  return score;
}

// Budget and availability are hard requirements applied AFTER scoring, so an
// out-of-stock or over-budget bottle is removed rather than quietly outranked.
export function applyRequirements(candidates, request){
  return candidates.filter(c=>{
    if (request.maxPrice != null && c.price != null && c.price > request.maxPrice) return false;
    if (request.inStockOnly && c.availability && c.availability.status === 'out-of-stock') return false;
    return true;
  });
}

// THE ENGINE. Takes candidates from any provider, or several at once, and
// returns them ranked. It never fetches, never knows a merchant, and never
// reads `placement`.
export function rankCandidates(request, candidates){
  const scored = [];
  for (const c of applyRequirements(candidates||[], request||{})){
    const score = scoreCandidate(c, request||{});
    if (score == null) continue;
    scored.push({ ...c, score });
  }
  return scored.sort((a,b)=> b.score - a.score || String(a.name||'').localeCompare(String(b.name||'')));
}
