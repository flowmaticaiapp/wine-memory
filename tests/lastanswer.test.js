// lastanswer.test.js — the per-user answer cache.
//
// The bug this guards: one device-wide key meant a second account on the same
// device could restore the previous account's question and answer. The cache
// is now scoped to the authenticated user, validated on read, and cleared on
// sign-out.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  keyFor, isValidSavedAnswer, readLastAnswer, writeLastAnswer, clearLastAnswer,
  LAST_ANSWER_TTL,
} from '../src/lib/lastanswer.js';

// A minimal localStorage stand-in.
function fakeStorage(){
  const m = new Map();
  return {
    getItem: (k)=> m.has(k) ? m.get(k) : null,
    setItem: (k,v)=> m.set(k, String(v)),
    removeItem: (k)=> m.delete(k),
    _map: m,
  };
}

const PAIRING = { mode:'pairing', primary:{ grape:'Syrah' }, others:[] };

test('the key embeds the user id, and no user id means no key', () => {
  assert.equal(keyFor('user-a'), 'wm_last_pairing_user-a');
  assert.equal(keyFor(''), null);
  assert.equal(keyFor(null), null);
  assert.equal(keyFor(undefined), null);
});

test('an answer saved by one account is invisible to another', () => {
  const store = fakeStorage();
  writeLastAnswer('user-a', 'steak with mushroom sauce', PAIRING, store);
  assert.ok(readLastAnswer('user-a', store), 'the owner can restore it');
  assert.equal(readLastAnswer('user-b', store), null, 'another account cannot');
});

test('no user id: nothing is written and nothing is read', () => {
  const store = fakeStorage();
  writeLastAnswer(null, 'question', PAIRING, store);
  assert.equal(store._map.size, 0, 'nothing may be stored without an owner');
  assert.equal(readLastAnswer(null, store), null);
});

test('the legacy device-wide key is purged, never migrated', () => {
  const store = fakeStorage();
  // A pre-fix record — possibly another account's — under the old shared key.
  store.setItem('wm_last_pairing', JSON.stringify({ at:Date.now(), asked:'their question', data:PAIRING }));
  const got = readLastAnswer('user-a', store);
  assert.equal(got, null, 'the legacy record must not be restored for anyone');
  assert.equal(store.getItem('wm_last_pairing'), null, 'and it is removed');
});

test('sign-out clears the cache for that user', () => {
  const store = fakeStorage();
  writeLastAnswer('user-a', 'question', PAIRING, store);
  clearLastAnswer('user-a', store);
  assert.equal(readLastAnswer('user-a', store), null);
});

test('expired answers are rejected and cleaned up', () => {
  const store = fakeStorage();
  const past = Date.now() - LAST_ANSWER_TTL - 1000;
  writeLastAnswer('user-a', 'question', PAIRING, store, past);
  assert.equal(readLastAnswer('user-a', store), null);
  assert.equal(store._map.size, 0, 'the stale record is removed on read');
});

test('restored data is validated, not trusted', () => {
  const now = Date.now();
  // Valid shapes.
  assert.equal(isValidSavedAnswer({ at:now, asked:'q', data:PAIRING }), true);
  assert.equal(isValidSavedAnswer({ at:now, asked:'q', data:{ mode:'answer', text:'hi' } }), true);
  // Broken shapes — every one must be rejected.
  for (const bad of [
    null, 42, 'string',
    { at:now, asked:'q' },                                          // no data
    { at:now, asked:'q', data:{ mode:'pairing' } },                 // no primary
    { at:now, asked:'q', data:{ mode:'pairing', primary:{} } },     // no grape
    { at:now, asked:'q', data:{ mode:'pairing', primary:{ grape:'Syrah' }, others:'x' } }, // others not a list
    { at:now, asked:'q', data:{ mode:'answer' } },                  // no text
    { at:now, asked:'q', data:{ mode:'???' } },                     // unknown mode
    { at:'yesterday', asked:'q', data:PAIRING },                    // non-numeric time
    { at:now + 60_000, asked:'q', data:PAIRING },                   // from the future
    { at:now, asked:7, data:PAIRING },                              // asked not a string
  ]){
    assert.equal(isValidSavedAnswer(bad, now), false, JSON.stringify(bad));
  }
});

test('garbage in storage is discarded silently', () => {
  const store = fakeStorage();
  store.setItem(keyFor('user-a'), 'not json {{{');
  assert.equal(readLastAnswer('user-a', store), null);
});
