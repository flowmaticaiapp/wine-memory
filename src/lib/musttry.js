// musttry.js — the Must Try screen's brain: instant personalized guidance from
// the user's REAL palate data, plus the client-side rules for the optional
// verified-bottle layer that research adds in the background.
//
// Guidance is built from the same sample-excluded engine as everything else
// that makes a claim about the user (personalWines / tasteSignature /
// regionsYouLove / exploreNext). It renders immediately and the screen is
// complete without research: slow, unavailable, or empty research changes
// nothing above the verified-bottles section.

import { personalWines, tasteSignature, regionsYouLove, exploreNext } from './palate.js';

// Same threshold as the Palate gate in main.jsx: below it, claims about "your
// palate" would be built on almost nothing, so the guidance presents itself as
// general starting points instead.
export const PERSONAL_MIN = 5;

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
// re-checks the contract so a malformed or stale response can never render an
// unverified bottle or an unsourced price.
export function displayableCandidates(response){
  const list = Array.isArray(response?.candidates) ? response.candidates : [];
  const out = [];
  for (const c of list){
    if (!c || typeof c !== 'object') continue;
    if (!c.producer || !c.name || !c.vintage) continue;
    if (!Array.isArray(c.sources) || !c.sources.length) continue;
    const sources = c.sources.filter(s => s && typeof s.url === 'string' && /^https:\/\//i.test(s.url));
    if (!sources.length) continue;
    let price = null;
    const p = c.price;
    if (p && typeof p.amount === 'number' && isFinite(p.amount) && p.amount > 0
        && typeof p.merchant === 'string' && p.merchant
        && p.source && typeof p.source.url === 'string'){
      price = { amount:p.amount, merchant:p.merchant, source:p.source };
    }
    out.push({ producer:c.producer, name:c.name, vintage:String(c.vintage),
      grape:c.grape||'', region:c.region||'', why:c.why||'', sources, price });
    if (out.length >= 3) break;
  }
  return out;
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
