// conversation.test.js — the Sommelier conversation engine.
//
// These are the acceptance tests for the conversational stage, numbered as in
// the brief where they map directly. Each proves BEHAVIOUR through the pure
// engine (planTurn and friends), not through a screenshot: what the sommelier
// asks before it answers, what a follow-up keeps, what it changes, what it
// refuses to invent, and what it hands to research instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  planTurn, composeClarified, detectFollowUp, classifyIntent, extractContext, explainFollowUp,
  applyHeat, colorSwap, sourcesFor, factorsFor, researchQuestion, researchContext, historyFor,
  followUpActions, summaryOf, locateGrape, styleDetailsFor, lastPairing, TACO_FILLINGS, MEAL_CHOICES,
} from '../src/lib/conversation.js';
import { emptyConversation, appendUserTurn, appendAnswer, withContext } from '../src/lib/conversation-store.js';
import { instantPairing } from '../src/lib/answerflow.js';
import { heuristicPairing, COLOR_SWAPS, STYLE_DETAILS } from '../src/lib/pairingrules.js';
import { colorOfGrape } from '../src/lib/winecolor.js';

const pairingScreenSource = readFileSync(new URL('../src/components/pairing.jsx', import.meta.url), 'utf8');
const sommelierSource = readFileSync(new URL('../supabase/functions/sommelier/index.ts', import.meta.url), 'utf8');

// Simulate the screen executing an instant plan and recording the answer.
function answered(conv, question, options = {}){
  const plan = planTurn(question, conv, options);
  assert.equal(plan.kind, 'instant', `${question} should answer instantly, got ${plan.kind}`);
  const data = { ...instantPairing(plan.result), pendingResearch:false };
  let next = appendUserTurn(conv, question, plan.intent);
  next = withContext(next, plan.context);
  next = appendAnswer(next, { asked:question, summary:summaryOf(data), data, intent:plan.intent, effectiveQuery:plan.effectiveQuery, mode:'pairing' });
  return { conv: next, plan, data };
}

// The canonical thread: "Best wine for tacos?" → pork → the pork-taco answer.
function porkTacoConversation(){
  const c0 = emptyConversation();
  const ask = planTurn('Best wine for tacos?', c0);
  const q = composeClarified(ask.pending, 'pork');
  return answered(c0, q, { clarified: ask.pending });
}

// ── 1. "Best wine for tacos?" asks what kind before recommending ────

test('1. an unspecified taco question asks for the filling — no fallback card first', () => {
  const plan = planTurn('Best wine for tacos?', emptyConversation());
  assert.equal(plan.kind, 'clarify');
  assert.equal(plan.question.id, 'taco-filling');
  assert.equal(plan.result, undefined, 'no recommendation travels with a clarification');
  assert.ok(plan.question.choices.length >= 5, 'quick choices');
  assert.equal(plan.question.allowText, true, 'and a typed answer is always allowed');
  assert.deepEqual(plan.question.choices, TACO_FILLINGS);
  // The screen renders it through the existing guided taco UI.
  assert.match(pairingScreenSource, /needsTacoGuidance\(Q\)[\s\S]*?setPhase\('guide-taco'\)/);
  assert.match(pairingScreenSource, /phase==='guide-taco'[\s\S]*?<TacoChoices/);
});

// ── 2. "Best wine for pork tacos" considers the preparation ─────────

test('2. pork tacos are understood as the whole dish, never as roast chicken or plain pork', () => {
  const plan = planTurn('Best wine for pork tacos', emptyConversation());
  assert.equal(plan.kind, 'instant');
  assert.equal(plan.result.ruleId, 'pork-tacos');
  assert.notEqual(plan.result.ruleId, 'poultry');
  assert.notEqual(plan.result.ruleId, 'pork');
  assert.equal(plan.result.dish, 'Mexican pork tacos');
  assert.match(plan.result.primary.why, /taco|Mexican/i);
  assert.match(plan.result.primary.why, /chile|salsa|lime/i);
  assert.doesNotMatch(plan.result.primary.why, /chicken/i);
  // The context captured the dish, not just the protein.
  assert.equal(plan.context.protein, 'pork');
  assert.equal(plan.context.cuisine, 'Mexican');
  assert.equal(plan.context.dishQuery, 'Best wine for pork tacos');
  // And the guided path composes the same question.
  assert.equal(composeClarified({ id:'taco-filling' }, 'pork'), 'Best wine for pork tacos');
});

// ── 3. "What should I open tonight?" asks meal and mood, then leads with an owned bottle ──

test('3. an ambiguous tonight decision asks first, then the guided answer leads from the cellar', () => {
  const plan = planTurn('What should I open tonight?', emptyConversation());
  assert.equal(plan.kind, 'clarify');
  assert.equal(plan.question.id, 'tonight-meal', 'meal first (the screen asks mood next)');
  assert.deepEqual(plan.question.choices, MEAL_CHOICES);
  // The guided answer, as the screen composes it after meal + mood.
  const guided = planTurn('What should I open tonight with steak? I want bold.', emptyConversation(), { guidedTonight:true, mood:'bold', mealLabel:'Steak', hasMeal:true });
  assert.equal(guided.kind, 'instant');
  assert.equal(guided.leadWithCellar, true, 'an owned bottle leads');
  assert.equal(guided.cellarOptions.guidedTonight, true);
  assert.equal(guided.cellarOptions.mood, 'bold');
  assert.equal(guided.result.ruleId, 'grilled-red-meat');
  // The screen's mood step still exists.
  assert.match(pairingScreenSource, /phase==='guide-mood'[\s\S]*?<TonightChoices step="mood"/);
});

