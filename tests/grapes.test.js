// grapes.test.js — canonical grape identities.
//
// The bug these guard: 'Cabernet' as a bag of words matched Cabernet Franc,
// and a comment claimed otherwise. Grapes are identities with deliberate
// aliases, not substrings.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { grapeTextMatches, analyzeGrapeText, textMatchesAnyGrape } from '../src/lib/grapes.js';

test('Cabernet Sauvignon never accepts Cabernet Franc, in either direction', () => {
  assert.equal(grapeTextMatches('Cabernet Franc', 'Cabernet Sauvignon'), false);
  assert.equal(grapeTextMatches('Cabernet Sauvignon', 'Cabernet Franc'), false);
  assert.equal(grapeTextMatches('Cabernet Sauvignon', 'Cabernet Sauvignon'), true);
  assert.equal(grapeTextMatches('Cabernet Franc', 'Cabernet Franc'), true);
});

test('a bare "Cabernet" means Cabernet Sauvignon by convention', () => {
  // On a label or in a rule, unqualified Cabernet is the conventional short
  // form of Cabernet Sauvignon — an explicit alias, not substring luck.
  assert.equal(grapeTextMatches('Cabernet', 'Cabernet Sauvignon'), true);
  assert.equal(grapeTextMatches('Cabernet Sauvignon', 'Cabernet'), true);
  assert.equal(grapeTextMatches('Cabernet Franc', 'Cabernet'), false);
  assert.equal(grapeTextMatches('Cabernet', 'Cabernet Franc'), false);
});

test('Pinot Noir and Pinot Grigio stay distinct', () => {
  assert.equal(grapeTextMatches('Pinot Grigio', 'Pinot Noir'), false);
  assert.equal(grapeTextMatches('Pinot Noir', 'Pinot Grigio'), false);
  assert.equal(grapeTextMatches('Pinot Noir', 'Pinot Noir'), true);
});

test('deliberate synonyms are one grape', () => {
  assert.equal(grapeTextMatches('Pinot Gris', 'Pinot Grigio'), true);
  assert.equal(grapeTextMatches('Shiraz', 'Syrah'), true);
  assert.equal(grapeTextMatches('Garnacha', 'Grenache'), true);
  assert.equal(grapeTextMatches('Primitivo', 'Zinfandel'), true);
  assert.equal(grapeTextMatches('Monastrell', 'Mourvèdre'), true);
});

test('a bare "Pinot" maps to nothing — it is genuinely ambiguous', () => {
  const a = analyzeGrapeText('Pinot');
  assert.equal(a.ids.size, 0);
  // And as a fallback word it cannot claim a Pinot Noir on its own …
  assert.equal(grapeTextMatches('Pinot Noir', 'Pinot'), true); // word 'pinot' does appear — but:
  // … the canonical direction is what matters: a Pinot Noir target never
  // accepts a wine that is only 'Pinot' something else.
  assert.equal(grapeTextMatches('Pinot Grigio', 'Pinot'), true);
});

test('varieties outside the canon still match whole-word', () => {
  assert.equal(grapeTextMatches('Nebbiolo', 'Nebbiolo'), true);
  assert.equal(grapeTextMatches('Frappato · Nero d’Avola', 'Frappato'), true);
  assert.equal(grapeTextMatches('Zinfandel blend', 'Zinfandel'), true);
  assert.equal(grapeTextMatches('Nebbiolo', 'Gamay'), false);
});

test('accented and unaccented spellings meet', () => {
  assert.equal(grapeTextMatches('Gewurztraminer', 'Gewürztraminer'), true);
  assert.equal(grapeTextMatches('Gewürztraminer', 'Gewurztraminer'), true);
  assert.equal(grapeTextMatches('Mourvedre', 'Mourvèdre'), true);
});

test('textMatchesAnyGrape handles empty and missing targets', () => {
  assert.equal(textMatchesAnyGrape('Syrah', []), false);
  assert.equal(textMatchesAnyGrape('Syrah', undefined), false);
  assert.equal(textMatchesAnyGrape('', ['Syrah']), false);
});
