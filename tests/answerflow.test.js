// answerflow.test.js — instant answer, background research, timeout, and the
// reconciliation rule.
//
// What these guard: a known pairing question must be useful immediately and
// must NEVER have its on-screen recommendation replaced by a contradictory or
// less-specific late research response; a stale response must not touch the
// screen; a bottle claim must not survive without cited sources; and research
// must sit behind a firm timeout so nothing spins indefinitely.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RESEARCH_TIMEOUT_MS, withTimeout, instantEligible, instantPairing, reconcileEnrichment,
  enrichmentDisposition, pairingBasis,
} from '../src/lib/answerflow.js';
import { heuristicPairing } from '../src/lib/pairingrules.js';

// A matched-rule instant answer (steak + mushroom → Syrah, Northern Rhône).
const INSTANT = instantPairing(heuristicPairing('steak with mushroom sauce'));
// The unmatched versatile fallback.
const VERSATILE = instantPairing(heuristicPairing("my grandmother's pierogi casserole"));

const SOURCED = [{ title:'Producer page', url:'https://example.com/wine' }];

function researchedPairing(over = {}){
  return {
    kind:'pairing', dish:'steak with mushroom sauce',
    primary:{ grape:'Syrah', why:'Peppery Syrah meets both the beef and the mushrooms.',
      deeperTitle:'Northern Rhône Syrah — Crozes-Hermitage', deeper:'Savoury, structured Syrah.',
      lookFor:['Crozes-Hermitage on the label'], matchGrapes:['Syrah'], bottle:'', bottleWhy:'' },
    others:[{ direction:'Softer', grape:'Merlot', why:'Rounder tannin.' }],
    avoidNote:'', sources:[], researchStatus:'no_evidence',
    ...over,
  };
}

// ── The two-second behaviour ─────────────────────────────────────────

test('a known pairing question yields an instant, useful rule answer', () => {
  assert.equal(INSTANT.mode, 'pairing');
  assert.equal(INSTANT.matched, true);
  assert.equal(INSTANT.primary.grape, 'Syrah');
  assert.equal(INSTANT.basis, 'rule', 'the instant answer declares built-in guidance');
  assert.equal(INSTANT.pendingResearch, true, 'research is still running behind it');
});

test('food pairings render instantly, but an ambiguous tonight decision never does', () => {
  // Matched dish rules.
  assert.equal(instantEligible('steak with mushroom sauce'), true);
  assert.equal(instantEligible('spicy tomato pasta'), true);
  // Pairing questions no rule recognises still render instantly — the honest
  // versatile card, then research enriches or corrects.
  assert.equal(instantEligible('What should I open tonight?'), false, 'the guided cellar flow must ask before recommending');
  assert.equal(instantEligible('What should I open with steak and mushroom sauce tonight?'), true, 'specific context needs no extra questions');
  assert.equal(instantEligible('What should I bring to a dinner party?'), true);
  assert.equal(instantEligible('what goes with pierogi casserole?'), true);
  // And the versatile instant answer presents itself honestly.
  assert.equal(VERSATILE.matched, false);
  assert.equal(VERSATILE.basis, 'rule');
  assert.ok(VERSATILE.primary.grape, 'still a useful recommendation');
  // Non-pairing questions keep research-first waiting — including the four
  // review-blocker questions that must NEVER flash the versatile card.
  assert.equal(instantEligible('What wine pairs with steak?'), true);
  assert.equal(instantEligible('Should I buy this bottle?'), false);
  assert.equal(instantEligible('What wine should I buy?'), false);
  assert.equal(instantEligible('Which wine is better?'), false);
  assert.equal(instantEligible('What wine do I like?'), false);
  assert.equal(instantEligible('What wine is Barolo?'), false);
  assert.equal(instantEligible('Why do I like Nebbiolo?'), false);
  assert.equal(instantEligible('Is 2021 a good vintage?'), false);
  assert.equal(instantEligible('Barolo vs Barbaresco?'), false);
  assert.equal(instantEligible('Explain Beaujolais'), false);
  assert.equal(instantEligible('Best Pinot Noir under $25'), false);
  assert.equal(instantEligible(''), false);
  assert.equal(instantEligible(null), false);
});

test('the timeout is firm and flags itself', async () => {
  assert.ok(RESEARCH_TIMEOUT_MS >= 5_000 && RESEARCH_TIMEOUT_MS <= 60_000,
    'a firm, human-scale ceiling');
  const never = new Promise(() => {});
  // The watchdog makes a broken timeout FAIL this test rather than hang it:
  // if withTimeout never rejects, the watchdog wins the race and the
  // assertion below sees the wrong error.
  const watchdog = new Promise((resolve) => setTimeout(() => resolve('watchdog: nothing timed out'), 500));
  const result = await Promise.race([
    withTimeout(never, 10).then(() => 'resolved', (e) => (e.timeout === true ? 'timed out with flag' : 'rejected without flag')),
    watchdog,
  ]);
  assert.equal(result, 'timed out with flag');
});

