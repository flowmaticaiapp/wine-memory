import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cellarBottleKey, consolidateCellarBottles } from '../src/lib/cellar-display.js';

const port = { id:'p1', producer:'Quinta Example', name:'Tawny Porto', vintage:'NV' };

test('identical physical bottles display once with a quantity', () => {
  const grouped = consolidateCellarBottles([
    port, { ...port, id:'p2' }, { ...port, id:'p3' },
  ]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].quantity, 3);
  assert.deepEqual(grouped[0].bottleIds, ['p1','p2','p3']);
});

test('producer and vintage are part of identity, so genuinely different wines stay separate', () => {
  const grouped = consolidateCellarBottles([
    port,
    { ...port, id:'p2', producer:'Another House' },
    { ...port, id:'p3', vintage:'20 Year' },
  ]);
  assert.equal(grouped.length, 3);
});

test('identity matching is insensitive to case and accidental spacing', () => {
  assert.equal(cellarBottleKey(port), cellarBottleKey({
    producer:' quinta example ', name:'TAWNY   PORTO', vintage:'nv',
  }));
});
