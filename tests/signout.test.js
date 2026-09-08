// signout.test.js — clearing on-device state must not depend on the network.
//
// The bug this guards: the previous signOut asked Supabase for the user and
// cleared the caches afterwards. If that request failed, the conversation
// stayed on the device for the next account. Now the app passes the user id
// it already knows, both caches are cleared synchronously, and only then is
// the sign-out request made.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { performSignOut, clearUserState } from '../src/lib/signout.js';
import { writeLastAnswer, readLastAnswer, keyFor } from '../src/lib/lastanswer.js';
import { writeConversation, readConversation, conversationKeyFor, emptyConversation, appendUserTurn, appendAnswer } from '../src/lib/conversation-store.js';

function fakeStorage(){
  const m = new Map();
  return { getItem:(k)=> m.has(k) ? m.get(k) : null, setItem:(k,v)=> m.set(k, String(v)), removeItem:(k)=> m.delete(k), _map:m };
}
const PAIRING = { mode:'pairing', primary:{ grape:'Syrah' }, others:[] };
function seeded(){
  const store = fakeStorage();
  writeLastAnswer('user-a', 'steak', PAIRING, store);
  let c = appendUserTurn(emptyConversation(), 'steak', 'pairing');
  c = appendAnswer(c, { asked:'steak', summary:'Syrah', data:PAIRING, intent:'pairing' });
  writeConversation('user-a', c, store);
  assert.ok(readLastAnswer('user-a', store) && readConversation('user-a', store), 'both caches seeded');
  return store;
}

test('both caches are cleared before the sign-out request is made, without asking who the user is', async () => {
  const store = seeded();
  const events = [];
  const auth = {
    getUser: async () => { events.push('getUser'); throw new Error('must never be needed'); },
    signOut: async () => { events.push('signOut'); events.push({ last: store.getItem(keyFor('user-a')), conv: store.getItem(conversationKeyFor('user-a')) }); },
  };
  await performSignOut('user-a', auth, store);
  assert.deepEqual(events[0], 'signOut', 'the only network call is signOut — getUser is never consulted');
  assert.deepEqual(events[1], { last:null, conv:null }, 'at the moment signOut is called, both caches are already gone');
  assert.equal(store._map.size, 0);
});

test('clearing does not depend on the sign-out request succeeding', async () => {
  const store = seeded();
  const auth = { signOut: async () => { throw new Error('network down'); } };
  await assert.rejects(performSignOut('user-a', auth, store), /network down/);
  assert.equal(readLastAnswer('user-a', store), null);
  assert.equal(readConversation('user-a', store), null);
  assert.equal(store._map.size, 0, 'nothing from the account remains even though sign-out failed');
});

test('clearing does not depend on the sign-out request ever returning', () => {
  const store = seeded();
  const auth = { signOut: () => new Promise(() => {}) };            // hangs forever
  const pending = performSignOut('user-a', auth, store);
  assert.equal(store._map.size, 0, 'cleared synchronously, before awaiting anything');
  assert.ok(pending instanceof Promise);
});

test('only the signed-out account is cleared; another account on the device is untouched', async () => {
  const store = seeded();
  writeLastAnswer('user-b', 'pizza', PAIRING, store);
  await performSignOut('user-a', { signOut: async () => ({}) }, store);
  assert.equal(readLastAnswer('user-a', store), null);
  assert.ok(readLastAnswer('user-b', store), 'user-b keeps their own cache');
});

test('a missing auth client or unknown user id is harmless', async () => {
  const store = seeded();
  clearUserState(null, store);
  assert.equal(store._map.size, 2, 'no id: nothing to clear (user-scoped keys are unknown)');
  await performSignOut('user-a', null, store);
  assert.equal(store._map.size, 0);
});