test('a fast response passes through the timeout untouched', async () => {
  const r = await withTimeout(Promise.resolve({ ok:true }), 5_000);
  assert.deepEqual(r, { ok:true });
});

// ── Reconciliation: what a late response may change ──────────────────

test('agreeing research merges in: richer explanation, sources, status', () => {
  const rec = reconcileEnrichment(INSTANT, researchedPairing({ sources: SOURCED, researchStatus:'researched' }));
  assert.equal(rec.accepted, true);
  assert.equal(rec.data.primary.grape, 'Syrah');
  assert.equal(rec.data.sources.length, 1);
  assert.equal(rec.data.researchStatus, 'researched');
  assert.equal(rec.data.enriched, true);
  assert.equal(rec.data.pendingResearch, false);
});

test('contradictory research never replaces a matched rule answer', () => {
  const contradiction = researchedPairing({
    primary:{ grape:'Pinot Grigio', why:'x', deeperTitle:'Alto Adige', deeper:'x',
      lookFor:['x'], matchGrapes:['Pinot Grigio'], bottle:'', bottleWhy:'' },
    sources: SOURCED,
  });
  const rec = reconcileEnrichment(INSTANT, contradiction);
  assert.equal(rec.accepted, false);
  assert.equal(rec.reason, 'contradicts_rule');
});

test('a related grape from the rule family counts as agreement, by canonical identity', () => {
  // The steak-mushroom rule lists Cabernet Sauvignon as a match grape…
  const cab = researchedPairing({ primary:{ ...researchedPairing().primary, grape:'Cabernet Sauvignon', matchGrapes:['Cabernet Sauvignon'] } });
  assert.equal(reconcileEnrichment(INSTANT, cab).accepted, true);
  // …but Cabernet Franc is a different grape, not a fuzzy cousin.
  const franc = researchedPairing({ primary:{ ...researchedPairing().primary, grape:'Cabernet Franc', matchGrapes:['Cabernet Franc'] } });
  assert.equal(reconcileEnrichment(INSTANT, franc).accepted, false);
});

test('less-specific research never replaces region-level rule guidance', () => {
  const vague = researchedPairing({ primary:{ ...researchedPairing().primary, deeperTitle:'' } });
  const rec = reconcileEnrichment(INSTANT, vague);
  assert.equal(rec.accepted, false);
  assert.equal(rec.reason, 'less_specific');
});

test('a matched rule answer is never replaced by prose or malformed results', () => {
  assert.equal(reconcileEnrichment(INSTANT, { kind:'answer', text:'Some essay.' }).accepted, false);
  assert.equal(reconcileEnrichment(INSTANT, null).accepted, false);
  assert.equal(reconcileEnrichment(INSTANT, { kind:'pairing', primary:{} }).accepted, false);
});

test('the versatile fallback for a non-dish question is corrected by a written answer', () => {
  // A pairing-shaped question no rule understands gets the honest
  // versatile card instantly, and the model's real answer then corrects the
  // MODE — the card said only "a versatile starting point", so this is a
  // correction, never a flip of dish-specific advice.
  const rec = reconcileEnrichment(VERSATILE, { kind:'answer', text:'Barolo is… Barbaresco is…', sources:[], researchStatus:'no_evidence' });
  assert.equal(rec.accepted, true);
  assert.equal(rec.data.mode, 'answer');
  assert.equal(rec.data.basis, 'no_evidence');
  const cited = reconcileEnrichment(VERSATILE, { kind:'answer', text:'Cited answer.', sources:SOURCED });
  assert.equal(cited.data.basis, 'researched');
  assert.equal(reconcileEnrichment(VERSATILE, { kind:'answer', text:'   ' }).accepted, false, 'empty prose corrects nothing');
});

test('when the instant answer was the versatile fallback, a real pairing wins', () => {
  const pierogi = researchedPairing({ dish:'pierogi casserole',
    primary:{ grape:'Grüner Veltliner', why:'x', deeperTitle:'', deeper:'',
      lookFor:['Grüner Veltliner from Austria'], matchGrapes:['Grüner Veltliner'], bottle:'', bottleWhy:'' } });
  const rec = reconcileEnrichment(VERSATILE, pierogi);
  assert.equal(rec.accepted, true, 'the model understood a dish the rules did not');
  assert.equal(rec.data.primary.grape, 'Grüner Veltliner');
});

