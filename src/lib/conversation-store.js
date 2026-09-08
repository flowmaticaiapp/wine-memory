// conversation-store.js — the sommelier conversation, kept per user.
//
// A conversation is the thread of questions and answers plus the CONTEXT that
// lets a follow-up ("why rosé instead of Riesling?", "something under $25",
// "do I already own something?") keep the meal, bottle, budget and colour the
// user already described. It lives in localStorage so a locked phone or a dead
// spot in a shop does not lose it, under the same rules as the answer cache:
//
//   * user-scoped key — no user id, no read and no write; another account on
//     the same device cannot see this one's thread;
//   * validated as UNTRUSTED input on read — anything on the device can write
//     to storage, so a record that fails the shape check is discarded, never
//     rendered;
//   * bounded — a TTL (a conversation is for tonight), a cap on turns, and a
//     cap on every string, so storage can neither grow without limit nor
//     smuggle an oversized payload back into the screen;
//   * cleared on sign-out.
//
// The stale-response guard also lives here because it is part of the same
// contract: a late response from an earlier question may never overwrite a
// newer answer. `turnGuard()` hands out a token per question; a response is
// applied only while its token is still the latest.


export const CONVERSATION_TTL = 1000 * 60 * 60 * 12;   // tonight, like the answer cache
export const MAX_TURNS = 24;
const MAX_TEXT = 600;
const MAX_LIST = 12;
const VERSION = 1;

export function conversationKeyFor(userId){
  return (typeof userId === 'string' && userId) ? `wm_sommelier_conversation_${userId}` : null;
}

export const INTENTS = ['pairing','cellar','evaluate','shop','explain','compare','discover','followup'];
const ROLES = ['user','sommelier'];
const CONTEXT_STRINGS = ['dishQuery','dishLabel','protein','preparation','sauce','cuisine','occasion','heat','body','color','ruleId','bottleText','grapeText'];
const CONTEXT_LISTS = ['modifiers','dislikeColors','toppings','preferences'];

const str = (v, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : null);

// A fresh, empty conversation.
export function emptyConversation(now = Date.now()){
  return { v: VERSION, at: now, turns: [], context: {}, current: null };
}

// Whitelist-and-bound the context object. Unknown keys are dropped; every
// string and list is capped. Returns null if the input is not an object.
export function sanitizeContext(ctx){
  if (!ctx || typeof ctx !== 'object' || Array.isArray(ctx)) return null;
  const out = {};
  for (const k of CONTEXT_STRINGS){
    const v = str(ctx[k], 200);
    if (v) out[k] = v;
  }
  for (const k of CONTEXT_LISTS){
    if (Array.isArray(ctx[k])){
      const list = ctx[k].filter(x => typeof x === 'string' && x).map(x => x.slice(0, 120)).slice(0, MAX_LIST);
      if (list.length) out[k] = list;
    }
  }
  if (typeof ctx.budget === 'number' && isFinite(ctx.budget) && ctx.budget > 0) out.budget = ctx.budget;
  if (ctx.cellarOnly === true) out.cellarOnly = true;
  if (ctx.availability === true) out.availability = true;
  if (typeof ctx.vintage === 'string' && /^(19|20)\d{2}$|^NV$/.test(ctx.vintage)) out.vintage = ctx.vintage;
  return out;
}

// ── Deep sanitisation of a stored answer ────────────────────────────
// A restored answer is rebuilt field by field from a whitelist: every string
// capped, every list capped and filtered, every nested object re-validated,
// every enum checked, only https source URLs kept. Anything malformed is
// removed; if what remains cannot render honestly, the whole answer is
// rejected (null). The screen only ever sees the cleaned copy.