// ── 4. Specific context answers immediately ─────────────────────────

test('4. "What should I open with steak and mushroom sauce tonight?" answers immediately, cellar first', () => {
  const plan = planTurn('What should I open with steak and mushroom sauce tonight?', emptyConversation());
  assert.equal(plan.kind, 'instant', 'no clarification when the question already says enough');
  assert.equal(plan.intent, 'cellar');
  assert.equal(plan.leadWithCellar, true);
  assert.equal(plan.result.ruleId, 'steak-mushroom', 'the compound dish, not plain steak');
  assert.equal(plan.result.primary.grape, 'Syrah');
  assert.equal(plan.context.sauce, 'mushroom');
  assert.equal(plan.context.protein, 'beef');
  assert.equal(plan.context.occasion, 'tonight');
});

// ── 5. "Why rosé instead of Riesling?" keeps the pork-taco context ──

test('5. a why-question keeps the original pork-taco context and answers from the rule that was used', () => {
  const { conv, data } = porkTacoConversation();
  assert.equal(data.primary.grape, 'Dry Rosé');
  const plan = planTurn('Why rosé instead of Riesling?', conv);
  assert.equal(plan.kind, 'explanation', 'answered locally, no research needed');
  assert.equal(plan.followUp, 'why-instead');
  assert.match(plan.answer.text, /Mexican pork tacos/, 'the dish is remembered, not re-asked');
  assert.match(plan.answer.text, /Dry Rosé leads/);
  assert.match(plan.answer.text, /Riesling/);
  assert.match(plan.answer.text, /softer for more heat/i, 'Riesling is explained as the rule’s own alternative');
  assert.deepEqual(plan.answer.sources, [], 'no invented sources');
  assert.equal(plan.answer.basis, 'rule');
  assert.ok(plan.answer.factors.some(f => /pork-tacos/.test(f)), 'names the guidance it used');
  // The context is untouched by a why-question.
  assert.equal(plan.context.dishQuery, 'Best wine for pork tacos');
});

// ── 6. "I don't like rosé. Give me a red." revises without losing the dish ──

test('6. a colour change revises the answer and keeps the dish', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn("I don't like rosé. Give me a red.", conv);
  assert.equal(plan.kind, 'instant');
  assert.equal(plan.followUp, 'color');
  assert.equal(plan.result.dish, 'Mexican pork tacos', 'the dish survives');
  assert.equal(plan.result.ruleId, 'pork-tacos');
  assert.equal(colorOfGrape(plan.result.primary.grape), 'red', 'the lead is now a red');
  assert.equal(plan.result.primary.grape, 'Gamay');
  assert.match(plan.result.primary.why, /pork tacos/i);
  assert.match(plan.result.primary.why, /tannin/i);
  assert.equal(plan.result.adjusted, 'color');
  assert.ok(plan.result.primary.lookFor.length >= 2, 'a swapped card keeps practical shelf clues');
  assert.ok(!plan.result.others.some(o => /ros/i.test(o.grape)), 'the disliked colour does not come back as an alternative');
  assert.equal(plan.context.color, 'red');
  assert.deepEqual(plan.context.dislikeColors, ['rose']);
  assert.equal(plan.cellarOptions.color, 'red', 'and the cellar is searched for reds only');
  assert.match(plan.effectiveQuery, /pork tacos/);
});

test('6b. "white instead" promotes the rule’s own white alternative with region-level detail', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('white instead', conv);
  assert.equal(plan.kind, 'instant');
  assert.equal(plan.result.primary.grape, 'Off-dry Riesling');
  assert.match(plan.result.primary.deeperTitle, /Mosel|Kabinett/);
  assert.ok(plan.result.primary.lookFor.length >= 2);
  assert.ok(plan.result.others.some(o => o.grape === 'Dry Rosé'), 'the original lead stays available when not disliked');
});

test('6c. a colour with no reviewed answer is handed to research with the dish — never invented', () => {
  // The cheese board has no reviewed rosé entry in its own alternatives or the swap table.
  const { conv } = answered(emptyConversation(), 'wine for a cheese board');
  assert.equal(COLOR_SWAPS['cheese-charcuterie'].rose, undefined);
  const plan = planTurn('rosé instead', conv);
  assert.equal(plan.kind, 'research');
  assert.match(plan.question, /cheese board/i, 'the research question carries the dish');
  assert.match(plan.question, /rosé/i);
  assert.equal(plan.fallback, 'message', 'a failed research never shows an unrelated card');
});

// ── 7. "What if the salsa is very hot?" changes the reasoning ───────

