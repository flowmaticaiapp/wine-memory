// pairing.test.js — guards for the Phase 1 rule: uncertainty changes the
// ANSWER, not just a label underneath it.
//
// The behaviour these protect is easy to undo by accident. A future edit that
// makes the fallback name a bottle, or that lets an unmatched dish present as
// though it were understood, would pass a build and look fine in a screenshot.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DISH_RULES, DEFAULT_RULE, heuristicPairing, priceLimit, isPairingQuery, hasSpecificFoodContext, pairingHeadline } from '../src/lib/pairingrules.js';

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

// ── The classifier requires a pairing SIGNAL, never punctuation ─────
// An earlier version treated any question containing "?" as a pairing
// question, which flashed the versatile Pinot Noir card for questions whose
// honest answers need evidence. These four are ChatGPT-review release
// blockers and must stay research-first forever.

test('evidence-first questions are NEVER classified as pairing questions', () => {
  assert.equal(isPairingQuery('Should I buy this bottle?'), false);
  // Unqualified "what wine"/"which wine" is buying advice, self-reflection,
  // or a comparison — never a dish. (v4 review blocker.)
  assert.equal(isPairingQuery('What wine should I buy?'), false);
  assert.equal(isPairingQuery('Which wine is better?'), false);
  assert.equal(isPairingQuery('What wine do I like?'), false);
  assert.equal(isPairingQuery('What wine is Barolo?'), false);
  assert.equal(isPairingQuery('Why do I like Nebbiolo?'), false);
  assert.equal(isPairingQuery('Is 2021 a good vintage?'), false);
  assert.equal(isPairingQuery('Barolo vs Barbaresco?'), false);
  // And the rest of the research-first family stays put.
  assert.equal(isPairingQuery('Explain Beaujolais'), false);
  assert.equal(isPairingQuery('Explain Chenin Blanc'), false);
  assert.equal(isPairingQuery('Best Pinot Noir under $25'), false);
  assert.equal(isPairingQuery('Similar to Oregon Pinot Noir'), false);
  assert.equal(isPairingQuery(''), false);
  assert.equal(isPairingQuery('?'), false, 'a question mark is punctuation, not a dish');
});

test('genuine food questions keep their instant answer, matched or not', () => {
  // Matched dish rules.
  assert.equal(isPairingQuery('steak with mushroom sauce'), true);
  assert.equal(isPairingQuery('What wine pairs with steak?'), true);
  assert.equal(isPairingQuery('What should I drink with pesto pasta?'), true);
  // Unmatched but genuinely about food or a meal occasion.
  assert.equal(isPairingQuery('what goes with pierogi casserole?'), true);
  assert.equal(isPairingQuery("my grandmother's pierogi casserole"), true);
  assert.equal(isPairingQuery('What should I open tonight?'), true);
  assert.equal(isPairingQuery('What should I bring to a dinner party?'), true);
  assert.equal(isPairingQuery('What food pairs with red wine?'), true);
  // And each of these still reaches heuristicPairing usefully.
  assert.equal(heuristicPairing('what goes with pierogi casserole?').matched, false, 'honest versatile fallback');
  assert.ok(heuristicPairing('what goes with pierogi casserole?').primary.grape);
});

test('specific food context is distinct from a generic meal occasion', () => {
  assert.equal(hasSpecificFoodContext('What should I open tonight?'), false);
  assert.equal(hasSpecificFoodContext('What should I open for dinner?'), false);
  assert.equal(hasSpecificFoodContext('What should I open with steak and mushroom sauce tonight?'), true);
  assert.equal(hasSpecificFoodContext('What should I drink with pierogi casserole tonight?'), true);
});

// ── The pairing-answer standard ─────────────────────────────────────
// A pairing explanation is incomplete if it only describes abstract
// characteristics. Every rule must translate them into something findable.

test('every rule tells the user what to look for in a shop', () => {
  for (const rule of [...DISH_RULES, DEFAULT_RULE]) {
    const lf = rule.primary.lookFor;
    assert.ok(Array.isArray(lf) && lf.length >= 2, `${rule.id}: needs at least two practical clues`);
    assert.ok(lf.every(s => typeof s === 'string' && s.length > 12), `${rule.id}: a clue is too thin to act on`);
  }
});

test('every alternative says how it changes the experience', () => {
  for (const rule of [...DISH_RULES, DEFAULT_RULE]) {
    for (const o of rule.others) {
      assert.ok(o.direction && o.direction.length > 3, `${rule.id}: alternative "${o.grape}" has no direction`);
      assert.ok(o.direction.split(/\s+/).length <= 4, `${rule.id}: direction should be a short phrase`);
    }
  }
});

test('rules reach region or appellation specificity, not just a characteristic', () => {
  // deeperTitle is the region/appellation rung of the ladder. It must name a
  // place, not restate an adjective.
  for (const rule of [...DISH_RULES, DEFAULT_RULE]) {
    assert.ok(rule.primary.deeperTitle && rule.primary.deeperTitle.length > 4, `${rule.id}: no region-level guidance`);
  }
});

test('avoid notes exist only where a real conflict does', () => {
  // An avoid note on every rule would be manufactured caution. Some dishes
  // genuinely have no meaningful conflict.
  const withNote = [...DISH_RULES, DEFAULT_RULE].filter(r => r.avoidNote);
  assert.ok(withNote.length > 0, 'no rule warns about anything');
  assert.ok(withNote.length < DISH_RULES.length + 1, 'every rule warns — that is manufactured caution');
});

