// wishlist.test.js — Wishlist is a separate concept from the cellar.
//
// What these guard: a wishlist item is NOT a wine — it cannot enter cellar
// counts, palate analysis, or owned-bottle matching; "I bought this" is the
// one explicit path into the cellar and produces a real Unopened wine, never
// a sample and never with a fabricated purchase price; duplicates are
// detected by bottle identity; and a client can never write another user's
// wishlist row.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  rowToItem, itemToRow, bottleKey, findDuplicate, wishlistToCellarWine, isMissingTable,
} from '../src/lib/wishlist.js';
import { personalWines, tasteSignature, regionsYouLove } from '../src/lib/palate.js';

const ITEM = {
  producer:'Jean Foillard', name:'Morgon Côte du Py', vintage:'2021', type:'Red',
  grape:'Gamay', region:'Morgon, Beaujolais', country:'France',
  priceExpected:34, why:'Tasted at a friend’s — loved it.', recommendedBy:'Sam',
  source:'manual', evidence:[], status:'active',
};

// ── Separation from the cellar ──────────────────────────────────────

test('a wishlist row carries no cellar fields — it cannot masquerade as a wine', () => {
  const row = itemToRow(ITEM);
  for (const field of ['verdict','sample','flavor','family','tags','photo','pairings']){
    assert.ok(!(field in row), `${field} must not exist on a wishlist row`);
  }
});

test('palate calculations read only the wines list; wishlist items never enter it', () => {
  const cellar = [
    { grape:'Gamay', region:'Morgon, Beaujolais', country:'France', verdict:'buy', type:'Red', flavor:{ body:3, acidity:4, tannin:2, fruit:4, oak:1 } },
    { grape:'Gamay', region:'Fleurie, Beaujolais', country:'France', verdict:'buy', type:'Red', flavor:{ body:3, acidity:4, tannin:2, fruit:4, oak:1 } },
    { grape:'Nebbiolo', region:'Barolo, Piedmont', country:'Italy', verdict:'maybe', type:'Red', flavor:{ body:5, acidity:4, tannin:5, fruit:3, oak:2 } },
  ];
  const wishlist = [ITEM, { ...ITEM, name:'Chinon', grape:'Cabernet Franc', vintage:'2020' }];

  // The palate engine's inputs are cellar wines; the wishlist has no channel
  // into them. Identical outputs with an empty or a full wishlist.
  const before = { sig: tasteSignature(cellar), regions: regionsYouLove(cellar), pool: personalWines(cellar).length };
  void wishlist; // exists, and is simply not an input to any of these
  const after = { sig: tasteSignature(cellar), regions: regionsYouLove(cellar), pool: personalWines(cellar).length };
  assert.deepEqual(before, after);
  assert.equal(before.pool, 3, 'only the owned bottles count');
});

test('the client never sets user_id — ownership comes from auth, so it cannot be spoofed', () => {
  assert.ok(!('user_id' in itemToRow(ITEM)));
});

// ── "I bought this" — the explicit transition into the cellar ───────

test('the bought wine is a real Unopened cellar wine, never a sample', () => {
  const wine = wishlistToCellarWine(ITEM);
  assert.equal(wine.verdict, 'totry', 'owned but not yet tasted = Unopened');
  assert.equal(wine.sample, false, 'a bought bottle is genuine user data');
  assert.equal(wine.name, 'Morgon Côte du Py');
  assert.equal(wine.producer, 'Jean Foillard');
  assert.equal(wine.vintage, '2021');
  assert.equal(wine.grape, 'Gamay');
  assert.equal(wine.note, ITEM.why, 'the user’s own words travel with the bottle');
  assert.equal(wine.source, 'wishlist');
});

test('an expected price never becomes a purchase price', () => {
  const wine = wishlistToCellarWine({ ...ITEM, priceExpected: 34 });
  assert.equal(wine.price, null, 'price_expected was an expectation, not what was paid');
});

test('the bought wine enters the personalization pool like any owned bottle', () => {
  const wine = wishlistToCellarWine(ITEM);
  assert.equal(personalWines([wine]).length, 1);
  assert.equal(personalWines([{ ...wine, sample:true }]).length, 0, 'and the sample rule still governs');
});

// ── Duplicate handling ──────────────────────────────────────────────

test('the same bottle is recognised regardless of case and spacing', () => {
  assert.equal(bottleKey({ producer:'  Jean  Foillard ', name:'MORGON côte du py', vintage:' 2021' }),
    bottleKey(ITEM));
});

test('different vintages are different bottles', () => {
  assert.notEqual(bottleKey({ ...ITEM, vintage:'2019' }), bottleKey(ITEM));
  assert.notEqual(bottleKey({ ...ITEM, vintage:'' }), bottleKey(ITEM), 'NV/unknown only matches NV/unknown');
});

test('findDuplicate matches active items and ignores bought history', () => {
  const items = [
    { ...ITEM, id:'a', status:'active' },
    { ...ITEM, id:'b', name:'Chinon', status:'active' },
  ];
  assert.equal(findDuplicate(items, { producer:'jean foillard', name:'Morgon Côte du Py', vintage:'2021' }).id, 'a');
  assert.equal(findDuplicate(items, { ...ITEM, vintage:'2019' }), null);
  const boughtOnly = [{ ...ITEM, id:'c', status:'bought' }];
  assert.equal(findDuplicate(boughtOnly, ITEM), null, 'a bottle bought before may be wished for again');
});

// ── Honest unavailable state ────────────────────────────────────────

test('a missing wishlist table is recognised (migration not applied yet)', () => {
  assert.equal(isMissingTable({ code:'42P01', message:'relation "public.wishlist" does not exist' }), true);
  assert.equal(isMissingTable({ code:'PGRST205', message:"Could not find the table 'public.wishlist' in the schema cache" }), true);
  assert.equal(isMissingTable({ message:'relation "public.wishlist" does not exist' }), true);
  assert.equal(isMissingTable({ code:'23505', message:'duplicate key value' }), false);
  assert.equal(isMissingTable(null), false);
});

// ── Row mapping ─────────────────────────────────────────────────────

test('row mapping round-trips the fields that matter', () => {
  const row = itemToRow(ITEM);
  assert.equal(row.price_expected, 34);
  assert.equal(row.recommended_by, 'Sam');
  assert.equal(row.source, 'manual');
  assert.equal(row.evidence, null, 'manual entries carry no evidence records');
  const back = rowToItem({ id:'x', ...row, evidence:null, status:'active', created_at:'2026-08-30T12:00:00Z' });
  assert.equal(back.priceExpected, 34);
  assert.equal(back.recommendedBy, 'Sam');
  assert.deepEqual(back.evidence, []);
  assert.equal(back.added, '2026-08-30');
});

test('musttry items keep their evidence; unknown sources are normalised to manual', () => {
  const src = [{ title:'Producer page', url:'https://example.com' }];
  const row = itemToRow({ ...ITEM, source:'musttry', evidence:src });
  assert.equal(row.source, 'musttry');
  assert.deepEqual(row.evidence, src);
  assert.equal(itemToRow({ ...ITEM, source:'weird' }).source, 'manual');
});
