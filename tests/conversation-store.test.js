// conversation-store.test.js — the per-user conversation store and the
// stale-response guard.
//
// What these prove: a conversation belongs to one user and is invisible to
// every other (13); sign-out clears it (14); a late response from an earlier
// question can never overwrite a newer answer (15); and anything restored
// from storage is validated as untrusted input and bounded by a TTL.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  conversationKeyFor, emptyConversation, appendUserTurn, appendAnswer, withContext,
  readConversation, writeConversation, clearConversation, validateConversation, sanitizeContext,
  isValidConversationData, turnGuard, applyIfCurrent, CONVERSATION_TTL, MAX_TURNS,
} from '../src/lib/conversation-store.js';

const authSource = readFileSync(new URL('../src/components/Auth.jsx', import.meta.url), 'utf8');
const mainSource = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

function fakeStorage(){
  const m = new Map();
  return {
    getItem: (k)=> m.has(k) ? m.get(k) : null,
    setItem: (k,v)=> m.set(k, String(v)),
    removeItem: (k)=> m.delete(k),
    _map: m,
  };
}
const PAIRING = { mode:'pairing', dish:'Mexican pork tacos', ruleId:'pork-tacos', primary:{ grape:'Dry Rosé' }, others:[] };

function thread(){
  let c = emptyConversation();
  c = appendUserTurn(c, 'Best wine for pork tacos', 'pairing');
  c = withContext(c, { dishQuery:'Best wine for pork tacos', protein:'pork', cuisine:'Mexican', budget:25 });
  c = appendAnswer(c, { asked:'Best wine for pork tacos', summary:'Dry Rosé · Tavel', data:PAIRING, intent:'pairing', effectiveQuery:'Best wine for pork tacos', mode:'pairing' });
  return c;
}

// ── 13. A different user cannot see another user’s conversation ─────

test('13. a conversation saved by one account is invisible to another, and unowned state is never stored', () => {
  const store = fakeStorage();
  writeConversation('user-a', thread(), store);
  const a = readConversation('user-a', store);
  assert.ok(a && a.current, 'the owner restores it');
  assert.equal(a.context.dishQuery, 'Best wine for pork tacos');
  assert.equal(readConversation('user-b', store), null, 'another account cannot');
  assert.equal(conversationKeyFor('user-a'), 'wm_sommelier_conversation_user-a');
  assert.equal(conversationKeyFor(''), null);
  assert.equal(conversationKeyFor(null), null);
  writeConversation(null, thread(), store);
  assert.equal(store._map.size, 1, 'nothing may be stored without an owner');
  assert.equal(readConversation(null, store), null);
  // The app remounts the sommelier per account: the key is the user id.
  assert.match(mainSource, /<VApp key=\{session\.user\.id\}/);
});

// ── 14. Sign-out clears saved conversation state ────────────────────

test('14. sign-out clears the conversation for that user', () => {
  const store = fakeStorage();
  writeConversation('user-a', thread(), store);
  clearConversation('user-a', store);
  assert.equal(readConversation('user-a', store), null);
  assert.equal(store._map.size, 0);
  // The call must be live code on the sign-out path (not a comment), and
  // happen before the session ends.
  const signOutBody = authSource.slice(authSource.indexOf('export async function signOut'));
  assert.match(signOutBody, /^\s*clearConversation\(id\);/m, 'the sign-out path calls it');
  assert.match(signOutBody, /^\s*clearLastAnswer\(id\);/m, 'alongside the older answer cache');
  assert.match(signOutBody, /^\s*clearConversation\(id\);[\s\S]*?await supabase\.auth\.signOut\(\)/m, 'before the session ends');
});

// ── 15. A late response cannot overwrite a newer answer ─────────────

test('15. the turn guard: only the latest token may apply, and cancellation invalidates', () => {
  const g = turnGuard();
  const first = g.next();
  const second = g.next();
  assert.equal(g.isCurrent(first), false, 'a superseded question is stale');
  assert.equal(g.isCurrent(second), true);
  // The reducer refuses a stale write and returns the conversation unchanged.
  const conv = thread();
  const newer = appendAnswer(conv, { asked:'white instead', summary:'Off-dry Riesling', data:{ mode:'pairing', primary:{ grape:'Off-dry Riesling' }, others:[] }, intent:'pairing', mode:'pairing' });
  const attempted = applyIfCurrent(newer, first, g, (c) => appendAnswer(c, { asked:'late', summary:'stale', data:PAIRING }));
  assert.equal(attempted, newer, 'the late response changed nothing');
  assert.equal(attempted.current.data.primary.grape, 'Off-dry Riesling');
  // The current token still applies.
  const applied = applyIfCurrent(newer, second, g, (c) => appendAnswer(c, { asked:'now', summary:'fresh', data:PAIRING }));
  assert.equal(applied.current.asked, 'now');
  // Cancel / New question / leaving: nothing in flight may land afterwards.
  g.invalidate();
  assert.equal(g.isCurrent(second), false);
  assert.equal(applyIfCurrent(newer, second, g, () => { throw new Error('must not run'); }), newer);
  assert.equal(applyIfCurrent(newer, second, null, () => { throw new Error('must not run'); }), newer, 'no guard, no write');
});

// ── Validation: storage is untrusted input ──────────────────────────

