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
// A valid sourceId is NOT evidence: the cited entry must itself support the
// candidate's producer, cuvée AND vintage; a price additionally needs its
// amount and merchant context in a source that supports the same bottle.

const FOILLARD = { producer:'Jean Foillard', cuvee:'Morgon Côte du Py', vintage:'2021', grape:'Gamay', region:'Beaujolais', why:'ok' };
const REGISTRY = [
  { id:1, title:'Jean Foillard — Morgon Côte du Py', url:'https://producer.example/cote-du-py',
    citedText:'Jean Foillard’s Morgon Côte du Py 2021 comes from old vines on the Py hill.' },
  { id:2, title:'Good Wine Shop — Foillard Morgon', url:'https://goodwineshop.example/foillard-morgon-2021',
    citedText:'Jean Foillard Morgon Côte du Py 2021 — in stock at Good Wine Shop for $34.99.' },
  { id:3, title:'Ten great Beaujolais crus', url:'https://magazine.example/beaujolais-guide',
    citedText:'Beaujolais offers wonderful value across Morgon, Fleurie and Brouilly.' },       // real, but unrelated
  { id:4, title:'Good Wine Shop — Chinon 2020', url:'https://goodwineshop.example/chinon-2020',
    citedText:'Olga Raffault Chinon 2020 — $24.99 at Good Wine Shop.' },                     // a merchant, wrong bottle
  { id:5, title:'Jean Foillard — Morgon Côte du Py 2019', url:'https://producer.example/cote-du-py-2019',
    citedText:'Jean Foillard Morgon Côte du Py 2019 was a structured vintage.' },            // right wine, WRONG vintage
];

test('a candidate needs a source that actually supports producer, cuvée and vintage', () => {
  const [ok] = verifiedCandidates([{ ...FOILLARD, sourceIds:[1] }], REGISTRY);
  assert.ok(ok, 'a genuinely supporting citation passes');
  assert.deepEqual(ok.sources, [{ title:'Jean Foillard — Morgon Côte du Py', url:'https://producer.example/cote-du-py' }]);
});

test('ADVERSARIAL: a valid but unrelated sourceId is not evidence — candidate rejected', () => {
  assert.equal(verifiedCandidates([{ ...FOILLARD, sourceIds:[3] }], REGISTRY).length, 0,
    'a real Beaujolais article that never mentions the bottle supports nothing');
  assert.equal(verifiedCandidates([{ ...FOILLARD, sourceIds:[4] }], REGISTRY).length, 0,
    'a real merchant page for a different bottle supports nothing');
  assert.equal(verifiedCandidates([{ ...FOILLARD, sourceIds:[5] }], REGISTRY).length, 0,
    'the same wine in a different vintage is a different bottle');
  assert.equal(verifiedCandidates([{ ...FOILLARD, sourceIds:[99] }], REGISTRY).length, 0, 'an invented id maps to nothing');
  assert.equal(verifiedCandidates([{ ...FOILLARD, sourceIds:[] }], REGISTRY).length, 0);
});

test('unsupporting citations are stripped even when one source genuinely supports', () => {
  const [ok] = verifiedCandidates([{ ...FOILLARD, sourceIds:[1,3,4] }], REGISTRY);
  assert.equal(ok.sources.length, 1, 'only the supporting source decorates the bottle');
  assert.equal(ok.sources[0].url, 'https://producer.example/cote-du-py');
});

test('identity fields are required regardless of sources', () => {
  assert.equal(verifiedCandidates([{ ...FOILLARD, cuvee:'', sourceIds:[1] }], REGISTRY).length, 0);
  assert.equal(verifiedCandidates([{ ...FOILLARD, vintage:'', sourceIds:[1] }], REGISTRY).length, 0);
  assert.equal(verifiedCandidates([{ ...FOILLARD, producer:'', sourceIds:[1] }], REGISTRY).length, 0);
});

test('a price passes only with bottle + amount + merchant context in its own source', () => {
  const [ok] = verifiedCandidates([{ ...FOILLARD, sourceIds:[1], price:34.99, merchant:'Good Wine Shop', priceSourceId:2 }], REGISTRY);
  assert.deepEqual(ok.price, { amount:34.99, merchant:'Good Wine Shop',
    source:{ title:'Good Wine Shop — Foillard Morgon', url:'https://goodwineshop.example/foillard-morgon-2021' } });
});

test('ADVERSARIAL: price sources that do not demonstrably support the claim are refused', () => {
  const base = { ...FOILLARD, sourceIds:[1], merchant:'Good Wine Shop' };
  const drop = (over)=> verifiedCandidates([{ ...base, ...over }], REGISTRY)[0].price;
  assert.equal(drop({ price:34.99, priceSourceId:3 }), null, 'an unrelated publication cannot price a bottle');
  assert.equal(drop({ price:34.99, priceSourceId:4 }), null, 'a merchant listing for a DIFFERENT bottle cannot price this one');
  assert.equal(drop({ price:34.99, priceSourceId:5 }), null, 'a listing for a different vintage cannot price this one');
  assert.equal(drop({ price:29.99, priceSourceId:2 }), null, 'the source must state THIS amount');
  assert.equal(drop({ price:34, priceSourceId:2 }), null, 'a $34.99 listing does not support a claim of exactly $34');
  assert.equal(drop({ price:34.99, priceSourceId:2, merchant:'Some Other Shop' }), null, 'the source must carry THIS merchant');
  assert.equal(drop({ price:34.99, priceSourceId:99 }), null, 'an invented price source id maps to nothing');
  assert.equal(drop({ price:0, priceSourceId:2 }), null, 'a non-positive price is noise, not data');
  assert.equal(drop({ price:34.99 }), null, 'no price source at all');
});

test('a model-provided merchant name plus a valid identity source is insufficient', () => {
  // The identity source (1) is real and supports the bottle — but it is a
  // producer page, not a merchant listing, and it never states the price.
  const [c] = verifiedCandidates([{ ...FOILLARD, sourceIds:[1], price:34.99, merchant:'Good Wine Shop', priceSourceId:1 }], REGISTRY);
  assert.equal(c.price, null);
});

test('merchant context may come from the hostname when the text omits the name', () => {
  const reg = [...REGISTRY,
    { id:6, title:'Foillard Morgon Côte du Py 2021', url:'https://goodwineshop.example/p/12345',
      citedText:'Jean Foillard Morgon Côte du Py 2021 — $34.99.' }];
  const [c] = verifiedCandidates([{ ...FOILLARD, sourceIds:[1], price:34.99, merchant:'goodwineshop', priceSourceId:6 }], reg);
  assert.deepEqual(c.price.source.url, 'https://goodwineshop.example/p/12345');
});

test('amount matching respects digit boundaries', () => {
  const reg = [{ id:1, title:'Jean Foillard Morgon Côte du Py 2034 club', url:'https://x.example/a',
    citedText:'Jean Foillard Morgon Côte du Py 2021, bottle number 2034, sells for $34.00 at Good Wine Shop.' }];
  const base = { ...FOILLARD, sourceIds:[1], merchant:'Good Wine Shop' };
  const [ok] = verifiedCandidates([{ ...base, price:34, priceSourceId:1 }], reg);
  assert.ok(ok.price, '"$34.00" supports amount 34');
  const [bad] = verifiedCandidates([{ ...base, price:203, priceSourceId:1 }], reg);
  assert.equal(bad.price, null, '"2034" never supports amount 203');
});

test('the shortlist is capped at three', () => {
  const many = [0,1,2,3,4].map(()=>({ ...FOILLARD, sourceIds:[1] }));
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