const A = {                                    // caps
  text: 4000, dish: 200, ruleId: 80, grape: 80, why: 600, title: 200, deeper: 600, clue: 200,
  note: 400, factor: 200, label: 60, value: 200, short: 24, bottle: 200, reason: 600,
  lookFor: 3, matchGrapes: 8, others: 2, avoid: 10, sources: 8, factors: 20, choices: 6,
};
const COLORS = new Set(['red', 'white', 'rose', 'sparkling', 'fortified']);
const BASES = new Set(['rule', 'researched', 'no_evidence', 'unavailable', 'unreachable', 'unusable', 'ai', 'cellar']);
const STATUSES = new Set(['researched', 'no_evidence', 'unavailable']);
const OFFLINE = new Set(['unreachable', 'unusable']);
const ADJUSTED = new Set(['heat', 'color']);
const MOODS = new Set(['light', 'rich', 'bold', 'different', 'decide']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const strList = (v, max, each) => (Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.slice(0, each)).slice(0, max) : []);
const flag = (v) => v === true;
const oneOf = (v, set) => (typeof v === 'string' && set.has(v) ? v : undefined);
const put = (o, k, v) => { if (v !== undefined && v !== '' && v !== null && !(Array.isArray(v) && !v.length)) o[k] = v; };

// Only well-formed https sources with a string title survive.
export function sanitizeSources(v){
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const s of v){
    if (!isObj(s)) continue;
    if (typeof s.url !== 'string' || typeof s.title !== 'string' || !s.title.trim()) continue;
    let url;
    try { url = new URL(s.url); } catch { continue; }
    if (url.protocol !== 'https:') continue;
    out.push({ title: s.title.slice(0, A.title), url: url.href.slice(0, 2000) });
    if (out.length >= A.sources) break;
  }
  return out;
}

function sanitizePrimary(p){
  if (!isObj(p)) return null;
  const grape = text(p.grape, A.grape).trim();
  if (!grape) return null;
  const out = { grape };
  put(out, 'why', text(p.why, A.why));
  put(out, 'deeperTitle', text(p.deeperTitle, A.title));
  put(out, 'deeper', text(p.deeper, A.deeper));
  put(out, 'lookFor', strList(p.lookFor, A.lookFor, A.clue));
  put(out, 'matchGrapes', strList(p.matchGrapes, A.matchGrapes, A.grape));
  put(out, 'bottle', text(p.bottle, A.bottle));
  // bottleWhy is unverified prose by contract and never renders; drop it.
  return out;
}

function sanitizeOthers(v){
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const o of v){
    if (!isObj(o)) continue;
    const grape = text(o.grape, A.grape).trim();
    if (!grape) continue;
    const item = { grape };
    put(item, 'direction', text(o.direction, A.label));
    put(item, 'why', text(o.why, A.why));
    out.push(item);
    if (out.length >= A.others) break;
  }
  return out;
}

function sanitizeChoices(v){
  if (!Array.isArray(v)) return [];
  const out = [];
  for (const c of v){
    if (!isObj(c)) continue;
    const label = text(c.label, A.label).trim();
    const value = typeof c.value === 'number' && isFinite(c.value) ? c.value : text(c.value, A.value).trim();
    if (!label || value === '') continue;
    out.push({ label, value });
    if (out.length >= A.choices) break;
  }
  return out;
}

function sanitizePairing(d){
  const primary = sanitizePrimary(d.primary);
  if (!primary) return null;
  const out = { mode:'pairing', primary, others: sanitizeOthers(d.others) };
  put(out, 'dish', text(d.dish, A.dish));
  put(out, 'ruleId', text(d.ruleId, A.ruleId));
  if (typeof d.matched === 'boolean') out.matched = d.matched;
  put(out, 'avoid', strList(d.avoid, A.avoid, A.grape));
  put(out, 'avoidNote', text(d.avoidNote, A.note));
  put(out, 'sources', sanitizeSources(d.sources));
  put(out, 'researchStatus', oneOf(d.researchStatus, STATUSES));
  put(out, 'basis', oneOf(d.basis, BASES));
  if (typeof d.limit === 'number' && isFinite(d.limit) && d.limit > 0) out.limit = d.limit;
  if (flag(d.enriched)) out.enriched = true;
  if (flag(d.offline)) out.offline = true;
  put(out, 'offlineReason', oneOf(d.offlineReason, OFFLINE));
  if (flag(d.guidedTonight)) out.guidedTonight = true;
  put(out, 'guidedMood', oneOf(d.guidedMood, MOODS));
  put(out, 'tonightMeal', text(d.tonightMeal, A.label));
  put(out, 'tonightReason', text(d.tonightReason, A.reason));
  if (flag(d.leadWithCellar)) out.leadWithCellar = true;
  put(out, 'cellarColor', oneOf(d.cellarColor, COLORS));
  put(out, 'cellarDislike', strList(d.cellarDislike, 5, 12).filter(c => COLORS.has(c)));
  put(out, 'adjusted', oneOf(d.adjusted, ADJUSTED));
  put(out, 'swappedTo', oneOf(d.swappedTo, COLORS));
  return out;
}