test('a valid conversation round-trips; the live-screen spinner never persists', () => {
  const store = fakeStorage();
  const c = thread();
  c.current.data = { ...c.current.data, pendingResearch:true };
  writeConversation('u', c, store);
  const back = readConversation('u', store);
  assert.equal(back.turns.length, 2);
  assert.equal(back.turns[0].role, 'user');
  assert.equal(back.turns[1].text, 'Dry Rosé · Tavel');
  assert.equal(back.current.asked, 'Best wine for pork tacos');
  assert.equal(back.current.intent, 'pairing');
  assert.equal(back.current.data.pendingResearch, false, 'a restored answer never comes back with a spinner nothing will resolve');
  assert.equal(back.context.budget, 25);
});

test('expired conversations are rejected and removed; the TTL is for tonight', () => {
  assert.ok(CONVERSATION_TTL <= 1000 * 60 * 60 * 24, 'bounded to a day or less');
  const store = fakeStorage();
  const past = Date.now() - CONVERSATION_TTL - 1000;
  writeConversation('u', thread(), store, past);
  assert.equal(readConversation('u', store), null);
  assert.equal(store._map.size, 0, 'the stale record is removed on read');
  // From the future is also invalid.
  store.setItem(conversationKeyFor('u'), JSON.stringify({ ...thread(), at: Date.now() + 60_000 }));
  assert.equal(readConversation('u', store), null);
});

test('malformed records are discarded whole, never rendered', () => {
  const now = Date.now();
  const good = { ...thread(), at: now };
  assert.ok(validateConversation(good, now));
  for (const bad of [
    null, 42, 'string', [],
    { ...good, v: 99 },                                                     // unknown version
    { ...good, at: 'yesterday' },                                           // non-numeric time
    { ...good, turns: 'not a list' },
    { ...good, turns: [{ role:'admin', text:'x', at: now }] },              // unknown role
    { ...good, turns: [{ role:'user', text: 7, at: now }] },                // text not a string
    { ...good, turns: [{ role:'user', text:'x' }] },                        // no timestamp
    { ...good, context: 'oops' },
    { ...good, current: 'oops' },
    { ...good, current: { asked: 3, data: PAIRING } },
    { ...good, current: { asked:'q', data:{ mode:'pairing' } } },           // no primary
    { ...good, current: { asked:'q', data:{ mode:'cellar' } } },            // cellar with no pairing
    { ...good, current: { asked:'q', data:{ mode:'explanation' } } },       // explanation with no text
    { ...good, current: { asked:'q', data:{ mode:'???', text:'x' } } },     // unknown mode
  ]){
    assert.equal(validateConversation(bad, now), null, JSON.stringify(bad).slice(0, 80));
  }
  const store = fakeStorage();
  store.setItem(conversationKeyFor('u'), 'not json {{{');
  assert.equal(readConversation('u', store), null);
  store.setItem(conversationKeyFor('u'), JSON.stringify({ ...good, current:{ asked:'q', data:{ mode:'pairing' } } }));
  assert.equal(readConversation('u', store), null);
  assert.equal(store._map.size, 0, 'a corrupt record is removed');
});

test('context is whitelisted and bounded; unknown keys and oversized values cannot come back', () => {
  const ctx = sanitizeContext({
    dishQuery: 'x'.repeat(1000), protein:'pork', budget: 25, cellarOnly: true, color:'red',
    dislikeColors: ['rose', 42, 'y'.repeat(500)], modifiers: Array.from({ length: 40 }, (_, i) => `m${i}`),
    vintage:'2021', badVintage:'x', evil:'<script>', notes:'private', cellar:['bottle'], __proto__x: 1,
  });
  assert.equal(ctx.dishQuery.length, 200);
  assert.equal(ctx.protein, 'pork');
  assert.equal(ctx.budget, 25);
  assert.equal(ctx.cellarOnly, true);
  assert.equal(ctx.vintage, '2021');
  assert.deepEqual(ctx.dislikeColors, ['rose', 'y'.repeat(120)]);
  assert.equal(ctx.modifiers.length, 12);
  assert.equal(ctx.evil, undefined);
  assert.equal(ctx.notes, undefined);
  assert.equal(ctx.cellar, undefined);
  assert.equal(sanitizeContext({ budget: -5 }).budget, undefined);
  assert.equal(sanitizeContext({ budget: 'cheap' }).budget, undefined);
  assert.equal(sanitizeContext({ vintage: '1492' }).vintage, undefined);
  assert.equal(sanitizeContext(null), null);
  assert.equal(sanitizeContext([]), null);
});

test('the thread is bounded: old turns fall off, text is capped', () => {
  let c = emptyConversation();
  for (let i = 0; i < MAX_TURNS + 10; i++) c = appendUserTurn(c, 'q'.repeat(2000) + i, 'pairing');
  assert.equal(c.turns.length, MAX_TURNS);
  assert.ok(c.turns.every(t => t.text.length <= 600));
  const store = fakeStorage();
  writeConversation('u', c, store);
  assert.equal(readConversation('u', store).turns.length, MAX_TURNS);
});

test('answer data shapes: pairing, written, explanation and cellar are valid; junk is not', () => {
  assert.equal(isValidConversationData(PAIRING), true);
  assert.equal(isValidConversationData({ mode:'answer', text:'hi' }), true);
  assert.equal(isValidConversationData({ mode:'explanation', text:'why', sources:[], factors:[] }), true);
  assert.equal(isValidConversationData({ mode:'explanation', text:'why', sources:'x' }), false);
  assert.equal(isValidConversationData({ mode:'cellar', pairing: PAIRING }), true);
  assert.equal(isValidConversationData({ mode:'cellar', pairing:{ mode:'answer' } }), false);
  assert.equal(isValidConversationData({ mode:'pairing', primary:{ grape:'' } }), false);
  assert.equal(isValidConversationData(null), false);
});
