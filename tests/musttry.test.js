// musttry.test.js — the Must Try screen's rules.
//
// What these guard: guidance is instant, personalized only from REAL palate
// data with samples excluded, and honest below the data threshold; the
// research taste summary carries concepts, never identity or cellar contents;
// an exact bottle renders only when verified with cited sources; a price
// renders only with a current merchant source; and "Not for me" dismissals
// are explicit, per-user, and permanent per bottle+vintage.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  mustTryGuidance, tasteSummary, displayableCandidates,
  dismissKeyFor, candidateKey, readDismissed, addDismissed, withoutDismissed, PERSONAL_MIN,
} from '../src/lib/musttry.js';
import { verifiedCandidates } from '../supabase/functions/_shared/musttry-verify.js';

function ratedWine(i, over = {}){
  return {
    name:'Wine '+i, producer:'Producer '+i, grape:'Gamay', region:'Morgon, Beaujolais', country:'France',
    verdict:'buy', type:'Red', flavor:{ body:3, acidity:4, tannin:2, fruit:4, oak:1 }, sample:false,
    note:'a private note about wine '+i,
    ...over,
  };
}
const CELLAR = [0,1,2,3,4,5].map(i=>ratedWine(i));

// ── Instant guidance ────────────────────────────────────────────────

test('with enough rated wines, guidance is personalized and non-empty', () => {
  const g = mustTryGuidance(CELLAR);
  assert.equal(g.personalized, true);
  assert.equal(g.count, 6);
  assert.ok(g.cards.length >= 2, 'style, grape and region guidance exists');
  assert.ok(g.cards.some(c=>c.kind==='grape' && c.title==='Gamay'), 'built from what the user actually rates');
});

test('sample wines never shape Must Try guidance', () => {
  const withSamples = [...CELLAR,
    ratedWine(90, { sample:true, grape:'Zinfandel', region:'Lodi', country:'USA' }),
    ratedWine(91, { sample:true, grape:'Zinfandel', region:'Lodi', country:'USA' }),
    ratedWine(92, { sample:true, grape:'Zinfandel', region:'Lodi', country:'USA' }),
  ];
  const g = mustTryGuidance(withSamples);
  assert.equal(g.count, 6, 'samples are not counted as the user’s wines');
  assert.ok(!g.cards.some(c=>/zinfandel|lodi/i.test(c.title)), 'demo bottles put no words in the user’s mouth');
});

test('below the threshold the screen is honest: general, not personalized', () => {
  const few = CELLAR.slice(0, PERSONAL_MIN - 1);
  const g = mustTryGuidance(few);
  assert.equal(g.personalized, false);
  assert.equal(g.signature, null, 'no taste claims from a near-empty cellar');
  assert.ok(g.cards.length > 0, 'but the screen still offers useful starting points');
});

test('an all-sample cellar counts as no personal data at all', () => {
  const g = mustTryGuidance(CELLAR.map(w=>({ ...w, sample:true })));
  assert.equal(g.personalized, false);
  assert.equal(g.count, 0);
});

// ── The research taste summary: concepts only, no identity ──────────

test('the taste summary carries concepts, never names, notes, or bottles', () => {
  const s = tasteSummary(CELLAR);
  assert.ok(s.includes('Gamay'), 'grape concepts are the point');
  assert.ok(!/Producer \d|Wine \d|private note/i.test(s), 'no producers, bottle names, or notes');
});

test('no taste summary without personalization — nothing is sent for research', () => {
  assert.equal(tasteSummary(CELLAR.slice(0,2)), '');
  assert.equal(tasteSummary(CELLAR.map(w=>({ ...w, sample:true }))), '');
});

// ── Client-side display rules for candidates ────────────────────────

const GOOD = {
  producer:'Jean Foillard', name:'Morgon Côte du Py', vintage:'2021', grape:'Gamay', region:'Beaujolais',
  why:'Cited.', sources:[{ title:'Producer', url:'https://example.com/wine' }],
  price:{ amount:34, merchant:'Good Wine Shop', source:{ title:'Listing', url:'https://example.com/listing' } },
};

test('a candidate renders only with full identity and cited sources', () => {
  assert.equal(displayableCandidates({ candidates:[GOOD] }).length, 1);
  assert.equal(displayableCandidates({ candidates:[{ ...GOOD, sources:[] }] }).length, 0, 'no sources, no bottle');
  assert.equal(displayableCandidates({ candidates:[{ ...GOOD, vintage:'' }] }).length, 0, 'no vintage, no bottle');
  assert.equal(displayableCandidates({ candidates:[{ ...GOOD, producer:'' }] }).length, 0);
  assert.equal(displayableCandidates({ candidates:[{ ...GOOD, sources:[{ title:'x', url:'http://insecure' }] }] }).length, 0, 'citations must be https');
  assert.equal(displayableCandidates({ candidates:[{ ...GOOD, sources:undefined }] }).length, 0, 'a malformed response neither renders nor throws');
  assert.equal(displayableCandidates({ candidates:[{ ...GOOD, sources:'not-a-list' }] }).length, 0);
  assert.equal(displayableCandidates(null).length, 0);
});

