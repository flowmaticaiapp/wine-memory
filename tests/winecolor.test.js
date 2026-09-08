// winecolor.test.js — colour identity for grapes, styles and owned bottles.
// Unknown stays unknown: nothing is rounded to red.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { colorOfGrape, colorOfWine, requestedColor } from '../src/lib/winecolor.js';

test('grapes and styles resolve to their colour, with compound names read in the right order', () => {
  assert.equal(colorOfGrape('Syrah'), 'red');
  assert.equal(colorOfGrape('Cabernet Sauvignon'), 'red');
  assert.equal(colorOfGrape('Cabernet Franc'), 'red');
  assert.equal(colorOfGrape('Pinot Noir'), 'red');
  assert.equal(colorOfGrape('Pinot Grigio'), 'white');
  assert.equal(colorOfGrape('Pinot Gris'), 'white');
  assert.equal(colorOfGrape('Off-dry Riesling'), 'white');
  assert.equal(colorOfGrape('Unoaked Chardonnay'), 'white');
  assert.equal(colorOfGrape('Dry Rosé'), 'rose');
  assert.equal(colorOfGrape('Garnacha rosado'), 'rose', 'pink before the grape');
  assert.equal(colorOfGrape('Sparkling Brut Rosé'), 'sparkling', 'bubbles before pink');
  assert.equal(colorOfGrape('Champagne'), 'sparkling');
  assert.equal(colorOfGrape('Tawny Port'), 'fortified');
  assert.equal(colorOfGrape('Albariño'), 'white');
  assert.equal(colorOfGrape('Txakoli'), 'white');
  assert.equal(colorOfGrape('Frappato'), 'red');
});

test('unknown names are null, never guessed', () => {
  assert.equal(colorOfGrape('Mystery Cuvée'), null);
  assert.equal(colorOfGrape(''), null);
  assert.equal(colorOfGrape(null), null);
  assert.equal(colorOfGrape('Portugal'), null, 'no substring match on “port”');
});

test('owned bottles use their recorded type first, then grape or name', () => {
  assert.equal(colorOfWine({ type:'Red', grape:'Riesling' }), 'red', 'the record wins over the grape');
  assert.equal(colorOfWine({ type:'Sparkling' }), 'sparkling');
  assert.equal(colorOfWine({ type:'Rosé' }), 'rose');
  assert.equal(colorOfWine({ type:'Dessert' }), 'fortified');
  assert.equal(colorOfWine({ grape:'Gamay' }), 'red');
  assert.equal(colorOfWine({ name:'Brut Réserve' }), 'sparkling');
  assert.equal(colorOfWine({ name:'Estate Cuvée' }), null);
  assert.equal(colorOfWine(null), null);
});

test('requestedColor reads colour words only', () => {
  assert.equal(requestedColor('give me a red'), 'red');
  assert.equal(requestedColor('white instead'), 'white');
  assert.equal(requestedColor('something pink'), 'rose');
  assert.equal(requestedColor('bubbles please'), 'sparkling');
  assert.equal(requestedColor('a Syrah'), null, 'a red grape is not a colour word');
});
