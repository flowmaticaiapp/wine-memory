// Pure request-sanitising helpers shared by the sommelier Edge Function and
// the node tests. Everything the client sends is untrusted input: every
// string is stripped of control characters and capped, every list is capped,
// every object is rebuilt from a whitelist of fields — nothing the client
// supplied is ever serialised into a model prompt as-is.

export const LIMITS = {
  query: 600,          // the question itself
  context: 600,        // concept-only conversation context
  ownedGrapes: 400,    // the grape tally summary
  ownedEntries: 80,    // owned-wine entries
  grape: 60, region: 120,
  historyTurns: 6, historyText: 300,
};

const VERDICTS = new Set(['buy', 'maybe', 'no', 'totry']);
const INTENTS = new Set(['pairing', 'cellar', 'evaluate', 'shop', 'explain', 'compare', 'discover', 'followup']);
const ROLES = new Set(['user', 'sommelier']);

// A string with control characters (including newlines, which could forge a
// prompt section) collapsed to spaces, trimmed and capped. Non-strings → ''.
export function cleanText(v, max){
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanIntent(v){
  return typeof v === 'string' && INTENTS.has(v) ? v : '';
}

// The last few turns, role-whitelisted and text-capped. Anything malformed is
// dropped, never coerced.
// Malformed entries are filtered BEFORE the cap, so junk can never displace
// real turns; the raw scan itself is bounded.
const SCAN = 200;
export function cleanHistory(v){
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const t of v.slice(-SCAN)){
    if (!t || typeof t !== 'object' || Array.isArray(t)) continue;
    const role = t.role;
    const text = cleanText(t.text, LIMITS.historyText);
    if (ROLES.has(role) && text) out.push({ role, text });
  }
  return out.slice(-LIMITS.historyTurns);
}

// The owned-wine summary: ONLY grape, region and verdict survive, each typed,
// cleaned and capped. Producer names, notes, prices, photos, ids or any other
// field the client happens to send are discarded here, so they can never
// reach the prompt. Entries with nothing usable are dropped.
export function cleanOwned(v){
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const w of v.slice(0, SCAN)){
    if (!w || typeof w !== 'object' || Array.isArray(w)) continue;
    const grape = cleanText(w.grape, LIMITS.grape);
    const region = cleanText(w.region, LIMITS.region);
    const verdict = typeof w.verdict === 'string' && VERDICTS.has(w.verdict) ? w.verdict : '';
    if (!grape && !region) continue;
    const entry = { grape, region };
    if (verdict) entry.verdict = verdict;
    out.push(entry);
    if (out.length >= LIMITS.ownedEntries) break;
  }
  return out;
}

// Everything the sommelier function reads from a request body, in one place.
export function sanitizeSommelierRequest(body){
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const ownedGrapes = cleanText(b.ownedGrapes, LIMITS.ownedGrapes);
  return {
    query: cleanText(b.query, LIMITS.query),
    ownedGrapes: ownedGrapes || 'none yet',
    owned: cleanOwned(b.owned),
    context: cleanText(b.context, LIMITS.context),
    history: cleanHistory(b.history),
    intent: cleanIntent(b.intent),
  };
}
