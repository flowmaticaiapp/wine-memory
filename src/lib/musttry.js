// musttry.js — the Must Try screen's brain: researched bottle recommendations
// lead; instant personalized grape and region guidance remains available under
// Explore next.
//
// Guidance is built from the same sample-excluded engine as everything else
// that makes a claim about the user (personalWines / tasteSignature /
// regionsYouLove / exploreNext). It renders immediately and the screen is
// complete without research: slow, unavailable, or empty research changes
// nothing above the verified-bottles section.

import { personalWines, tasteSignature, regionsYouLove, exploreNext } from './palate.js';
import { RESEARCH_FIRST_TIMEOUT_MS } from './answerflow.js';

// Same threshold as the Palate gate in main.jsx: below it, claims about "your
// palate" would be built on almost nothing, so the guidance presents itself as
// general starting points instead.
export const PERSONAL_MIN = 5;
export const MUST_TRY_RESEARCH_TIMEOUT_MS = RESEARCH_FIRST_TIMEOUT_MS;

// ── Instant guidance ────────────────────────────────────────────────
// Returns { personalized, count, signature, cards } — cards are
// { kind:'grape'|'region'|'explore', title, why }.
export function mustTryGuidance(wines){
  const mine = personalWines(wines);
  const personalized = mine.length >= PERSONAL_MIN;
  const cards = [];

  if (personalized){
    const sig = tasteSignature(wines);
    for (const g of (sig?.grapes || []).slice(0, 2)){
      cards.push({ kind:'grape', title:g,
        why:'A grape you keep coming back to — worth trying from a producer or region you haven’t met yet.' });
    }
    for (const r of regionsYouLove(wines, 2)){
      cards.push({ kind:'region', title:r.label,
        why: (r.trait ? r.trait[0].toUpperCase()+r.trait.slice(1) : 'A region you rate highly')
          + ` — you’ve rated ${r.buy} bottle${r.buy===1?'':'s'} from here “Buy Again”.` });
    }
    for (const c of exploreNext(wines, sig, 2)){
      cards.push({ kind:'explore', title:`${c.label}, ${c.country}`, why:c.why });
    }
    return { personalized, count: mine.length, signature: sig, cards };
  }

  // Honest general mode: no claims about the user's taste are made from a
  // near-empty cellar. These are general starting points and say so.
  for (const c of exploreNext([], null, 3)){
    cards.push({ kind:'explore', title:`${c.label}, ${c.country}`, why:c.why });
  }
  return { personalized, count: mine.length, signature: null, cards };
}

// ── The taste summary sent to research ──────────────────────────────
// Compact, anonymous, concept-only: grapes, regions, traits. No name, no
// notes, no bottle-level cellar contents — the same privacy rule as the
// sommelier's search queries.
export function tasteSummary(wines){
  const g = mustTryGuidance(wines);
  if (!g.personalized || !g.signature) return '';
  const sig = g.signature;
  const parts = [];
  if (sig.grapes?.length) parts.push(`enjoys ${sig.grapes.slice(0,3).join(', ')}`);
  const regions = regionsYouLove(wines, 3).map(r=>r.label);
  if (regions.length) parts.push(`rates wines from ${regions.join(', ')} highly`);
  if (sig.traits?.length) parts.push(`prefers ${sig.traits.slice(0,3).join(', ')} styles`);
  return parts.join('; ');
}

// ── Client-side belt for the verified-bottle layer ──────────────────
// The Edge Function already filters through its evidence registry; the client
// re-checks the contract so a malformed or stale response can never render a
// bottle without both exact identity support and a real recommendation source.
export function displayableCandidates(response){
  const list = Array.isArray(response?.candidates) ? response.candidates : [];
  const out = [];
  const seen = new Set();
  for (const c of list){
    if (!c || typeof c !== 'object') continue;
    if (!c.producer || !c.name) continue;
    if (!Array.isArray(c.sources) || !c.sources.length) continue;
    const sources = c.sources.filter(s => s && typeof s.url === 'string' && /^https:\/\//i.test(s.url));
    if (!sources.length) continue;
    if (!Array.isArray(c.recommendationSources) || !c.recommendationSources.length) continue;
    const recommendationSources = c.recommendationSources
      .filter(s => s && typeof s.url === 'string' && /^https:\/\//i.test(s.url));
    if (!recommendationSources.length) continue;
    const key = candidateKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    let price = null;
    const p = c.price;
    if (p && typeof p.amount === 'number' && isFinite(p.amount) && p.amount > 0
        && typeof p.merchant === 'string' && p.merchant
        && p.source && typeof p.source.url === 'string'){
      if (/^https:\/\//i.test(p.source.url)) price = { amount:p.amount, merchant:p.merchant, source:p.source };
    }
    // Client belt matching the server boundary: a bottle-specific reason is
    // unverified prose and never renders, even from a stale or rogue response.
    out.push({ producer:c.producer, name:c.name, vintage:c.vintage ? String(c.vintage) : '',
      grape:c.grape||'', region:c.region||'', why:'',
      category:['palate','essential','branch'].includes(c.category) ? c.category : 'essential',
      sources, recommendationSources, price });
    if (out.length >= 6) break;
  }
  return out;
}

export function groupedCandidates(candidates, personalized){
  const list = Array.isArray(candidates) ? candidates : [];
  return {
    palate: personalized ? list.filter(c => c.category === 'palate') : [],
    essential: list.filter(c => c.category === 'essential' || (!c.category && c)),
    branch: list.filter(c => c.category === 'branch'),
  };
}

// ── "Not for me" — explicit user reactions, on-device for now ───────
// Stored per user in localStorage until the reviewed bottle_reactions table
// exists (proposed structure documented in the wishlist migration file).
// Permanent per bottle+vintage for this device; validated on read because
// storage is untrusted input.
export function dismissKeyFor(userId){
  return (typeof userId === 'string' && userId) ? `wm_musttry_notforme_${userId}` : null;
}

export function candidateKey(c){
  const norm = (s)=> String(s ?? '').trim().replace(/\s+/g,' ').toLowerCase();
  return `${norm(c.producer)}|${norm(c.name)}|${norm(c.vintage)}`;
}

function storageOrNull(storage){
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readDismissed(userId, storage){
  const store = storageOrNull(storage);
  const key = dismissKeyFor(userId);
  if (!store || !key) return new Set();
  try {
    const raw = store.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) { store.removeItem(key); return new Set(); }
    return new Set(arr.filter(x => typeof x === 'string').slice(0, 500));
  } catch { return new Set(); }
}

export function addDismissed(userId, candidate, storage){
  const store = storageOrNull(storage);
  const key = dismissKeyFor(userId);
  if (!store || !key) return new Set();
  const set = readDismissed(userId, store);
  set.add(candidateKey(candidate));
  try { store.setItem(key, JSON.stringify([...set])); } catch { /* best-effort */ }
  return set;
}

export function withoutDismissed(candidates, dismissed){
  const d = dismissed || new Set();
  return (candidates || []).filter(c => !d.has(candidateKey(c)));
}
