// pairing.test.js — guards for the Phase 1 rule: uncertainty changes the
// ANSWER, not just a label underneath it.
//
// The behaviour these protect is easy to undo by accident. A future edit that
// makes the fallback name a bottle, or that lets an unmatched dish present as
// though it were understood, would pass a build and look fine in a screenshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DISH_RULES, DEFAULT_RULE, heuristicPairing, priceLimit, isPairingQuery } from '../src/lib/pairingrules.js';

// ── An unmatched dish must not pretend it was understood ────────────

test('a matched dish reports matched:true and names its rule', () => {
  const r = heuristicPairing('what should I drink with pizza?');
  assert.equal(r.matched, true);
  assert.equal(r.ruleId, 'tomato-red-sauce');
  assert.equal(r.dish, 'pizza & red sauce');
});

test('an unmatched dish reports matched:false so the answer can soften', () => {
  const r = heuristicPairing('what goes with my grandmother’s pierogi casserole?');
  assert.equal(r.matched, false);
  assert.equal(r.ruleId, 'general-versatile');
  // The UI keys off `matched` to say "a good general starting point" rather
  // than "For this meal" — which would imply the dish had been recognised.
});

// ── No rule may name a purchasable bottle ───────────────────────────

test('every rule recommends a grape or style, never a producer and cuvee', () => {
  // A bottle recommendation looks like "Producer Cuvee Vintage". The guard is
  // that these fields stay short style names and never acquire a year.
  const hasVintage = (s) => /\b(19|20)\d{2}\b/.test(s || '');
  for (const rule of [...DISH_RULES, DEFAULT_RULE]) {
    assert.ok(!hasVintage(rule.primary.grape), `${rule.id}: primary grape names a vintage`);
    assert.ok(rule.primary.grape.split(/\s+/).length <= 4, `${rule.id}: primary grape looks like a bottle name`);
    for (const o of rule.others) {
      assert.ok(!hasVintage(o.grape), `${rule.id}: alternative names a vintage`);
    }
  }
});

test('no rule states a price, score or availability claim', () => {
  const forbidden = /\$\s?\d|\b\d{2,3}\s?points\b|\bin stock\b|\bavailable now\b|\brated\b/i;
  for (const rule of [...DISH_RULES, DEFAULT_RULE]) {
    const prose = [rule.primary.why, rule.primary.deeper, ...rule.others.map(o => o.why)].join(' ');
    assert.ok(!forbidden.test(prose), `${rule.id}: rule prose makes an unverifiable claim`);
  }
});

test('every rule carries a stable id for later source citation', () => {
  const ids = [...DISH_RULES, DEFAULT_RULE].map(r => r.id);
  assert.ok(ids.every(Boolean), 'a rule is missing an id');
  assert.equal(new Set(ids).size, ids.length, 'rule ids are not unique');
});

// ── Supporting helpers ──────────────────────────────────────────────

test('priceLimit reads a budget without inventing one', () => {
  assert.equal(priceLimit('best Pinot Noir under $25'), 25);
  assert.equal(priceLimit('something below $40 please'), 40);
  assert.equal(priceLimit('what goes with steak'), null);
});

test('isPairingQuery still routes food questions to the rule set', () => {
  assert.equal(isPairingQuery('what wine with roast chicken?'), true);
  assert.equal(isPairingQuery('pizza'), true);
});