function sanitizeWritten(d, mode){
  const body = text(d.text, A.text);
  if (!body.trim()) return null;
  const out = { mode, text: body };
  put(out, 'sources', sanitizeSources(d.sources));
  put(out, 'basis', oneOf(d.basis, BASES));
  if (mode === 'explanation'){
    put(out, 'kind', text(d.kind, A.short));
    put(out, 'factors', strList(d.factors, A.factors, A.factor));
    put(out, 'choices', sanitizeChoices(d.choices));
    if (flag(d.offerResearch)) out.offerResearch = true;
  }
  return out;
}

function sanitizeCellar(d){
  const pairing = isObj(d.pairing) && d.pairing.mode === 'pairing' ? sanitizePairing(d.pairing) : null;
  if (!pairing) return null;
  const out = { mode:'cellar', pairing };
  const options = {};
  if (isObj(d.options)){
    put(options, 'color', oneOf(d.options.color, COLORS));
    put(options, 'dislikeColors', strList(d.options.dislikeColors, 5, 12).filter(c => COLORS.has(c)));
    if (typeof d.options.limit === 'number' && isFinite(d.options.limit) && d.options.limit > 0) options.limit = d.options.limit;
  }
  out.options = options;
  put(out, 'note', text(d.note, A.note));
  if (isObj(d.lead)){
    const lead = {};
    put(lead, 'producer', text(d.lead.producer, 120));
    put(lead, 'name', text(d.lead.name, 120));
    put(lead, 'vintage', text(d.lead.vintage, 10));
    if (Object.keys(lead).length) out.lead = lead;
  }
  return out;
}

// The cleaned, bounded copy of a stored answer — or null to reject it.
export function sanitizeAnswer(d){
  if (!isObj(d)) return null;
  switch (d.mode){
    case 'pairing':     return sanitizePairing(d);
    case 'answer':      return sanitizeWritten(d, 'answer');
    case 'explanation': return sanitizeWritten(d, 'explanation');
    case 'cellar':      return sanitizeCellar(d);
    default:            return null;
  }
}

// Boolean view of the same check, kept for callers that only need yes/no.
export function isValidConversationData(d){
  return sanitizeAnswer(d) !== null;
}

function validTurn(t){
  if (!t || typeof t !== 'object') return null;
  if (!ROLES.includes(t.role)) return null;
  if (typeof t.at !== 'number') return null;
  const text = str(t.text);
  if (typeof text !== 'string') return null;
  const out = { role: t.role, at: t.at, text };
  if (typeof t.intent === 'string' && INTENTS.includes(t.intent)) out.intent = t.intent;
  if (typeof t.mode === 'string') out.mode = t.mode.slice(0, 24);
  if (typeof t.followUp === 'string') out.followUp = t.followUp.slice(0, 24);
  return out;
}

// Shape check + normalisation for a restored conversation. Returns the
// cleaned conversation, or null when it must be discarded.
export function validateConversation(v, now = Date.now()){
  if (!v || typeof v !== 'object') return null;
  if (v.v !== VERSION) return null;
  if (typeof v.at !== 'number' || !(now - v.at >= 0) || (now - v.at) > CONVERSATION_TTL) return null;
  if (!Array.isArray(v.turns)) return null;
  const turns = [];
  for (const t of v.turns.slice(-MAX_TURNS)){
    const ok = validTurn(t);
    if (!ok) return null;                              // one bad turn: the record is untrusted
    turns.push(ok);
  }
  const context = sanitizeContext(v.context ?? {});
  if (!context) return null;
  let current = null;
  if (v.current != null){
    if (typeof v.current !== 'object') return null;
    const asked = str(v.current.asked);
    if (typeof asked !== 'string') return null;
    const data = sanitizeAnswer(v.current.data);
    if (!data) return null;
    current = { asked, data };
    if (typeof v.current.intent === 'string' && INTENTS.includes(v.current.intent)) current.intent = v.current.intent;
    const eq = str(v.current.effectiveQuery);
    if (eq) current.effectiveQuery = eq;
  }
  return { v: VERSION, at: v.at, turns, context, current };
}

