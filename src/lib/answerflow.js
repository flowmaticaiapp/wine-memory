// answerflow.js — instant answer, background research, and the reconciliation
// rule that governs what a late research response may change.
//
// The two-second promise: a known food-pairing question renders the built-in
// rule answer IMMEDIATELY (it is local data — no network stands between the
// question and useful guidance). Public-web research then runs in the
// background and may ENRICH that answer. Research-first waiting remains the
// right behaviour for questions that cannot be answered honestly without
// current evidence — exact bottles, vintages, critic ratings, prices,
// availability — which arrive here as non-pairing questions and keep the
// thinking screen, now behind a firm timeout so the interface can never spin
// indefinitely.
//
// THE RECONCILIATION RULE (the answer the user is reading never flips):
//   1. Research that is not a pairing result cannot touch a pairing answer.
//   2. If the instant answer came from a MATCHED dish rule:
//      - research that AGREES at the grape level (its lead grape is one of the
//        rule's match grapes, by canonical grape identity) is merged in: the
//        richer dish-specific explanation, cited sources, and a verified
//        bottle may all attach;
//      - research that CONTRADICTS the rule's grape family is discarded
//        entirely — sources that supported a different recommendation do not
//        decorate this one, and a shopper who may already be at the shelf is
//        never shown a second, different answer for the same question;
//      - research that is LESS SPECIFIC than the rule (no region-level
//        guidance where the rule had one) is discarded.
//   3. If the instant answer was the unmatched VERSATILE fallback, a real
//      result from research always wins — a pairing (the model understood a
//      dish the rules did not) or a written answer (the question was never a
//      dish at all, and the fallback said only "a versatile starting point",
//      so correcting the mode is honesty, not a flip). A MATCHED rule answer
//      is never replaced by a written answer.
//   4. A verified bottle survives only when cited sources came back with it —
//      the server already enforces the evidence registry; this is the
//      client-side belt to the server's braces.
//   5. Enrichment never removes safety information: the rule's avoid list is
//      kept, and its avoid note survives unless research brought its own.

import { textMatchesAnyGrape } from './grapes.js';
import { isPairingQuery, hasSpecificFoodContext } from './pairingrules.js';
import { needsTonightGuidance } from './tonight.js';

// The gate the UI uses to choose between the instant path and research-first
// waiting. Food questions render immediately, including honest unmatched-food
// fallbacks. An ambiguous "open tonight" request is the deliberate exception:
// it enters the guided cellar flow before any recommendation appears.
export function instantEligible(query){
  const q = String(query ?? '');
  return isPairingQuery(q) && !needsTonightGuidance(q, hasSpecificFoodContext(q));
}

// Firm ceiling on any research round-trip. Background enrichment that misses
// it is quietly dropped (the rule answer is already on screen); a
// research-first question that misses it falls into the existing honest
// fallback path.
export const RESEARCH_TIMEOUT_MS = 20_000;
// Research-first explainers perform web research and then a structured answer
// call. They get a longer ceiling than background pairing enrichment; otherwise
// a healthy request can be discarded while its second step is still running.
export const RESEARCH_FIRST_TIMEOUT_MS = 45_000;

// Reject with a `.timeout` flag after `ms`. The underlying request is not
// aborted — its eventual result is simply ignored by the caller's run token.
export function withTimeout(promise, ms = RESEARCH_TIMEOUT_MS){
  let timer;
  const gate = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('research timed out');
      e.timeout = true;
      reject(e);
    }, ms);
  });
  return Promise.race([promise, gate]).finally(() => clearTimeout(timer));
}

export function sommelierFailureMessage(error){
  if (error?.blocked && error.message) return error.message;
  if (error?.timeout) return 'Your sommelier is still having trouble reaching public wine sources. Please try again in a moment.';
  return 'Sorry — I couldn’t reach your sommelier just now. Please try again in a moment.';
}

// Build the instant pairing answer from a heuristic result. `basis:'rule'`
// keeps the basis line honest — this answer used built-in guidance and no
// public source, and it says so until real evidence attaches.
export function instantPairing(heuristic){
  return { mode:'pairing', ...heuristic, basis:'rule', pendingResearch:true };
}