test('7. real heat changes the recommendation logic, not just the label', () => {
  const { conv, data } = porkTacoConversation();
  const plan = planTurn('What if the salsa is very hot?', conv);
  assert.equal(plan.kind, 'instant');
  assert.equal(plan.followUp, 'modify');
  assert.equal(plan.context.heat, 'hot');
  assert.equal(plan.context.dishQuery, 'Best wine for pork tacos', 'still pork tacos');
  assert.equal(plan.result.ruleId, 'pork-tacos');
  assert.equal(plan.result.adjusted, 'heat');
  assert.notEqual(plan.result.primary.grape, data.primary.grape, 'the lead moved');
  assert.equal(plan.result.primary.grape, 'Off-dry Riesling', 'toward the rule’s own off-dry alternative');
  assert.match(plan.result.primary.why, /sweetness|alcohol|tannin/i);
  assert.match(plan.result.avoidNote, /hot|heat/i);
  assert.ok(plan.result.avoid.includes('Malbec'), 'the heat avoid list travels');
  assert.ok(plan.result.others.some(o => o.grape === 'Dry Rosé' && /moderate/i.test(o.direction)), 'the original lead is kept for moderate heat');
});

test('7b. heat on a dish with no off-dry alternative keeps the lead but carries the warning', () => {
  const r = applyHeat(heuristicPairing('steak with mushroom sauce'));
  assert.equal(r.primary.grape, 'Syrah');
  assert.equal(r.adjusted, 'heat');
  assert.match(r.avoidNote, /heat/i);
  assert.match(r.primary.why, /alcohol|tannin/i);
});

// ── 8. "Do I already own something?" searches only the real cellar ──

test('8. the cellar follow-up is a cellar plan for the current pairing, scoped to real bottles', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('Do I already own something?', conv);
  assert.equal(plan.kind, 'cellar');
  assert.equal(plan.pairing.ruleId, 'pork-tacos', 'the current recommendation is what the cellar is searched against');
  assert.equal(plan.context.cellarOnly, true);
  assert.equal(plan.context.dishQuery, 'Best wine for pork tacos');
  // (The sample-exclusion proof itself lives in cellarpick.test.js.)
  assert.match(pairingScreenSource, /plan\.kind === 'cellar'[\s\S]*?cellarPick\(plan\.pairing, wines, plan\.options\)/);
});

// ── 9. "Something under $25" keeps the request and applies the budget ──

test('9. a budget follow-up keeps the dish and applies the new limit', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('Give me something under $25.', conv);
  assert.equal(plan.kind, 'instant');
  assert.equal(plan.followUp, 'budget');
  assert.equal(plan.result.ruleId, 'pork-tacos');
  assert.equal(plan.result.limit, 25);
  assert.equal(plan.context.budget, 25);
  assert.equal(plan.cellarOptions.limit, 25, 'owned bottles known to cost more are excluded');
  assert.match(plan.effectiveQuery, /pork tacos.*under \$25/);
});

test('9b. "something cheaper" with no number asks for the ceiling instead of guessing one', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('something cheaper', conv);
  assert.equal(plan.kind, 'clarify');
  assert.equal(plan.question.id, 'budget');
  assert.ok(plan.question.choices.every(c => typeof c.value === 'number'));
  assert.equal(composeClarified(plan.pending, 25), 'something under $25');
  const next = planTurn(composeClarified(plan.pending, 25), conv, { clarified: plan.pending });
  assert.equal(next.kind, 'instant');
  assert.equal(next.result.limit, 25);
  assert.equal(next.result.ruleId, 'pork-tacos', 'the clarified budget still applies to the pork tacos');
});

// ── 10. "Why not Cabernet?" compares with the current recommendation ──

test('10. "Why not Cabernet?" is answered against the current recommendation from its avoid list', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('Why not Cabernet?', conv);
  assert.equal(plan.kind, 'explanation');
  assert.equal(plan.followUp, 'why-not');
  assert.match(plan.answer.text, /Cabernet Sauvignon is on the avoid list for Mexican pork tacos/);
  assert.match(plan.answer.text, /tannin|alcohol|oak/i, 'the rule’s own avoid note is the reason');
  assert.match(plan.answer.text, /Dry Rosé leads/);
});

test('10b. a grape the rule never mentions is not improvised — research gets the question WITH the dish', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('Why not Nero d’Avola?', conv);
  assert.equal(plan.kind, 'research', 'the reviewed rule has nothing to say about it');
  assert.equal(plan.followUp, 'why-not');
  assert.match(plan.question, /pork/i);
  assert.match(plan.question, /Dry Rosé/, 'the current suggestion travels too');
  assert.match(plan.question, /Nero d’Avola/);
  assert.equal(plan.expects, 'answer');
});

test('10c. a comparison of the two current choices comes from their own directions and reasons', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('Compare those two choices.', conv);
  assert.equal(plan.kind, 'explanation');
  assert.equal(plan.followUp, 'compare');
  assert.match(plan.answer.text, /^- Dry Rosé \(the lead\)/m);
  assert.match(plan.answer.text, /^- Sparkling Brut Rosé \(bubbly and refreshing\)/m);
});

// ── 11. "What source supports that?" returns only sources actually used ──