test('a bottle claim survives only alongside cited sources', () => {
  const withBottleNoSources = researchedPairing({
    primary:{ ...researchedPairing().primary, bottle:'Some Producer Crozes-Hermitage 2021', bottleWhy:'Rated highly.' },
    sources: [],
  });
  const rec = reconcileEnrichment(INSTANT, withBottleNoSources);
  assert.equal(rec.accepted, true);
  assert.equal(rec.data.primary.bottle, undefined, 'no sources, no bottle');
  assert.equal(rec.data.primary.bottleWhy, undefined);

  const withBoth = researchedPairing({
    primary:{ ...researchedPairing().primary, bottle:'Some Producer Crozes-Hermitage 2021', bottleWhy:'James Suckling rated this 100 points.' },
    sources: SOURCED,
  });
  const kept = reconcileEnrichment(INSTANT, withBoth).data.primary;
  assert.equal(kept.bottle, 'Some Producer Crozes-Hermitage 2021');
  assert.equal(kept.bottleWhy, undefined,
    'a bottle-specific reason is unverified prose and never renders — even beside a sourced bottle');
});

test('enrichment never removes safety information or the price limit', () => {
  const initial = { ...instantPairing(heuristicPairing('spicy tomato pasta under $20')) };
  assert.ok(initial.avoid.length, 'the rule carries an avoid list');
  assert.ok(initial.avoidNote, 'and an avoid note');
  assert.equal(initial.limit, 20);
  const r = researchedPairing({ dish:'spicy tomato pasta',
    primary:{ grape:'Barbera', why:'x', deeperTitle:'Barbera d’Asti', deeper:'x',
      lookFor:[], matchGrapes:['Barbera'], bottle:'', bottleWhy:'' }, avoidNote:'' });
  const rec = reconcileEnrichment(initial, r);
  assert.equal(rec.accepted, true);
  assert.deepEqual(rec.data.avoid, initial.avoid, 'the avoid list survives');
  assert.equal(rec.data.avoidNote, initial.avoidNote, 'the rule avoid note survives when research brings none');
  assert.equal(rec.data.limit, 20, 'the price limit survives');
  assert.deepEqual(rec.data.primary.lookFor, initial.primary.lookFor,
    'empty research lookFor never erases concrete shelf guidance');
});

// ── Stale responses and navigation away ──────────────────────────────

test('a current run applies to the screen', () => {
  assert.equal(enrichmentDisposition({ isCurrentRun:true, accepted:true, asked:'q', cachedAsked:'q' }), 'apply');
  assert.equal(enrichmentDisposition({ isCurrentRun:true, accepted:false, asked:'q', cachedAsked:'q' }), 'apply');
});

test('after navigating away, accepted enrichment may only upgrade the cache for the SAME question', () => {
  assert.equal(enrichmentDisposition({ isCurrentRun:false, accepted:true, asked:'steak', cachedAsked:'steak' }), 'cache_only');
});

test('a stale response for a superseded question is discarded entirely', () => {
  // The user asked something new: the cache belongs to the new question.
  assert.equal(enrichmentDisposition({ isCurrentRun:false, accepted:true, asked:'steak', cachedAsked:'pizza' }), 'discard');
  // A rejected result has nothing to offer anywhere once stale.
  assert.equal(enrichmentDisposition({ isCurrentRun:false, accepted:false, asked:'steak', cachedAsked:'steak' }), 'discard');
  // No cache at all.
  assert.equal(enrichmentDisposition({ isCurrentRun:false, accepted:true, asked:'steak', cachedAsked:null }), 'discard');
});

// ── The basis line tells the truth in every state ────────────────────

test('pairingBasis reports each state honestly', () => {
  assert.equal(pairingBasis(INSTANT), 'rule', 'instant answer: built-in guidance');
  assert.equal(pairingBasis({ ...INSTANT, pendingResearch:false }), 'rule',
    'failed or timed-out enrichment: still built-in guidance, no source implied');
  assert.equal(pairingBasis({ enriched:true, researchStatus:'no_evidence' }), 'no_evidence');
  assert.equal(pairingBasis({ enriched:true, sources:SOURCED, researchStatus:'researched' }), 'researched');
  assert.equal(pairingBasis({ offline:true, offlineReason:'unusable' }), 'unusable');
  assert.equal(pairingBasis({ offline:true }), 'unreachable');
  assert.equal(pairingBasis({ researchStatus:'unavailable' }), 'unavailable', 'legacy AI answers keep their status');
  assert.equal(pairingBasis(null), null);
});