// What a late research response may do to the instant answer. Pure: returns
// { accepted, data?, reason }. `data` is the merged pairing (without `owned`,
// which the caller re-matches against the live cellar).
export function reconcileEnrichment(initial, researched){
  if (!initial || initial.mode !== 'pairing') return { accepted:false, reason:'no_initial' };
  const r = researched;
  const ruleMatched = initial.matched === true;

  // The versatile fallback fired for a question that was never a dish
  // ("Barolo vs Barbaresco?"): the model's written answer corrects the mode.
  // A matched dish rule is NEVER replaced by prose.
  if (!ruleMatched && r && r.kind === 'answer' && typeof r.text === 'string' && r.text.trim()){
    const sources = Array.isArray(r.sources) ? r.sources : [];
    return { accepted:true, data:{
      mode:'answer', text:r.text.trim(), sources,
      basis: sources.length ? 'researched' : (r.researchStatus || 'no_evidence'),
      enriched:true, pendingResearch:false,
    } };
  }

  if (!r || r.kind !== 'pairing' || !r.primary || typeof r.primary.grape !== 'string' || !r.primary.grape){
    return { accepted:false, reason:'not_pairing' };
  }

  if (ruleMatched){
    // Less specific than the rule: a matched rule always carries region-level
    // guidance; research that cannot reach that level may not replace it.
    if (initial.primary.deeperTitle && !r.primary.deeperTitle){
      return { accepted:false, reason:'less_specific' };
    }
    // Grape-level agreement, by canonical identity (Cabernet Sauvignon ≠
    // Cabernet Franc; Pinot Grigio = Pinot Gris).
    const targets = (initial.primary.matchGrapes && initial.primary.matchGrapes.length)
      ? initial.primary.matchGrapes : [initial.primary.grape];
    if (!textMatchesAnyGrape(r.primary.grape, targets)){
      return { accepted:false, reason:'contradicts_rule' };
    }
  }

  const sources = Array.isArray(r.sources) ? r.sources : [];
  const primary = { ...r.primary };
  // A bottle claim without cited sources does not render — ever.
  if (!sources.length){ delete primary.bottle; }
  // A bottle-specific REASON never renders at all: the server verifies the
  // bottle's identity, not the prose about it, so a supported bottle must not
  // carry an unsupported score, critic claim, or tasting note into the UI.
  delete primary.bottleWhy;
  // Never trade concrete shelf guidance for nothing.
  if (!(primary.lookFor && primary.lookFor.length) && (initial.primary.lookFor||[]).length){
    primary.lookFor = initial.primary.lookFor;
  }

  const data = {
    mode: 'pairing',
    dish: r.dish || initial.dish,
    ruleId: initial.ruleId,
    primary,
    others: Array.isArray(r.others) ? r.others : [],
    // Safety information survives enrichment.
    avoid: initial.avoid || [],
    avoidNote: r.avoidNote || initial.avoidNote || '',
    sources,
    researchStatus: r.researchStatus || (sources.length ? 'researched' : 'no_evidence'),
    limit: initial.limit ?? null,
    matched: ruleMatched ? true : initial.matched,
    guidedTonight: !!initial.guidedTonight,
    guidedMood: initial.guidedMood || null,
    tonightMeal: initial.tonightMeal || '',
    tonightReason: initial.tonightReason || '',
    enriched: true,
    pendingResearch: false,
  };
  return { accepted:true, data };
}

// Where an enrichment result is allowed to land once research resolves.
//   'apply'      — this is still the current question on screen: update the UI
//                  and the per-user cache.
//   'cache_only' — the user moved on (new question, or left the screen), but
//                  the cache still holds THIS question: upgrade the cache so a
//                  restored answer comes back enriched. Never touches the UI.
//   'discard'    — stale and the cache has moved on too. Nothing happens.
export function enrichmentDisposition({ isCurrentRun, accepted, asked, cachedAsked }){
  if (isCurrentRun) return 'apply';
  if (accepted && typeof asked === 'string' && asked && cachedAsked === asked) return 'cache_only';
  return 'discard';
}

// The basis line for a pairing answer, in one place so every render path
// agrees. Order matters: an offline fallback tells the truth about WHY it fell
// back; cited sources beat everything else; an enriched answer reports its
// research status; an instant rule answer says it used built-in guidance.
export function pairingBasis(d){
  if (!d) return null;
  if (d.offline) return d.offlineReason || 'unreachable';
  if ((d.sources || []).length) return 'researched';
  if (d.enriched) return d.researchStatus || 'no_evidence';
  if (d.basis) return d.basis;
  return d.researchStatus || 'no_evidence';
}