test('11. a sources request returns exactly the answer’s own sources — none when none were used', () => {
  const { conv } = porkTacoConversation();
  const none = planTurn('What source supports that?', conv);
  assert.equal(none.kind, 'explanation');
  assert.equal(none.followUp, 'sources');
  assert.deepEqual(none.answer.sources, []);
  assert.match(none.answer.text, /no public source was consulted/i);
  assert.equal(none.answer.offerResearch, true, 'and offers to go and check');

  // The same question after research attached two real sources and a third
  // was never attached: only the two come back.
  const used = [{ title:'Rhône pairing guide', url:'https://magazine.example/rhone' }, { title:'Appellation body', url:'https://appellation.example/tavel' }];
  const enriched = { ...conv, current:{ ...conv.current, data:{ ...conv.current.data, sources: used, researchStatus:'researched', enriched:true } } };
  const some = planTurn('What source supports that?', enriched);
  assert.deepEqual(some.answer.sources, used);
  assert.match(some.answer.text, /actually drew on/);
  assert.equal(some.answer.offerResearch, false);

  // Malformed or non-https entries never render as sources.
  assert.deepEqual(sourcesFor({ sources:[{ title:'x', url:'javascript:alert(1)' }, { url:'https://ok.example' }, null, { title:'ok', url:'https://ok.example/a' }] }),
    [{ title:'ok', url:'https://ok.example/a' }]);
});

test('11b. preferred voices are never listed as sources unless actually attached', () => {
  const { conv } = porkTacoConversation();
  const plan = planTurn('What source supports that?', conv);
  const all = JSON.stringify(plan.answer);
  assert.ok(!/Suckling|Wine Access|Normal People/i.test(all), 'a preference is not a citation');
});

// ── 12. "Explain Beaujolais" stays educational ──────────────────────

