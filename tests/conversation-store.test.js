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
  isValidConversationData, sanitizeAnswer, sanitizeSources, turnGuard, applyIfCurrent, CONVERSATION_TTL, MAX_TURNS,
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
  // The screen's signOut hands the KNOWN user id to the pure orchestrator
  // (behaviour proven in signout.test.js); every caller passes it.
  const signOutBody = authSource.slice(authSource.indexOf('export async function signOut'));
  assert.match(signOutBody, /export async function signOut\(userId\)/);
  assert.match(signOutBody, /^\s*await performSignOut\(typeof userId === 'string' \? userId : null, supabase\.auth\);/m);
  assert.doesNotMatch(signOutBody, /getUser/, 'sign-out never asks the network who the user is');
  const callers = mainSource.match(/signOut\([^)]*\)/g) || [];
  assert.ok(callers.length >= 3, 'drawer, account screen and tweaks panel');
  assert.ok(callers.every(c => c === 'signOut(userId)'), `every caller passes userId: ${callers.join(', ')}`);
  assert.doesNotMatch(mainSource, /onClick=\{signOut\}/, 'no caller hands signOut a click event instead of the id');
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
  assert.equal(back.current.data.pendingResearch, undefined, 'a restored answer never comes back with a spinner nothing will resolve');
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
  assert.equal(sanitizeAnswer({ mode:'explanation', text:'why', sources:'x' }).sources, undefined, 'a malformed source list is removed, the answer survives');
  assert.equal(isValidConversationData({ mode:'cellar', pairing: PAIRING }), true);
  assert.equal(isValidConversationData({ mode:'cellar', pairing:{ mode:'answer' } }), false);
  assert.equal(isValidConversationData({ mode:'pairing', primary:{ grape:'' } }), false);
  assert.equal(isValidConversationData(null), false);
});

// ── Deep sanitisation: every nested value is rebuilt, bounded, or removed ──

const LONG = 'x'.repeat(10_000);

test('ADVERSARIAL: a javascript: URL, a non-string title, and a non-https link never come back as sources', () => {
  const evil = [
    { title:'Click', url:'javascript:alert(1)' },
    { title:{ nested:true }, url:'https://ok.example/a' },
    { title:'Plain', url:'http://ok.example/b' },
    { title:'Data', url:'data:text/html,hi' },
    'https://ok.example/c',
    null,
    { title:'Good', url:'https://ok.example/d?x=1' },
    { title:LONG, url:'https://ok.example/e' },
  ];
  const out = sanitizeSources(evil);
  assert.deepEqual(out.map(s => s.url), ['https://ok.example/d?x=1', 'https://ok.example/e']);
  assert.equal(out[1].title.length, 200, 'titles are capped');
  // The same through a stored pairing, a written answer and an explanation.
  for (const d of [
    { mode:'pairing', primary:{ grape:'Syrah' }, sources: evil },
    { mode:'answer', text:'t', sources: evil },
    { mode:'explanation', text:'t', sources: evil },
  ]){
    const clean = sanitizeAnswer(d);
    assert.ok(clean);
    assert.deepEqual(clean.sources.map(s => s.url), ['https://ok.example/d?x=1', 'https://ok.example/e'], d.mode);
    assert.ok(!JSON.stringify(clean).includes('javascript:'), d.mode);
  }
  // A restored conversation carrying such sources renders only the clean ones.
  const store = fakeStorage();
  const c = thread();
  c.current.data = { ...PAIRING, sources: evil };
  store.setItem(conversationKeyFor('u'), JSON.stringify({ ...c, at: Date.now() }));
  const back = readConversation('u', store);
  assert.deepEqual(back.current.data.sources.map(s => s.url), ['https://ok.example/d?x=1', 'https://ok.example/e']);
});

test('ADVERSARIAL: malformed alternatives and buttons are removed; well-formed ones are kept and capped', () => {
  const clean = sanitizeAnswer({ mode:'pairing', primary:{ grape:'Syrah' },
    others:[ 'Merlot', null, { direction:'Softer' }, { grape:42 }, { grape:'Merlot', direction:'Softer and rounder', why:LONG }, { grape:'Cabernet Sauvignon' }, { grape:'Extra' } ] });
  assert.equal(clean.others.length, 2, 'at most two alternatives, malformed ones gone');
  assert.equal(clean.others[0].grape, 'Merlot');
  assert.equal(clean.others[0].why.length, 600);
  assert.equal(clean.others[1].grape, 'Cabernet Sauvignon');
  const expl = sanitizeAnswer({ mode:'explanation', text:'why', choices:[ 'red instead', { label:'No value' }, { value:'x' }, { label:{}, value:'x' }, { label:'Red', value:'red instead' }, { label:'Budget', value:25 }, { label:LONG, value:LONG }, ...Array.from({ length:10 }, (_, i) => ({ label:`L${i}`, value:`v${i}` })) ] });
  assert.equal(expl.choices.length, 6, 'buttons are capped');
  assert.deepEqual(expl.choices[0], { label:'Red', value:'red instead' });
  assert.deepEqual(expl.choices[1], { label:'Budget', value:25 });
  assert.equal(expl.choices[2].label.length, 60);
  assert.equal(expl.choices[2].value.length, 200);
});

