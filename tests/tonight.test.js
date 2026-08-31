import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsTonightGuidance, moodScore, rankTonightBottles, tonightReason, alternativeDirection } from '../src/lib/tonight.js';
import { hasSpecificFoodContext } from '../src/lib/pairingrules.js';

test('ambiguous tonight decisions ask questions before recommending', () => {
  const ambiguous = 'What should I open tonight?';
  assert.equal(needsTonightGuidance(ambiguous, hasSpecificFoodContext(ambiguous)), true);
  assert.equal(needsTonightGuidance('What should I pour tonight?', false), true);
});

test('a tonight question with real food context answers immediately', () => {
  for (const q of [
    'What should I open with steak and mushroom sauce tonight?',
    'What should I drink tonight with pierogi casserole?',
    'Tonight, what should I pour with seafood?',
  ]) assert.equal(needsTonightGuidance(q, hasSpecificFoodContext(q)), false, q);
});

test('guided cellar choices exclude samples, deduplicate bottles and stop at three wines', () => {
  const wines = [
    { id:'a', producer:'P', name:'Syrah', vintage:'2021', verdict:'buy', sample:false, type:'Red', flavor:{body:5,tannin:4} },
    { id:'b', producer:'P', name:'Syrah', vintage:'2021', verdict:'buy', sample:false, type:'Red', flavor:{body:5,tannin:4} },
    { id:'sample', producer:'Demo', name:'Cabernet', vintage:'2020', verdict:'buy', sample:true, type:'Red', flavor:{body:5,tannin:5} },
    { id:'c', producer:'P', name:'Gamay', vintage:'2022', verdict:'buy', sample:false, type:'Red', flavor:{body:2,tannin:1} },
    { id:'d', producer:'P', name:'Chardonnay', vintage:'2023', verdict:'maybe', sample:false, type:'White', flavor:{body:3,acidity:4} },
    { id:'e', producer:'P', name:'Rosé', vintage:'2024', verdict:'totry', sample:false, type:'Rosé', flavor:{body:1,acidity:4} },
  ];
  const ranked = rankTonightBottles(wines, 'bold');
  assert.equal(ranked.length, 3);
  assert.equal(ranked[0].name, 'Syrah');
  assert.equal(ranked[0].quantity, 2);
  assert.ok(!ranked.some(w=>w.id==='sample'));
});

test('mood changes ranking and explanations stay bounded to the user’s choice', () => {
  const light = { type:'White', flavor:{body:1,acidity:5} };
  const bold = { type:'Red', flavor:{body:5,tannin:5} };
  assert.ok(moodScore(light,'light') > moodScore(bold,'light'));
  assert.ok(moodScore(bold,'bold') > moodScore(light,'bold'));
  const adventurous = rankTonightBottles([
    { id:'known', producer:'P', name:'Known', vintage:'2021', verdict:'buy', sample:false },
    { id:'new', producer:'P', name:'Untried', vintage:'2022', verdict:'totry', sample:false },
  ], 'different');
  assert.equal(adventurous[0].id, 'new', 'something different prefers an owned bottle not yet rated');
  assert.match(tonightReason('Steak','bold',true), /steak.*bold/i);
  assert.match(alternativeDirection(bold,light), /lighter|brighter/i);
});