test('look-for clues never name a specific purchasable bottle', () => {
  // A producer plus a vintage is a bottle recommendation, which requires
  // verification the app does not have.
  for (const rule of [...DISH_RULES, DEFAULT_RULE]) {
    for (const clue of rule.primary.lookFor) {
      assert.ok(!/\b(19|20)\d{2}\b/.test(clue), `${rule.id}: a clue names a vintage`);
    }
  }
});

// ── Compound dishes ─────────────────────────────────────────────────
// A sauce or preparation can change the pairing more than the protein does.
// Each result must explain BOTH major elements of the dish.

test('steak with mushroom sauce reaches the compound rule, not plain steak', () => {
  const r = heuristicPairing('what should I drink with steak with mushroom sauce?');
  assert.equal(r.ruleId, 'steak-mushroom');
  assert.equal(r.primary.grape, 'Syrah');
  assert.match(r.primary.deeperTitle, /Crozes-Hermitage|Saint-Joseph/);
  // The explanation must speak to both elements: body for the steak, savoury
  // character for the mushrooms, and fruit against the umami.
  assert.match(r.primary.why, /steak|beef/i);
  assert.match(r.primary.why, /mushroom/i);
  assert.match(r.primary.why, /umami|earth|savoury|savory/i);
});

test('mushroom sauce before the steak still reaches the compound rule', () => {
  const r = heuristicPairing('mushroom sauce over a grilled ribeye');
  assert.equal(r.ruleId, 'steak-mushroom');
});

test('plain steak still reaches the plain steak rule', () => {
  const r = heuristicPairing('grilled ribeye steak');
  assert.equal(r.ruleId, 'grilled-red-meat');
});

test('steak with chimichurri favours the fresher Malbec style', () => {
  const r = heuristicPairing('steak with chimichurri');
  assert.equal(r.ruleId, 'steak-chimichurri');
  assert.equal(r.primary.grape, 'Malbec');
  assert.match(r.primary.why, /beef|steak|grill/i);
  assert.match(r.primary.why, /chimichurri|herb/i);
});

test('chicken with cream sauce goes to Chardonnay, not shellfish or plain poultry', () => {
  const r = heuristicPairing('chicken with cream sauce');
  assert.equal(r.ruleId, 'chicken-cream');
  assert.equal(r.primary.grape, 'Chardonnay');
  assert.match(r.primary.why, /chicken|bird/i);
  assert.match(r.primary.why, /cream/i);
});

test('pork tacos reach their own rule and never masquerade as roast chicken', () => {
  for (const question of ['best wine type for pork tacos', 'tacos with pork', 'carnitas tacos', 'tacos al pastor']){
    const r = heuristicPairing(question);
    assert.equal(r.ruleId, 'pork-tacos', question);
    assert.equal(r.dish, 'pork tacos');
    assert.equal(r.primary.grape, 'Dry Rosé');
    assert.match(r.primary.why, /pork/i);
    assert.match(r.primary.why, /chile|lime|salsa|taco/i);
  }
});

test('plain pork is distinct from poultry, while spice can still lead the pairing', () => {
  assert.equal(heuristicPairing('wine with a pork chop').ruleId, 'pork');
  assert.equal(heuristicPairing('spicy pork curry').ruleId, 'spicy-heat');
  assert.equal(heuristicPairing('roast chicken').ruleId, 'poultry');
});

test('creamy shellfish still reaches its own rule', () => {
  const r = heuristicPairing('creamy shellfish pasta');
  assert.equal(r.ruleId, 'cream-shellfish');
});

test('spicy tomato pasta balances both elements with Barbera', () => {
  const r = heuristicPairing('spicy tomato pasta');
  assert.equal(r.ruleId, 'spicy-tomato');
  assert.equal(r.primary.grape, 'Barbera');
  assert.match(r.primary.why, /tomato/i);
  assert.match(r.primary.why, /chilli|chili|heat|spice/i);
});

test('plain spicy food and plain tomato pasta keep their own rules', () => {
  assert.equal(heuristicPairing('spicy thai curry').ruleId, 'spicy-heat');
  assert.equal(heuristicPairing('what goes with pizza?').ruleId, 'tomato-red-sauce');
});

// ── The warning survives when the AI is unavailable ─────────────────

test('heuristicPairing carries avoidNote through to the screen', () => {
  // The fallback path is exactly when a warning matters most — the AI is not
  // there to phrase it. A rule with a meaningful conflict must deliver it.
  const r = heuristicPairing('spicy thai curry');
  assert.ok(r.avoidNote && r.avoidNote.length > 10, 'the spicy rule has a real warning and it must travel');
  // And a rule without a conflict passes an empty note, never undefined.
  const calm = heuristicPairing('grilled ribeye steak');
  assert.equal(calm.avoidNote, '');
});

// ── Unmatched-dish uncertainty is visible ───────────────────────────

test('an unrecognised dish presents as a versatile starting point', () => {
  const unknown = heuristicPairing('my grandmother’s pierogi casserole');
  assert.equal(unknown.matched, false);
  assert.equal(pairingHeadline(unknown), 'A versatile starting point');

  const known = heuristicPairing('what goes with pizza?');
  assert.equal(pairingHeadline(known), 'For pizza & red sauce');

  // AI results carry no matched flag; they keep the dish headline.
  assert.equal(pairingHeadline({ dish:'grilled salmon' }), 'For grilled salmon');
});