function storageOrNull(storage){
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readConversation(userId, storage, now = Date.now()){
  const store = storageOrNull(storage);
  const key = conversationKeyFor(userId);
  if (!store || !key) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const conv = validateConversation(JSON.parse(raw), now);
    if (!conv){ store.removeItem(key); return null; }
    return conv;
  } catch { return null; }
}

export function writeConversation(userId, conversation, storage, now = Date.now()){
  const store = storageOrNull(storage);
  const key = conversationKeyFor(userId);
  if (!store || !key || !conversation) return;
  const bounded = {
    v: VERSION, at: now,
    turns: (conversation.turns || []).slice(-MAX_TURNS),
    context: sanitizeContext(conversation.context || {}) || {},
    current: conversation.current
      ? { asked: str(conversation.current.asked) || '', data: sanitizeAnswer(conversation.current.data),
          intent: conversation.current.intent, effectiveQuery: str(conversation.current.effectiveQuery) || undefined }
      : null,
  };
  // The same whitelist applies on the way in: live-screen fields
  // (pendingResearch, owned bottles, picks) are not part of the stored shape.
  if (bounded.current && !bounded.current.data) bounded.current = null;
  try { store.setItem(key, JSON.stringify(bounded)); }
  catch { /* storage full or blocked — the conversation still shows */ }
}

// Sign-out, account switch, or "New question".
export function clearConversation(userId, storage){
  const store = storageOrNull(storage);
  const key = conversationKeyFor(userId);
  if (!store || !key) return;
  try { store.removeItem(key); } catch { /* nothing to do */ }
}

// ── Reducers (pure) ─────────────────────────────────────────────────

export function appendUserTurn(conv, text, intent, now = Date.now()){
  const base = conv || emptyConversation(now);
  const turn = { role:'user', at: now, text: String(text ?? '').slice(0, MAX_TEXT) };
  if (intent) turn.intent = intent;
  return { ...base, at: now, turns: [...base.turns, turn].slice(-MAX_TURNS) };
}

// Record the sommelier's answer as the current one. `summary` is the one-line
// form shown in the thread; `data` is the full answer.
export function appendAnswer(conv, { asked, summary, data, intent, effectiveQuery, mode, followUp }, now = Date.now()){
  const base = conv || emptyConversation(now);
  const turn = { role:'sommelier', at: now, text: String(summary ?? '').slice(0, MAX_TEXT) };
  if (mode) turn.mode = mode;
  if (followUp) turn.followUp = followUp;
  const current = { asked: String(asked ?? ''), data };
  if (intent) current.intent = intent;
  if (effectiveQuery) current.effectiveQuery = effectiveQuery;
  return { ...base, at: now, turns: [...base.turns, turn].slice(-MAX_TURNS), current };
}

export function withContext(conv, context, now = Date.now()){
  const base = conv || emptyConversation(now);
  return { ...base, at: now, context: sanitizeContext(context) || {} };
}

// ── Stale-response guard ────────────────────────────────────────────
// One token per question. A response may touch the screen or the stored
// conversation only while `isCurrent(token)` — i.e. no newer question has
// been asked and nothing has cancelled it. `invalidate()` is what "Cancel",
// "New question" and leaving the screen call.
export function turnGuard(){
  let latest = 0;
  return {
    next(){ return ++latest; },
    isCurrent(token){ return token === latest; },
    invalidate(){ return ++latest; },
    get latest(){ return latest; },
  };
}

// The rule in one place: a result for `token` may be applied only if the
// guard still considers it current. Pure; returns the conversation to keep.
export function applyIfCurrent(conv, token, guard, next){
  if (!guard || !guard.isCurrent(token)) return conv;
  return typeof next === 'function' ? next(conv) : next;
}
