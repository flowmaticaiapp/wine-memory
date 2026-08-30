// candidates.test.js — the candidate-provider boundary.
//
// The point of these tests is that ONE pairing request ranks candidates from
// three different sources without the ranker knowing which is which. If a
// future change makes the engine depend on where a candidate came from, or
// lets a sponsorship reach the score, these fail.
//
// No retailer tables, integrations or accounts exist. The store inventory here
// is a fixture, which is the whole reason the boundary can be tested today.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  fromCellar, fromStyleGuidance, fromStoreInventory,
  rankCandidates, scoreCandidate, matchesGrape, applyRequirements,
} from '../src/lib/candidates.js';

// One request, used throughout: a steak pairing wanting Syrah or Malbec.
const REQUEST = {
  targetGrapes: ['Syrah', 'Malbec', 'Cabernet Sauvignon'],
  avoidGrapes: [],
  maxPrice: null,
};

const CELLAR = [
  { id:'c1', producer:'Domaine A', name:'Crozes-Hermitage', vintage:2021, grape:'Syrah', type:'Red', price:28, verdict:'buy' },
  { id:'c2', producer:'Bodega B', name:'Reserva', vintage:2020, grape:'Malbec', type:'Red', price:22, verdict:'no' },
  { id:'c3', producer:'Cantina C', name:'Bianco', vintage:2022, grape:'Pinot Grigio', type:'White', price:15, verdict:'buy' },
];

const STYLE_RESULT = {
  primary:{ grape:'Syrah', deeperTitle:'Northern Rhône Syrah — Crozes-Hermitage or Saint-Joseph' },
  others:[ { grape:'Cabernet Sauvignon' }, { grape:'Merlot' } ],
};

// A fixture standing in for what a participating store would one day supply.
const STORE_ITEMS = [
  { merchantId:'green-hills', sku:'GH-1001', catalogWineId:'lwin-000001', producer:'Producer X',
    name:'Côtes du Rhône', vintage:2022, grape:'Syrah', region:'Rhône', country:'France', type:'Red',
    price:24, status:'in-stock', location:'Rhône section · Shelf 3', updatedAt:'2026-08-30T09:00:00Z' },
  { merchantId:'green-hills', sku:'GH-1002', catalogWineId:'lwin-000002', producer:'Producer Y',
    name:'Rioja Crianza', vintage:2020, grape:'Tempranillo', region:'Rioja', country:'Spain', type:'Red',
    price:27, status:'in-stock', location:'Spain · Shelf 1', updatedAt:'2026-08-30T09:00:00Z' },
  { merchantId:'green-hills', sku:'GH-1003', catalogWineId:'lwin-000003', producer:'Producer Z',
    name:'Malbec', vintage:2021, grape:'Malbec', region:'Mendoza', country:'Argentina', type:'Red',
    price:19, status:'out-of-stock', location:'Argentina · Shelf 2', updatedAt:'2026-08-30T09:00:00Z' },
];

// ── The same request ranks all three sources ────────────────────────

test('one request ranks cellar candidates', () => {
  const ranked = rankCandidates(REQUEST, fromCellar(CELLAR));
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].grape, 'Syrah', 'the Buy Again Syrah should lead');
  assert.ok(!ranked.some(c => c.grape === 'Pinot Grigio'), 'a white should not survive a steak request');
});

test('one request ranks generic style candidates', () => {
  const ranked = rankCandidates(REQUEST, fromStyleGuidance(STYLE_RESULT));
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].grape, 'Syrah', 'the lead style should rank first');
  assert.ok(ranked.every(c => c.producer == null), 'style candidates must never name a producer');
  assert.ok(ranked.every(c => c.vintage == null), 'style candidates must never carry a vintage');
});

test('one request ranks a mock store inventory', () => {
  const ranked = rankCandidates(REQUEST, fromStoreInventory(STORE_ITEMS));
  assert.ok(ranked.length > 0);
  assert.equal(ranked[0].name, 'Côtes du Rhône');
  assert.ok(ranked[0].availability, 'a store candidate carries availability');
  assert.equal(ranked[0].availability.location, 'Rhône section · Shelf 3');
  assert.ok(!ranked.some(c => c.grape === 'Tempranillo'), 'a non-matching grape is not a candidate');
});

test('the ranker treats all three sources through one code path', () => {
  const mixed = [
    ...fromCellar(CELLAR),
    ...fromStyleGuidance(STYLE_RESULT),
    ...fromStoreInventory(STORE_ITEMS),
  ];
  const ranked = rankCandidates(REQUEST, mixed);
  const sources = new Set(ranked.map(c => c.source));
  assert.ok(sources.has('cellar') && sources.has('style') && sources.has('store'),
    'all three provider kinds should coexist in one ranking');
  // Nothing in the engine may branch on source: a store bottle the user would
  // buy again does not exist, so the cellar's Buy Again Syrah leads.
  assert.equal(ranked[0].source, 'cellar');
});

