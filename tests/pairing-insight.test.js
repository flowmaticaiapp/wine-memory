import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relevantBuyAgainGrape } from '../src/lib/pairing-insight.js';

const pinotLover = [
  { grape:'Pinot Noir', verdict:'buy', sample:false },
  { grape:'Pinot Noir', verdict:'buy', sample:false },
  { grape:'Malbec', verdict:'buy', sample:false },
];

test('an irrelevant favorite is not shown beneath a pairing answer', () => {
  const steak = { primary:{ grape:'Malbec', matchGrapes:['Malbec','Cabernet Sauvignon','Syrah'] } };
  assert.equal(relevantBuyAgainGrape(pinotLover, steak), null,
    'Pinot Noir does not explain a Malbec steak recommendation');
});

test('a genuinely relevant favorite may support the answer, but samples never do', () => {
  const pinotPairing = { primary:{ grape:'Pinot Noir', matchGrapes:['Pinot Noir','Gamay'] } };
  assert.equal(relevantBuyAgainGrape(pinotLover, pinotPairing), 'Pinot Noir');
  assert.equal(relevantBuyAgainGrape([
    { grape:'Syrah', verdict:'buy', sample:true },
    { grape:'Syrah', verdict:'buy', sample:true },
  ], { primary:{ grape:'Syrah' } }), null);
});