test('12. "Explain Beaujolais" is an explainer — research-first, never a pairing card, even mid-conversation', () => {
  for (const conv of [emptyConversation(), porkTacoConversation().conv]){
    const plan = planTurn('Explain Beaujolais', conv);
    assert.equal(plan.kind, 'research');
    assert.equal(plan.intent, 'explain');
    assert.equal(plan.expects, 'answer');
    assert.equal(plan.fallback, 'message', 'if research fails the user gets an honest message, not a Pinot Noir card');
    assert.equal(plan.result, undefined);
  }
  // The screen honours it: a research failure falls back to a pairing card
  // ONLY when the plan says so and the question is a food question.
  assert.match(pairingScreenSource, /plan\.fallback === 'pairing' && isPairingQuery\(/);
});

test('intent classification: the review-blocker questions never become pairings, and food questions do', () => {
  assert.equal(classifyIntent('What should I drink with pesto pasta?'), 'pairing');
  assert.equal(classifyIntent('pizza'), 'pairing');
  assert.equal(classifyIntent('What should I open tonight?'), 'cellar');
  assert.equal(classifyIntent('Should I buy this bottle?'), 'evaluate');
  assert.equal(classifyIntent('Is 2021 a good vintage?'), 'explain');
  assert.equal(classifyIntent('What wine should I buy?'), 'shop');
  assert.equal(classifyIntent('Best Pinot Noir under $25'), 'shop');
  assert.equal(classifyIntent('Similar to Oregon Pinot Noir'), 'shop');
  assert.equal(classifyIntent('Barolo vs Barbaresco?'), 'compare');
  assert.equal(classifyIntent('Explain Chenin Blanc'), 'explain');
  assert.equal(classifyIntent('What wine is Barolo?'), 'explain');
  assert.equal(classifyIntent('Why do I like Nebbiolo?'), 'explain');
  assert.equal(classifyIntent('What food pairs with red wine?'), 'explain', 'a reverse pairing is an explainer, not a dish');
  assert.equal(classifyIntent('What are the must-try wines for a Nebbiolo lover?'), 'discover');
});

test('unclear intent never gets a generic recommendation', () => {
  // Occasion with no dish → ask what is on the menu, never the versatile card.
  const party = planTurn('What should I bring to a dinner party?', emptyConversation());
  assert.equal(party.kind, 'clarify');
  assert.equal(party.question.id, 'meal');
  // Unqualified shopping → ask what for.
  const shop = planTurn('What wine should I buy?', emptyConversation());
  assert.equal(shop.kind, 'clarify');
  assert.equal(shop.question.id, 'shop-goal');
  // An exact-bottle evaluation with no bottle → ask which bottle.
  const buy = planTurn('Should I buy this bottle?', emptyConversation());
  assert.equal(buy.kind, 'clarify');
  assert.equal(buy.question.id, 'bottle-identity');
  assert.equal(composeClarified(buy.pending, null, 'Meiomi Pinot Noir 2021'), 'Should I buy Meiomi Pinot Noir 2021?');
  // At most one clarification: the composed question answers immediately.
  const after = planTurn(composeClarified(party.pending, 'steak'), emptyConversation(), { clarified: party.pending });
  assert.equal(after.kind, 'instant');
  assert.equal(after.result.ruleId, 'grilled-red-meat');
});

// ── 15. Stale-response routing (the store tests prove the guard) ────

test('15. the screen applies research and enrichment only while the turn is current', () => {
  assert.match(pairingScreenSource, /const guard = turnGuard\(\)/);
  assert.match(pairingScreenSource, /const token = guard\.next\(\)/);
  // Both the success path and the failure path of a research round-trip
  // check the token before touching the screen.
  const guardChecks = pairingScreenSource.match(/if \(!guard\.isCurrent\(token\) \|\| !mounted\.current\) return;/g) || [];
  assert.ok(guardChecks.length >= 2, `expected the token check on success and failure paths, found ${guardChecks.length}`);
  const researchBody = pairingScreenSource.slice(pairingScreenSource.indexOf('const runResearch'), pairingScreenSource.indexOf('const run = async'));
  assert.match(researchBody, /await withTimeout\([\s\S]*?clearTimeout\(slowTimer\);\s*if \(!guard\.isCurrent\(token\)/, 'the check happens immediately after the response arrives');
  assert.match(researchBody, /catch\(e\)\{[\s\S]*?if \(!guard\.isCurrent\(token\)/, 'and immediately on failure');
  assert.match(pairingScreenSource, /isCurrentRun: guard\.isCurrent\(token\)/, 'enrichment goes through the same disposition rule');
  assert.match(pairingScreenSource, /const cancel = \(\)=>\{\s*guard\.invalidate\(\)/, 'Cancel makes the in-flight response stale');
  assert.match(pairingScreenSource, /const startNew = \(\)=>\{\s*guard\.invalidate\(\)/, 'New question makes the in-flight response stale');
  assert.match(pairingScreenSource, /clearConversation\(userId\)/, 'and discards the stored thread');
});

// ── 16. Evidence-first questions still require verified evidence ────

test('16. exact-bottle, price, rating and vintage questions are research-first with evidence required', () => {
  const buy = planTurn('Should I buy Meiomi Pinot Noir 2021?', emptyConversation());
  assert.equal(buy.kind, 'research');
  assert.equal(buy.intent, 'evaluate');
  assert.equal(buy.requiresEvidence, true);
  assert.equal(buy.fallback, 'message', 'no rule card can stand in for a bottle verdict');
  const price = planTurn('How much does Meiomi Pinot Noir 2021 cost?', emptyConversation());
  assert.equal(price.intent, 'evaluate');
  assert.equal(price.requiresEvidence, true);
  const rating = planTurn('What rating did Tignanello 2019 get?', emptyConversation());
  assert.equal(rating.intent, 'evaluate');
  assert.equal(rating.requiresEvidence, true);
  const vintage = planTurn('Is 2021 a good vintage for Barolo?', emptyConversation());
  assert.equal(vintage.kind, 'research');
  assert.equal(vintage.intent, 'explain');
  // The screen's failure copy for these says it will not guess.
  assert.match(pairingScreenSource, /plan\.requiresEvidence[\s\S]*?won’t guess at a bottle, price, rating or vintage/);
  // And the server still verifies bottles deterministically (trust.test.js
  // and research.test.js prove the boundary itself).
  assert.match(sommelierSource, /verifiedSommelierBottle\(/);
});

// ── Reasoning follow-ups when the current answer came from research ──

test('follow-ups on a written research answer keep the previous question and go to research with it', () => {
  let conv = emptyConversation();
  conv = appendUserTurn(conv, 'Best Pinot Noir under $40', 'shop');
  conv = withContext(conv, { budget: 40 });
  conv = appendAnswer(conv, { asked:'Best Pinot Noir under $40', summary:'A written answer', data:{ mode:'answer', text:'Look to Oregon…', sources:[] }, intent:'shop' });
  const cheaper = planTurn('something under $25', conv);
  assert.equal(cheaper.kind, 'research');
  assert.match(cheaper.question, /Best Pinot Noir under \$40/);
  assert.match(cheaper.question, /under \$25/);
  const why = planTurn('Why?', conv);
  assert.equal(why.kind, 'research');
  assert.equal(why.followUp, 'why');
  const src = planTurn('Show sources', conv);
  assert.equal(src.kind, 'explanation', 'sources are always answered locally');
  assert.deepEqual(src.answer.sources, []);
});

// ── Follow-up detection and context merging ─────────────────────────

test('follow-up detection: natural phrasings are recognised, new topics are not swallowed', () => {
  const { conv } = porkTacoConversation();
  const kinds = (q) => detectFollowUp(q, conv)?.kind ?? null;
  assert.equal(kinds('Why this?'), 'why');
  assert.equal(kinds('What else would work?'), 'alternatives');
  assert.equal(kinds('That doesn’t sound right.'), 'challenge');
  assert.equal(kinds('Red instead'), 'color');
  assert.equal(kinds('Do I already own something?'), 'cellar');
  assert.equal(kinds('Check my cellar'), 'cellar');
  assert.equal(kinds('Something under $25'), 'budget');
  assert.equal(kinds('What source supports that?'), 'sources');
  assert.equal(kinds('Show sources'), 'sources');
  assert.equal(kinds('What if the salsa is very hot?'), 'modify');
  assert.equal(kinds('lighter'), 'modify');
  assert.equal(kinds('Compare those two choices.'), 'compare');
  // New topics.
  assert.equal(kinds('Explain Beaujolais'), null);
  assert.equal(kinds('Barolo vs Barbaresco?'), null);
  assert.equal(kinds('What should I drink with pesto pasta?'), null);
  assert.equal(kinds('Should I buy this bottle?'), null);
  // No conversation → nothing is a follow-up.
  assert.equal(detectFollowUp('Why this?', emptyConversation()), null);
  assert.equal(detectFollowUp('Why this?', null), null);
});

test('a dish change inside a conversation swaps the dish but keeps the constraints', () => {
  const { conv } = porkTacoConversation();
  const budget = planTurn('under $25', conv);
  let next = appendUserTurn(conv, 'under $25', 'pairing');
  next = withContext(next, budget.context);
  next = appendAnswer(next, { asked:'under $25', summary:'x', data:{ ...instantPairing(budget.result), pendingResearch:false }, intent:'pairing', effectiveQuery:budget.effectiveQuery, mode:'pairing' });
  const swapped = planTurn('what about fish tacos instead?', next);
  assert.equal(swapped.kind, 'instant');
  assert.equal(swapped.result.ruleId, 'fish-tacos');
  assert.equal(swapped.context.budget, 25, 'the budget carries over');
  assert.equal(swapped.result.limit, 25);
  assert.equal(swapped.context.dishQuery, 'fish tacos instead', 'the dish is the new one');
});

test('the whole dish is extracted, not just the protein', () => {
  const ctx = extractContext('grilled pork tacos with very hot salsa verde and pickled onions, under $30, want a red');
  assert.equal(ctx.protein, 'pork');
  assert.equal(ctx.preparation, 'grilled');
  assert.equal(ctx.sauce, 'salsa');
  assert.equal(ctx.cuisine, 'Mexican');
  assert.equal(ctx.heat, 'hot');
  assert.deepEqual(ctx.toppings, ['salsa verde', 'pickled onions']);
  assert.equal(ctx.acidity, true);
  assert.equal(ctx.budget, 30);
  assert.equal(ctx.color, 'red');
  const cream = extractContext('chicken in a rich cream sauce for date night');
  assert.equal(cream.sauce, 'cream');
  assert.equal(cream.richness, true);
  assert.equal(cream.occasion, 'date night');
  // Food colour words are not wine colour requests.
  assert.equal(extractContext('pasta with red sauce').color, undefined);
  assert.equal(extractContext('grilled white fish').color, undefined);
  assert.equal(extractContext('red meat on the grill').color, undefined);
});

// ── Local explanations never invent ─────────────────────────────────

test('explanations are built only from the rule’s own text and the answer’s own sources', () => {
  const { conv, data } = porkTacoConversation();
  const why = explainFollowUp({ kind:'why' }, conv);
  assert.ok(why.text.includes(data.primary.why), 'the why is the rule’s why, verbatim');
  assert.deepEqual(why.sources, []);
  assert.ok(!/\$\s?\d|\b\d{2,3}\s?points\b|rated\b/i.test(why.text), 'no invented price or score');
  const alt = explainFollowUp({ kind:'alternatives' }, conv);
  for (const o of data.others) assert.ok(alt.text.includes(o.why));
  const challenge = explainFollowUp({ kind:'challenge' }, conv);
  assert.match(challenge.text, /what I weighed/i);
  assert.ok(challenge.choices.some(c => c.value === '__research'), 'a challenge can escalate to public sources');
  assert.equal(locateGrape(data, 'Brut Rosé')?.where, 'other');
  assert.equal(locateGrape(data, 'the sparkling')?.where, 'other');
  assert.equal(locateGrape(data, 'Cabernet')?.where, 'avoid');
  assert.equal(locateGrape(data, 'Zinfandel'), null);
});

test('factors describe the dish and the evidence status honestly', () => {
  const { conv, data } = porkTacoConversation();
  const f = factorsFor(conv.context, data);
  assert.ok(f.includes('the pork'));
  assert.ok(f.some(x => /Mexican/.test(x)));
  assert.ok(f.some(x => /reviewed pairing guidance \(pork-tacos\)/.test(x)));
  assert.ok(f.some(x => /no public source was used/.test(x)));
  const cited = factorsFor(conv.context, { ...data, sources:[{ title:'a', url:'https://a.example' }] });
  assert.ok(cited.some(x => /1 public source actually cited/.test(x)));
});

// ── Research handoff: context travels, cellar contents never do ─────

test('research follow-ups carry the meal and constraints, never cellar contents or notes', () => {
  const { conv, data } = porkTacoConversation();
  const withBudget = { ...conv, context:{ ...conv.context, budget:25, color:'red' } };
  const q = researchQuestion('Why not Nero d’Avola?', withBudget, data);
  assert.match(q, /pork/);
  assert.match(q, /Dry Rosé/);
  assert.match(q, /under \$25/);
  assert.match(q, /red wine/);
  assert.match(q, /Question: Why not Nero d’Avola\?$/);
  const ctx = researchContext(withBudget, data);
  assert.match(ctx, /meal: /);
  assert.ok(ctx.length <= 600);
  // Nothing about the user's bottles can appear: the context has no field for them.
  const leaky = { ...withBudget, context:{ ...withBudget.context, notes:'my private note', producer:'Domaine Secret', cellar:['Secret Cuvée 2019'] } };
  const leakedText = researchQuestion('why?', leaky, data) + researchContext(leaky, data);
  assert.ok(!/Secret|private note/.test(leakedText));
  // History is bounded and text-only.
  const h = historyFor({ turns: Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? 'sommelier' : 'user', text: 'x'.repeat(500), at: i })) });
  assert.equal(h.length, 6);
  assert.ok(h.every(t => t.text.length <= 300 && ['user','sommelier'].includes(t.role)));
});

test('the sommelier function reads every request field through the shared sanitiser and keeps the privacy rule', () => {
  assert.match(sommelierSource, /import \{ sanitizeSommelierRequest \} from "\.\.\/_shared\/request-sanitize\.js"/);
  assert.match(sommelierSource, /const clean = sanitizeSommelierRequest\(body\);/);
  assert.match(sommelierSource, /const \{ query, ownedGrapes, owned, context, intent \} = clean;/);
  // No request field is read raw from the body any more.
  const handler = sommelierSource.slice(sommelierSource.indexOf('Deno.serve'));
  const rawReads = handler.match(/body\.[a-zA-Z]+/g) || [];
  assert.deepEqual(rawReads, [], `raw body reads: ${rawReads.join(', ')}`);
  assert.doesNotMatch(handler, /JSON\.stringify\(body/, 'nothing client-provided is serialised as-is');
  assert.match(sommelierSource, /Never put a person's name, street address, email, account detail, private note, or cellar contents into a search query/);
  assert.match(sommelierSource, /researchQuestion\(query, context\)/);
  assert.match(sommelierSource, /blocked_domains:\s*\["vivino\.com"\]/, 'the Vivino exclusion is preserved');
});

// ── Reviewed swap data meets the same standard as the rules ─────────

test('colour swaps and style details name styles, never bottles, prices or scores', () => {
  const hasVintage = (s) => /\b(19|20)\d{2}\b/.test(s || '');
  const forbidden = /\$\s?\d|\b\d{2,3}\s?points\b|\bin stock\b|\bavailable now\b|\brated\b/i;
  const entries = [...Object.values(COLOR_SWAPS).flatMap(o => Object.values(o)), ...Object.values(STYLE_DETAILS)];
  assert.ok(entries.length >= 20);
  for (const e of entries){
    assert.ok(e.grape && e.deeperTitle && Array.isArray(e.lookFor) && e.lookFor.length >= 2, `${e.grape}: incomplete swap entry`);
    assert.ok(!hasVintage(e.grape) && !hasVintage(e.deeperTitle), `${e.grape}: names a vintage`);
    for (const clue of e.lookFor) assert.ok(!hasVintage(clue), `${e.grape}: a clue names a vintage`);
    assert.ok(!forbidden.test([e.why, e.deeper, ...e.lookFor].join(' ')), `${e.grape}: unverifiable claim`);
    assert.ok(Array.isArray(e.matchGrapes) && e.matchGrapes.length, `${e.grape}: no grape family for cellar matching`);
  }
  // Every swap entry really is the colour it claims to be.
  for (const [ruleId, byColor] of Object.entries(COLOR_SWAPS)){
    for (const [color, e] of Object.entries(byColor)) assert.equal(colorOfGrape(e.grape), color, `${ruleId}.${color} is ${e.grape}`);
  }
  assert.equal(styleDetailsFor('Off-dry Riesling').deeperTitle, STYLE_DETAILS['off-dry riesling'].deeperTitle);
  assert.equal(styleDetailsFor('Syrah').deeperTitle, 'Northern Rhône Syrah — Crozes-Hermitage or Saint-Joseph', 'a rule lends its region title');
  assert.deepEqual(styleDetailsFor('Syrah').lookFor, [], 'but never its dish-specific clues');
});

test('colorSwap reports when the lead already is that colour and honours dislikes', () => {
  const steak = heuristicPairing('grilled ribeye steak');
  assert.equal(colorSwap(steak, 'red').sameColor, true);
  const white = colorSwap(steak, 'white', ['red']);
  assert.equal(white.primary.grape, 'Chardonnay');
  assert.ok(!white.others.some(o => o.grape === 'Malbec'), 'a disliked red does not return as the alternative');
  assert.equal(colorSwap(heuristicPairing('a cheese board'), 'rose'), null);
});

// ── Follow-up actions and summaries ─────────────────────────────────

test('follow-up actions match the brief and adapt to the lead’s colour', () => {
  const rose = followUpActions({ mode:'pairing', primary:{ grape:'Dry Rosé' } }).map(a => a.label);
  assert.deepEqual(rose, ['Why this?', 'What else?', 'White instead', 'Red instead', 'Something cheaper', 'Check my cellar', 'Show sources']);
  const red = followUpActions({ mode:'pairing', primary:{ grape:'Syrah' } }).map(a => a.label);
  assert.ok(red.includes('White instead') && !red.includes('Red instead'));
  const cellar = followUpActions({ mode:'cellar', pairing:{ mode:'pairing', primary:{ grape:'Syrah' } } }).map(a => a.label);
  assert.ok(!cellar.includes('Check my cellar'));
  assert.deepEqual(followUpActions({ mode:'answer', text:'x' }).map(a => a.label), ['Show sources', 'Tell me more']);
  // Every action is an ordinary question the engine understands as a follow-up.
  const { conv } = porkTacoConversation();
  for (const a of followUpActions(conv.current.data)){
    assert.ok(detectFollowUp(a.value, conv), `${a.label} is not recognised as a follow-up`);
  }
  assert.equal(summaryOf({ mode:'pairing', primary:{ grape:'Syrah', deeperTitle:'Northern Rhône' } }), 'Syrah · Northern Rhône');
  assert.equal(summaryOf({ mode:'cellar', lead:{ producer:'P', name:'Syrah', vintage:'2021' } }), 'From your cellar: P Syrah 2021');
});

test('guided and seeded questions are new topics, never follow-ups', () => {
  const { conv } = porkTacoConversation();
  const tonight = planTurn('What should I open tonight? I want bold.', conv, { guidedTonight:true, mood:'bold', mealLabel:'No food', hasMeal:false });
  assert.equal(tonight.kind, 'instant');
  assert.equal(tonight.leadWithCellar, true);
  assert.equal(tonight.result.ruleId, 'general-versatile', 'no meal: a ranked cellar decision, not the taco context');
  const seeded = planTurn('What should I open tonight?', conv, { newTopic:true });
  assert.equal(seeded.kind, 'clarify');
  assert.equal(seeded.question.id, 'tonight-meal');
  assert.match(pairingScreenSource, /run\(initialQuery, \{ newTopic:true \}\)/);
});

test('the guided tonight answer offers follow-up actions, and "why this?" explains the bottle decision', () => {
  // Chat layout: quick replies sit above the composer for every current
  // answer (pairing, written, explanation, cellar), never gated on the flow.
  const composer = pairingScreenSource.slice(pairingScreenSource.indexOf('Quick replies + composer'));
  assert.match(composer, /\{showingAnswer && <FollowUpBar data=\{data\} onAsk=\{\(v\)=>run\(v\)\}\/>\}/, 'one bar, above the composer, for any current answer');
  assert.doesNotMatch(pairingScreenSource, /guidedTonight && <FollowUpBar/);
  assert.match(pairingScreenSource, /const showingAnswer = \['pairing','answer','explanation','cellar'\]\.includes\(phase\) && data && !data\.transient;/);
  // The thread shows every earlier answer from its stored, sanitised data.
  assert.match(pairingScreenSource, /turns\.map\(\(t,i\)=> t\.role==='user'/);
  assert.match(pairingScreenSource, /t\.data \? cardFor\(hydrate\(t\.data\), false\)/);
  // Actions on a tonight answer omit the redundant cellar check.
  const tonight = { mode:'pairing', guidedTonight:true, tonightReason:'It fits steak and gives you bold tonight.', primary:{ grape:'Malbec' }, others:[] };
  const labels = followUpActions(tonight).map(a => a.label);
  assert.ok(labels.includes('Why this?') && labels.includes('Show sources'));
  assert.ok(!labels.includes('Check my cellar'));
  // "Why this?" explains the decision that was actually made.
  let conv = emptyConversation();
  conv = appendUserTurn(conv, 'What should I open tonight with steak? I want bold.', 'cellar');
  conv = withContext(conv, { dishQuery:'What should I open tonight with steak? I want bold.', dishLabel:'grilled red meat' });
  conv = appendAnswer(conv, { asked:'What should I open tonight with steak? I want bold.', summary:'Malbec', data: tonight, intent:'cellar', mode:'pairing' });
  const why = planTurn('Why this?', conv);
  assert.equal(why.kind, 'explanation');
  assert.equal(why.answer.text, 'It fits steak and gives you bold tonight.');
});

test('a why-question does not make the sommelier forget the meal: the next budget or colour follow-up is still instant', () => {
  const { conv } = porkTacoConversation();
  const why = planTurn('Why that instead of Riesling?', conv);
  assert.equal(why.kind, 'explanation');
  assert.doesNotMatch(why.answer.text, /not that/i, '"that" refers to the lead, it is not a grape');
  let next = appendUserTurn(conv, 'Why that instead of Riesling?', 'followup');
  next = appendAnswer(next, { asked:'Why that instead of Riesling?', summary:'x', data: why.answer, intent:'followup', mode:'explanation' });
  const budget = planTurn('something under $25', next);
  assert.equal(budget.kind, 'instant', 'the pairing behind the explanation is still the subject');
  assert.equal(budget.result.ruleId, 'pork-tacos');
  assert.equal(budget.result.limit, 25);
  const red = planTurn('red instead', next);
  assert.equal(red.kind, 'instant');
  assert.equal(red.result.primary.grape, 'Gamay');
  const cellar = planTurn('do I already own something?', next);
  assert.equal(cellar.kind, 'cellar');
  assert.equal(cellar.pairing.ruleId, 'pork-tacos');
  const sources = planTurn('what source supports that?', next);
  assert.equal(sources.kind, 'explanation');
  assert.match(sources.answer.text, /reviewed pairing guidance/);
  assert.equal(lastPairing(next).ruleId, 'pork-tacos');
  assert.equal(lastPairing(emptyConversation()), null);
});
