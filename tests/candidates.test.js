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
  quarantinedStoreItems, STORE_STALE_MS,
} from '../src/lib/candidates.js';

const FRESH = new Date(Date.now() - 60 * 60 * 1000).toISOString();   // an hour ago
const STALE = new Date(Date.now() - STORE_STALE_MS - 60 * 60 * 1000).toISOString();

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
    price:24, status:'in-stock', location:'Rhône section · Shelf 3', updatedAt:FRESH },
  { merchantId:'green-hills', sku:'GH-1002', catalogWineId:'lwin-000002', producer:'Producer Y',
    name:'Rioja Crianza', vintage:2020, grape:'Tempranillo', region:'Rioja', country:'Spain', type:'Red',
    price:27, status:'in-stock', location:'Spain · Shelf 1', updatedAt:FRESH },
  { merchantId:'green-hills', sku:'GH-1003', catalogWineId:'lwin-000003', producer:'Producer Z',
    name:'Malbec', vintage:2021, grape:'Malbec', region:'Mendoza', country:'Argentina', type:'Red',
    price:19, status:'out-of-stock', location:'Argentina · Shelf 2', updatedAt:FRESH },
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

// ── Quarantine and store hard requirements ──────────────────────────
// A named store-bottle result is a claim that the customer can walk over and
// buy this bottle right now. These tests hold that claim to its requirements.

test('an unmatched store item can never appear in ranked recommendations', () => {
  // A perfect fit — right grape, in stock, fresh, cheap — but no verified
  // catalogue match. It must be quarantined, not ranked.
  const perfectButUnmatched = { ...STORE_ITEMS[0], sku:'GH-9999', catalogWineId: undefined };
  const candidates = fromStoreInventory([perfectButUnmatched, STORE_ITEMS[0]]);
  const ranked = rankCandidates(REQUEST, candidates);
  assert.ok(!ranked.some(c => c.id === 'GH-9999'),
    'an unmatched bottle surfaced as a customer-facing recommendation');
  assert.equal(ranked.length, 1, 'the matched twin still ranks');

  const queue = quarantinedStoreItems(candidates);
  assert.equal(queue.length, 1, 'the unmatched item lands in the review queue');
  assert.equal(queue[0].id, 'GH-9999');
  assert.equal(queue[0].catalogWineId, null, 'and is never attached to a guessed wine');
});

test('customer-facing inventory defaults to in-stock only', () => {
  // No inStockOnly flag on the request — the default must already exclude
  // out-of-stock and unknown-status inventory. Low-stock still counts as
  // buyable.
  const items = [
    STORE_ITEMS[0],                                             // in-stock Syrah
    { ...STORE_ITEMS[2], status:'out-of-stock' },               // out-of-stock Malbec
    { ...STORE_ITEMS[2], sku:'GH-1004', status:'unknown' },     // unknown Malbec
    { ...STORE_ITEMS[2], sku:'GH-1005', status:'low-stock' },   // low-stock Malbec
  ];
  const ranked = rankCandidates(REQUEST, fromStoreInventory(items));
  const skus = ranked.map(c => c.id);
  assert.ok(skus.includes('GH-1001'), 'in-stock ranks');
  assert.ok(skus.includes('GH-1005'), 'low-stock still counts as buyable');
  assert.ok(!skus.includes('GH-1003'), 'out-of-stock cannot be recommended as purchasable');
  assert.ok(!skus.includes('GH-1004'), 'unknown status cannot be recommended as purchasable');
});

test('stale or unstamped inventory cannot be recommended as purchasable', () => {
  const items = [
    STORE_ITEMS[0],                                             // fresh
    { ...STORE_ITEMS[0], sku:'GH-2001', updatedAt: STALE },     // stale
    { ...STORE_ITEMS[0], sku:'GH-2002', updatedAt: undefined }, // never stamped
  ];
  const ranked = rankCandidates(REQUEST, fromStoreInventory(items));
  assert.deepEqual(ranked.map(c => c.id), ['GH-1001'],
    'only freshly confirmed inventory may be presented as buyable');
});

test('a hard budget excludes store bottles with unknown prices', () => {
  const items = [
    STORE_ITEMS[0],                                                   // $24
    { ...STORE_ITEMS[0], sku:'GH-3001', price: undefined },           // price unknown
  ];
  const ranked = rankCandidates({ ...REQUEST, maxPrice: 30 }, fromStoreInventory(items));
  assert.deepEqual(ranked.map(c => c.id), ['GH-1001'],
    'an unknown price cannot satisfy a hard maximum');
});

test('style guidance remains when no verified bottle qualifies', () => {
  // Every store item disqualified — stale, out of stock, unmatched — yet the
  // customer still gets a useful style-level answer.
  const deadInventory = fromStoreInventory([
    { ...STORE_ITEMS[0], updatedAt: STALE },
    { ...STORE_ITEMS[2] },                                        // out-of-stock
    { ...STORE_ITEMS[0], sku:'GH-4001', catalogWineId: undefined },
  ]);
  const ranked = rankCandidates(REQUEST, [...deadInventory, ...fromStyleGuidance(STYLE_RESULT)]);
  assert.ok(ranked.length > 0, 'the answer must not go empty');
  assert.ok(ranked.every(c => c.source === 'style'), 'only style guidance survives');
});

test('canonical grape identities hold inside the ranker', () => {
  // A Cabernet Franc in the cellar must not ride a Cabernet Sauvignon target.
  const cellar = fromCellar([
    { id:'cf', producer:'Loire Estate', name:'Chinon', vintage:2021, grape:'Cabernet Franc', type:'Red', price:20, verdict:'buy' },
    { id:'cs', producer:'Napa Estate', name:'Estate Red', vintage:2019, grape:'Cabernet', type:'Red', price:35, verdict:'buy' },
  ]);
  const ranked = rankCandidates(REQUEST, cellar);
  const ids = ranked.map(c => c.id);
  assert.ok(!ids.includes('cf'), 'Cabernet Franc must not match a Cabernet Sauvignon target');
  assert.ok(ids.includes('cs'), 'a bare-Cabernet label conventionally means Cabernet Sauvignon');
});