test('a price renders only when merchant-sourced; otherwise it is omitted, not guessed', () => {
  const noMerchant = displayableCandidates({ candidates:[{ ...GOOD, price:{ ...GOOD.price, merchant:'' } }] })[0];
  assert.equal(noMerchant.price, null);
  const noSource = displayableCandidates({ candidates:[{ ...GOOD, price:{ amount:34, merchant:'Shop' } }] })[0];
  assert.equal(noSource.price, null);
  const ok = displayableCandidates({ candidates:[GOOD] })[0];
  assert.equal(ok.price.amount, 34);
  assert.equal(ok.price.merchant, 'Good Wine Shop');
});

// ── The server boundary (shared with the Edge Function) ─────────────

const REGISTRY = [
  { id:1, title:'Producer page', url:'https://producer.example/wine' },
  { id:2, title:'Merchant listing', url:'https://shop.example/listing' },
];

test('the server keeps only candidates whose sourceIds map to real evidence', () => {
  const out = verifiedCandidates([
    { producer:'A', cuvee:'Cuvée One', vintage:'2021', grape:'Syrah', region:'Rhône', why:'ok', sourceIds:[1] },
    { producer:'B', cuvee:'Cuvée Two', vintage:'2020', grape:'Gamay', region:'Beaujolais', why:'invented', sourceIds:[99] },
    { producer:'C', cuvee:'Cuvée Three', vintage:'2019', grape:'Barbera', region:'Asti', why:'none', sourceIds:[] },
    { producer:'D', cuvee:'', vintage:'2019', grape:'x', region:'x', why:'no cuvee', sourceIds:[1] },
    { producer:'E', cuvee:'Cuvée Five', vintage:'', grape:'x', region:'x', why:'no vintage', sourceIds:[1] },
  ], REGISTRY);
  assert.equal(out.length, 1);
  assert.equal(out[0].producer, 'A');
  assert.deepEqual(out[0].sources, [{ title:'Producer page', url:'https://producer.example/wine' }]);
});

test('the server passes a price through only with a merchant and a real price source', () => {
  const base = { producer:'A', cuvee:'One', vintage:'2021', grape:'', region:'', why:'', sourceIds:[1] };
  const [withPrice] = verifiedCandidates([{ ...base, price:34, merchant:'Shop', priceSourceId:2 }], REGISTRY);
  assert.deepEqual(withPrice.price, { amount:34, merchant:'Shop', source:{ title:'Merchant listing', url:'https://shop.example/listing' } });
  const [noSrc] = verifiedCandidates([{ ...base, price:34, merchant:'Shop', priceSourceId:99 }], REGISTRY);
  assert.equal(noSrc.price, null);
  const [noMerchant] = verifiedCandidates([{ ...base, price:34, priceSourceId:2 }], REGISTRY);
  assert.equal(noMerchant.price, null);
  const [free] = verifiedCandidates([{ ...base, price:0, merchant:'Shop', priceSourceId:2 }], REGISTRY);
  assert.equal(free.price, null, 'a non-positive price is noise, not data');
});

test('the shortlist is capped at three', () => {
  const many = [0,1,2,3,4].map(i=>({ producer:'P'+i, cuvee:'C'+i, vintage:'2021', grape:'', region:'', why:'', sourceIds:[1] }));
  assert.equal(verifiedCandidates(many, REGISTRY).length, 3);
});

// ── "Not for me" ────────────────────────────────────────────────────

function fakeStorage(){
  const m = new Map();
  return { getItem:(k)=> m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)), removeItem:(k)=>m.delete(k), _map:m };
}

test('dismissals are per-user and permanent per bottle+vintage', () => {
  const store = fakeStorage();
  assert.equal(dismissKeyFor('u1'), 'wm_musttry_notforme_u1');
  assert.equal(dismissKeyFor(''), null, 'no user, no storage');
  addDismissed('u1', GOOD, store);
  assert.ok(readDismissed('u1', store).has(candidateKey(GOOD)));
  assert.equal(readDismissed('u2', store).size, 0, 'another account sees nothing');
  // A different vintage of the same wine is a different bottle.
  assert.ok(!readDismissed('u1', store).has(candidateKey({ ...GOOD, vintage:'2019' })));
});

test('withoutDismissed filters, and corrupt storage fails closed to empty', () => {
  const store = fakeStorage();
  const set = addDismissed('u1', GOOD, store);
  assert.equal(withoutDismissed([GOOD, { ...GOOD, vintage:'2019' }], set).length, 1);
  assert.equal(withoutDismissed([GOOD], null).length, 1, 'no dismissals loaded yet = show everything');
  store.setItem('wm_musttry_notforme_u1', '{not json');
  assert.equal(readDismissed('u1', store).size, 0);
  store.setItem('wm_musttry_notforme_u1', JSON.stringify({ nope:true }));
  assert.equal(readDismissed('u1', store).size, 0, 'a non-array shape is discarded');
});