// ── Sponsorship must not reach the score ────────────────────────────

test('a sponsored bottle does not outrank a better fit', () => {
  // The sponsored wine MATCHES the request, so it reaches the scorer and the
  // comparison is real. It simply fits less well than a bottle the user has
  // already marked Buy Again. Sponsorship must not close that gap.
  const sponsoredMalbec = fromStoreInventory([
    { ...STORE_ITEMS[2], status:'in-stock', sponsored:true, featured:true, staffPick:true, bestValue:true },
  ]);
  const cellarFavourite = fromCellar([CELLAR[0]]);   // Syrah, Buy Again
  const ranked = rankCandidates(REQUEST, [...sponsoredMalbec, ...cellarFavourite]);

  assert.equal(ranked.length, 2, 'both should be genuine candidates');
  assert.ok(ranked.some(c => c.placement && c.placement.sponsored), 'the sponsored wine is in the running');
  assert.equal(ranked[0].source, 'cellar', 'a sponsored bottle must not become the best match');
  assert.ok(ranked[0].score > ranked[1].score, 'the better fit should win on score, not on tie-break');
});

test('a sponsored non-matching wine is not a candidate at all', () => {
  const sponsoredRioja = [{ ...STORE_ITEMS[1], sponsored:true, featured:true, staffPick:true }];
  const ranked = rankCandidates(REQUEST, fromStoreInventory([STORE_ITEMS[0], ...sponsoredRioja]));
  assert.equal(ranked[0].name, 'Côtes du Rhône');
  assert.ok(!ranked.some(c => c.grape === 'Tempranillo'),
    'paying for placement must not buy entry to a pairing it does not fit');
});

test('identical wines score identically whether sponsored or not', () => {
  const plain = fromStoreInventory([STORE_ITEMS[0]])[0];
  const paid  = fromStoreInventory([{ ...STORE_ITEMS[0], sponsored:true, featured:true, bestValue:true }])[0];
  assert.equal(scoreCandidate(plain, REQUEST), scoreCandidate(paid, REQUEST),
    'commercial placement changed the organic score');
  assert.equal(paid.placement.sponsored, true, 'placement is still recorded for labelling');
});

// ── Requirements are hard, not preferences ──────────────────────────

test('budget removes a bottle rather than demoting it', () => {
  const ranked = rankCandidates({ ...REQUEST, maxPrice: 25 }, fromStoreInventory(STORE_ITEMS));
  assert.ok(ranked.every(c => c.price <= 25));
  assert.ok(ranked.some(c => c.name === 'Côtes du Rhône'));
});

test('out-of-stock is excluded when the request requires stock', () => {
  const all = fromStoreInventory(STORE_ITEMS);
  assert.ok(all.some(c => c.availability.status === 'out-of-stock'));
  const kept = applyRequirements(all, { inStockOnly:true });
  assert.ok(!kept.some(c => c.availability.status === 'out-of-stock'));
});

test('style candidates survive a budget filter, having no price', () => {
  // Guidance is not a bottle, so a budget cannot exclude it — the user still
  // needs to know what to look for at that price.
  const ranked = rankCandidates({ ...REQUEST, maxPrice: 12 }, fromStyleGuidance(STYLE_RESULT));
  assert.ok(ranked.length > 0);
});

// ── Matching stays strict ───────────────────────────────────────────

test('grape matching is whole-word, never a first-word substring', () => {
  const grigio = { grape:'Pinot Grigio', name:'Bianco' };
  assert.equal(matchesGrape(grigio, ['Pinot Noir']), false);
  assert.equal(matchesGrape({ grape:'Pinot Noir', name:'' }, ['Pinot Noir']), true);
});

test('store items keep retailer data out of the wine itself', () => {
  const c = fromStoreInventory(STORE_ITEMS)[0];
  for (const field of ['price', 'status', 'location', 'sku', 'merchantId']) {
    if (field === 'price') continue;   // price is surfaced for ranking, sourced from availability
    assert.equal(c[field], undefined, `${field} must live under availability, not on the wine`);
  }
  assert.equal(c.availability.sku, 'GH-1001');
  assert.ok(c.availability.updatedAt, 'inventory must be time-stamped');
});

test('an unmatched store item is not silently attached to a catalog wine', () => {
  const unmatched = fromStoreInventory([{ ...STORE_ITEMS[0], catalogWineId: undefined }])[0];
  assert.equal(unmatched.catalogWineId, null, 'no catalog id should be invented');
  assert.equal(unmatched.provenance, 'ai', 'an unmatched item is not a sourced fact');
});
