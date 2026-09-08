// cellarpick.test.js — choosing an owned bottle.
//
// What these prove (acceptance 7 of the brief): the real, non-sample cellar is
// searched; bottles that do not fit are excluded; identical bottles show once
// with a quantity; one lead and at most two alternatives, each with a reason;
// colour and budget follow-ups narrow the pool; grape identity stays canonical.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ownedMatches, cellarPick, bottleReason, targetGrapesOf } from '../src/lib/cellarpick.js';
import { heuristicPairing } from '../src/lib/pairingrules.js';
import { colorOfWine } from '../src/lib/winecolor.js';

const PORK_TACOS = { mode:'pairing', ...heuristicPairing('Best wine for pork tacos') };
const STEAK = { mode:'pairing', ...heuristicPairing('grilled ribeye steak') };

const bottle = (over) => ({ id:'b'+Math.random(), producer:'P', name:'Wine', vintage:'2021', verdict:'buy', sample:false, type:'Red', price:null, flavor:{ body:3, acidity:3, tannin:3 }, ...over });

const CELLAR = [
  bottle({ id:'garnacha-1', producer:'Bodega Norte', name:'Garnacha Rosado', grape:'Garnacha', type:'Rosé', verdict:'buy', price:18 }),
  bottle({ id:'garnacha-2', producer:'Bodega Norte', name:'Garnacha Rosado', grape:'Garnacha', type:'Rosé', verdict:'buy', price:18 }),   // same bottle, second copy
  bottle({ id:'riesling',   producer:'Weingut Süd', name:'Kabinett', grape:'Riesling', type:'White', verdict:'totry', price:22 }),
  bottle({ id:'tempranillo',producer:'Rioja House', name:'Crianza', grape:'Tempranillo', type:'Red', verdict:'maybe', price:34 }),
  bottle({ id:'cab',        producer:'Napa Co', name:'Cabernet Sauvignon', grape:'Cabernet Sauvignon', type:'Red', verdict:'buy', price:60 }),  // on the avoid list
  bottle({ id:'nebbiolo',   producer:'Langhe', name:'Nebbiolo', grape:'Nebbiolo', type:'Red', verdict:'buy' }),                               // on the avoid list
  bottle({ id:'pinot',      producer:'Oregon', name:'Pinot Noir', grape:'Pinot Noir', type:'Red', verdict:'buy', price:30 }),                  // does not fit
  bottle({ id:'sample',     producer:'Demo', name:'Grenache Rosé', grape:'Grenache', type:'Rosé', verdict:'buy', sample:true }),               // a sample: never
];

// ── 8. Only the real, non-sample cellar ─────────────────────────────

test('8. samples are never searched, bottles that do not fit are excluded, identical bottles are one row', () => {
  const ranked = ownedMatches(PORK_TACOS, CELLAR);
  const ids = ranked.map(w => w.id);
  assert.ok(!ids.includes('sample'), 'a sample bottle never appears as something the user owns');
  assert.ok(!ids.includes('pinot'), 'a bottle outside the grape family does not fit');
  assert.ok(!ids.includes('cab') && !ids.includes('nebbiolo'), 'avoid-listed grapes are excluded');
  assert.ok(ids.includes('garnacha-1') || ids.includes('garnacha-2'));
  const garnacha = ranked.find(w => /Garnacha/.test(w.name));
  assert.equal(garnacha.quantity, 2, 'two identical bottles show once with their quantity');
  assert.equal(ranked.filter(w => /Garnacha/.test(w.name)).length, 1);
  assert.ok(ids.includes('riesling'), 'the rule’s alternative grape counts as a fit');
  assert.ok(ids.includes('tempranillo'));
  // An all-sample cellar owns nothing.
  assert.deepEqual(ownedMatches(PORK_TACOS, CELLAR.map(w => ({ ...w, sample:true }))), []);
  assert.deepEqual(ownedMatches(PORK_TACOS, null), []);
});

test('the avoid list excludes a bottle even when its grape is otherwise a target', () => {
  // A synthetic recommendation whose grape family overlaps its own avoid list
  // — the avoid filter must win over the match.
  const result = { mode:'pairing', dish:'a test dish', primary:{ grape:'Riesling', matchGrapes:['Riesling', 'Gewürztraminer'] }, others:[], avoid:['Gewürztraminer'] };
  const ids = ownedMatches(result, [bottle({ id:'gw', grape:'Gewürztraminer', type:'White' }), bottle({ id:'rs', grape:'Riesling', type:'White' })]).map(w => w.id);
  assert.deepEqual(ids, ['rs']);
  // The meal-less tonight flow considers every bottle EXCEPT the avoid list.
  const tonight = { mode:'pairing', matched:false, primary:{ grape:'Pinot Noir', matchGrapes:['Pinot Noir'] }, others:[], avoid:['Cabernet Sauvignon'] };
  const open = ownedMatches(tonight, [bottle({ id:'cab', grape:'Cabernet Sauvignon' }), bottle({ id:'gamay', grape:'Gamay' })], { guidedTonight:true }).map(w => w.id);
  assert.deepEqual(open, ['gamay']);
});

