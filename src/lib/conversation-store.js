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

import { isValidSavedAnswer } from './lastanswer.js';

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

// Validate one saved answer. Extends the answer cache's shape check with the
// conversation's own modes: an explanation (why / compare / sources /
// challenge) and a cellar decision (which carries the pairing it drew on).
export function isValidConversationData(d){
  if (!d || typeof d !== 'object') return false;
  if (d.mode === 'explanation'){
    return typeof d.text === 'string' && (d.sources === undefined || Array.isArray(d.sources))
      && (d.factors === undefined || Array.isArray(d.factors));
  }
  if (d.mode === 'cellar'){
    return !!d.pairing && typeof d.pairing === 'object'
      && isValidSavedAnswer({ at: 0, asked: '', data: d.pairing }, 0);
  }
  return isValidSavedAnswer({ at: 0, asked: '', data: d }, 0);
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
    if (!isValidConversationData(v.current.data)) return null;
    current = { asked, data: v.current.data };
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
      ? { asked: str(conversation.current.asked) || '', data: conversation.current.data,
          intent: conversation.current.intent, effectiveQuery: str(conversation.current.effectiveQuery) || undefined }
      : null,
  };
  // pendingResearch is a live-screen state, never a stored one.
  if (bounded.current && bounded.current.data && bounded.current.data.pendingResearch){
    bounded.current = { ...bounded.current, data: { ...bounded.current.data, pendingResearch: false } };
  }
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