test('ADVERSARIAL: oversized nested values are capped everywhere; unknown fields and enums are dropped', () => {
  const huge = { mode:'pairing', dish:LONG, ruleId:LONG, matched:'yes', basis:'gospel', researchStatus:'verified!', adjusted:'magic', cellarColor:'plaid',
    primary:{ grape:LONG, why:LONG, deeperTitle:LONG, deeper:LONG, lookFor:Array.from({ length:30 }, () => LONG), matchGrapes:Array.from({ length:30 }, () => LONG), bottle:LONG, bottleWhy:'James Suckling 100 points', secret:'x' },
    others:[], avoid:Array.from({ length:40 }, () => LONG), avoidNote:LONG, limit:'25', tonightReason:LONG, guidedMood:'ecstatic', evil:'<script>', owned:[{ producer:'Private' }], picks:{}, pendingResearch:true };
  const c = sanitizeAnswer(huge);
  assert.equal(c.dish.length, 200);
  assert.equal(c.ruleId.length, 80);
  assert.equal(c.primary.grape.length, 80);
  assert.equal(c.primary.why.length, 600);
  assert.equal(c.primary.deeperTitle.length, 200);
  assert.equal(c.primary.lookFor.length, 3);
  assert.ok(c.primary.lookFor.every(x => x.length === 200));
  assert.equal(c.primary.matchGrapes.length, 8);
  assert.equal(c.primary.bottle.length, 200);
  assert.equal(c.primary.bottleWhy, undefined, 'unverified bottle prose never persists');
  assert.equal(c.primary.secret, undefined);
  assert.equal(c.avoid.length, 10);
  assert.equal(c.avoidNote.length, 400);
  assert.equal(c.tonightReason.length, 600);
  for (const k of ['matched', 'basis', 'researchStatus', 'adjusted', 'cellarColor', 'guidedMood', 'limit', 'evil', 'owned', 'picks', 'pendingResearch']){
    assert.equal(c[k], undefined, `${k} must not survive with an invalid value`);
  }
  // Valid enums and numbers do survive.
  const ok = sanitizeAnswer({ mode:'pairing', primary:{ grape:'Syrah' }, matched:true, basis:'rule', researchStatus:'researched', adjusted:'heat', cellarColor:'red', cellarDislike:['rose', 'plaid'], guidedMood:'bold', limit:25, swappedTo:'white' });
  assert.deepEqual({ matched:ok.matched, basis:ok.basis, researchStatus:ok.researchStatus, adjusted:ok.adjusted, cellarColor:ok.cellarColor, cellarDislike:ok.cellarDislike, guidedMood:ok.guidedMood, limit:ok.limit, swappedTo:ok.swappedTo },
    { matched:true, basis:'rule', researchStatus:'researched', adjusted:'heat', cellarColor:'red', cellarDislike:['rose'], guidedMood:'bold', limit:25, swappedTo:'white' });
  // Written answers, explanations and cellar metadata are bounded too.
  const w = sanitizeAnswer({ mode:'explanation', text:LONG, kind:LONG, factors:Array.from({ length:50 }, () => LONG), offerResearch:'yes' });
  assert.equal(w.text.length, 4000);
  assert.equal(w.kind.length, 24);
  assert.equal(w.factors.length, 20);
  assert.ok(w.factors.every(f => f.length === 200));
  assert.equal(w.offerResearch, undefined);
  const cel = sanitizeAnswer({ mode:'cellar', pairing:{ mode:'pairing', primary:{ grape:'Syrah' }, sources:[{ title:'x', url:'javascript:1' }] }, note:LONG,
    options:{ color:'red', dislikeColors:['rose', 'x'], limit:-3, extra:1 }, lead:{ producer:LONG, name:LONG, vintage:LONG, photo:'data:...' }, picks:{ lead:{ wine:{ note:'private' } } } });
  assert.equal(cel.note.length, 400);
  assert.deepEqual(cel.options, { color:'red', dislikeColors:['rose'] });
  assert.equal(cel.lead.producer.length, 120);
  assert.equal(cel.lead.vintage.length, 10);
  assert.equal(cel.lead.photo, undefined);
  assert.equal(cel.picks, undefined, 'live cellar picks are never stored');
  assert.equal(cel.pairing.sources, undefined, 'a nested javascript: source is gone');
  // Whole-answer rejection when nothing honest remains.
  assert.equal(sanitizeAnswer({ mode:'pairing', primary:{ grape:'   ' } }), null);
  assert.equal(sanitizeAnswer({ mode:'answer', text:'   ' }), null);
  assert.equal(sanitizeAnswer({ mode:'cellar', pairing:{ mode:'answer', text:'x' } }), null);
  assert.equal(sanitizeAnswer({ mode:'pairing', primary:'Syrah' }), null);
});

test('the legacy last-answer restore on the screen goes through the same sanitiser', () => {
  const pairingScreenSource = readFileSync(new URL('../src/components/pairing.jsx', import.meta.url), 'utf8');
  assert.match(pairingScreenSource, /const cleaned = saved \? sanitizeAnswer\(saved\.data\) : null;\s*if \(!cleaned\) return;\s*const d = hydrate\(cleaned\);/,
    'a pre-conversation cached answer is sanitised before it is rendered');
  assert.match(pairingScreenSource, /import \{[^}]*sanitizeAnswer[^}]*\} from '\.\.\/lib\/conversation-store\.js'/);
});

test('writing a conversation applies the same whitelist as reading it', () => {
  const store = fakeStorage();
  const c = thread();
  c.current.data = { ...PAIRING, owned:[{ producer:'Private Domaine', note:'my note' }], picks:{}, primary:{ grape:'Dry Rosé', why:LONG, bottleWhy:'invented' }, sources:[{ title:'x', url:'javascript:1' }] };
  writeConversation('u', c, store);
  const raw = store.getItem(conversationKeyFor('u'));
  assert.ok(!raw.includes('Private Domaine') && !raw.includes('my note') && !raw.includes('javascript') && !raw.includes('invented'));
  assert.equal(JSON.parse(raw).current.data.primary.why.length, 600);
});