test('one lead and at most two alternatives, each with a reason from the bottle’s own facts', () => {
  const pick = cellarPick(PORK_TACOS, CELLAR);
  assert.ok(pick.lead, 'a lead bottle');
  assert.equal(pick.alternatives.length, 2, 'no more than two alternatives');
  assert.equal(pick.count, 3);
  // Even with many fitting bottles the decision stays one lead + two.
  const big = [...CELLAR, bottle({ id:'t2', producer:'Otra', name:'Tempranillo Joven', grape:'Tempranillo' }), bottle({ id:'r2', producer:'Alsace', name:'Riesling', grape:'Riesling', type:'White' })];
  assert.equal(cellarPick(PORK_TACOS, big).alternatives.length, 2);
  assert.equal(pick.note, '');
  assert.equal(pick.lead.wine.id, 'garnacha-1', 'Buy Again + quantity leads');
  assert.match(pick.lead.reason, /Garnacha/);
  assert.match(pick.lead.reason, /Mexican pork tacos/);
  assert.match(pick.lead.reason, /Buy Again/);
  assert.match(pick.lead.reason, /2 bottles/);
  for (const a of pick.alternatives){
    assert.ok(a.direction && a.direction.length > 3, 'each alternative says how it differs');
    assert.ok(a.reason.length > 20, 'and why it fits');
  }
  const riesling = pick.alternatives.find(a => a.wine.id === 'riesling');
  assert.match(riesling.reason, /unopened/i, 'an unopened bottle says so');
  // No reason may contain a claim the cellar record does not hold.
  const all = [pick.lead.reason, ...pick.alternatives.map(a => a.reason)].join(' ');
  assert.ok(!/\$\s?\d|\bpoints\b|\brated\b|critic/i.test(all));
});

test('an empty result is honest and points to the shelf guidance', () => {
  const pick = cellarPick(PORK_TACOS, [bottle({ id:'pinot', grape:'Pinot Noir' })]);
  assert.equal(pick.lead, null);
  assert.deepEqual(pick.alternatives, []);
  assert.equal(pick.count, 0);
  assert.match(pick.note, /Nothing you own fits/);
  assert.match(pick.note, /Mexican pork tacos/);
  const red = cellarPick(PORK_TACOS, [bottle({ id:'r', grape:'Riesling', type:'White' })], { color:'red' });
  assert.match(red.note, /as a red wine/);
});

// ── Colour and budget follow-ups narrow the cellar honestly ─────────

test('a colour request keeps only bottles of that colour; a dislike removes it', () => {
  const reds = ownedMatches(PORK_TACOS, CELLAR, { color:'red' }).map(w => w.id);
  assert.deepEqual(reds, ['tempranillo']);
  const noRose = ownedMatches(PORK_TACOS, CELLAR, { dislikeColors:['rose'] }).map(w => w.id);
  assert.ok(!noRose.some(id => id.startsWith('garnacha')));
  assert.ok(noRose.includes('riesling'));
  assert.equal(colorOfWine({ type:'Rosé' }), 'rose');
  assert.equal(colorOfWine({ grape:'Pinot Grigio' }), 'white');
  assert.equal(colorOfWine({ name:'Mystery Cuvée' }), null, 'an unknown colour is never assumed');
});

test('a budget excludes bottles known to cost more; unknown prices pass', () => {
  const under20 = ownedMatches(PORK_TACOS, CELLAR, { limit:20 }).map(w => w.id);
  assert.ok(under20.includes('garnacha-1') || under20.includes('garnacha-2'));
  assert.ok(!under20.includes('riesling'), '$22 is over a $20 limit');
  assert.ok(!under20.includes('tempranillo'));
  const cheapSteak = ownedMatches(STEAK, [bottle({ id:'malbec', grape:'Malbec', price:null }), bottle({ id:'malbec2', name:'Reserva', grape:'Malbec', price:80 })], { limit:25 }).map(w => w.id);
  assert.deepEqual(cheapSteak, ['malbec'], 'unknown price passes; a known $80 does not');
  // An explicit limit overrides the result's own.
  assert.equal(ownedMatches({ ...PORK_TACOS, limit:15 }, CELLAR, { limit:100 }).length, 3);
});

// ── 17. Canonical grape identity survives in cellar matching ────────

test('17. Cabernet Sauvignon ≠ Cabernet Franc and Pinot Noir ≠ Pinot Grigio in cellar picks', () => {
  const chimichurri = { mode:'pairing', ...heuristicPairing('steak with chimichurri') };   // matchGrapes: Malbec, Syrah, Cabernet Franc
  const franc = bottle({ id:'franc', grape:'Cabernet Franc' });
  const sauv = bottle({ id:'sauv', grape:'Cabernet Sauvignon' });
  const ids = ownedMatches(chimichurri, [franc, sauv]).map(w => w.id);
  assert.ok(ids.includes('franc'));
  assert.ok(!ids.includes('sauv'), 'a Cabernet Sauvignon is not a Cabernet Franc');
  const pesto = { mode:'pairing', ...heuristicPairing('pesto pasta') };                     // Pinot Noir
  const grigio = bottle({ id:'grigio', grape:'Pinot Grigio', type:'White' });
  const noir = bottle({ id:'noir', grape:'Pinot Noir' });
  const pinots = ownedMatches(pesto, [grigio, noir]).map(w => w.id);
  assert.ok(pinots.includes('noir'));
  assert.ok(!pinots.includes('grigio'), 'a Pinot Grigio is not a Pinot Noir');
  assert.ok(targetGrapesOf(pesto).includes('Pinot Noir'));
});

test('bottleReason speaks only from the bottle record and the recommendation', () => {
  const w = bottle({ grape:'Tempranillo', verdict:'maybe', quantity:1 });
  const r = bottleReason(w, PORK_TACOS);
  assert.match(r, /Tempranillo is the style recommended here for Mexican pork tacos/);
  assert.match(r, /Maybe/);
  assert.equal(bottleReason(bottle({ grape:'Riesling', verdict:'no' }), PORK_TACOS).includes('Buy Again'), false);
});
