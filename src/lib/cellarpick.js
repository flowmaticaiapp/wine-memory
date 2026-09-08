// cellarpick.js — choosing an OWNED bottle for a recommendation.
//
// This is the "Do I already own something?" / "What should I open?" decision,
// pulled out of the pairing screen so it can be tested and reused by the
// conversation engine. The rules it enforces:
//
//   * only the user's REAL cellar is searched — samples are excluded before
//     anything else happens, by the same personalWines() boundary every other
//     claim about the user goes through;
//   * a bottle is offered only when it genuinely fits: its grape (or, failing
//     that, its name) matches the recommendation's grape family by canonical
//     identity (Cabernet Sauvignon ≠ Cabernet Franc; Pinot Grigio = Pinot
//     Gris) and it is not in the recommendation's avoid list;
//   * a colour the user asked for, or said they dislike, is honoured;
//   * a budget excludes bottles known to cost more (unknown prices pass);
//   * identical bottles are shown once with their quantity;
//   * one lead and at most two alternatives, each with a reason.

import { personalWines } from './palate.js';
import { textMatchesAnyGrape } from './grapes.js';
import { rankTonightBottles, alternativeDirection } from './tonight.js';
import { colorOfWine, COLOR_LABEL } from './winecolor.js';

function grapeFits(wine, targets){
  return textMatchesAnyGrape(wine.grape || wine.name, targets);
}

// The grapes a recommendation would accept from the cellar: the lead's
// match family plus the named alternatives.
export function targetGrapesOf(result){
  const p = result?.primary || {};
  return [ ...((p.matchGrapes && p.matchGrapes.length) ? p.matchGrapes : [p.grape]),
    ...((result?.others || []).map(o => o.grape)) ].filter(Boolean);
}

// Ranked owned bottles that fit. `options`:
//   guidedTonight  the meal-less "open tonight" flow: any non-avoided bottle
//                  qualifies and mood decides the order
//   mood           the tonight mood id used for ranking
//   color          only bottles of this colour ('red' | 'white' | …)
//   dislikeColors  colours the user has ruled out
//   limit          override the result's price limit
//   max            how many to return (default 6; tonight flows use 3)
export function ownedMatches(result, wines, options = {}){
  if (!result || !result.primary) return [];
  const targets = targetGrapesOf(result);
  const avoid = (result.avoid || []).filter(Boolean);
  const mine = personalWines(wines);
  let pool = options.guidedTonight && result.matched === false
    ? mine.filter(w => !grapeFits(w, avoid))
    : mine.filter(w => grapeFits(w, targets) && !grapeFits(w, avoid));
  const limit = options.limit !== undefined ? options.limit : result.limit;
  if (limit != null) pool = pool.filter(w => w.price == null || w.price <= limit);
  if (options.color) pool = pool.filter(w => colorOfWine(w) === options.color);
  if (options.dislikeColors && options.dislikeColors.length){
    pool = pool.filter(w => !options.dislikeColors.includes(colorOfWine(w)));
  }
  return rankTonightBottles(pool, options.mood, options.max ?? (options.guidedTonight ? 3 : 6));
}

// Why an owned bottle fits: the grape link to the recommendation, then the
// user's own verdict. Built only from the bottle's own fields and the
// recommendation — never from anything about the bottle we cannot see.
export function bottleReason(wine, result){
  const p = result?.primary || {};
  const grape = wine.grape || wine.name || 'This bottle';
  const parts = [];
  if (textMatchesAnyGrape(wine.grape || wine.name, (p.matchGrapes && p.matchGrapes.length) ? p.matchGrapes : [p.grape])){
    parts.push(`${grape} is the style recommended here${result.dish ? ` for ${result.dish}` : ''}.`);
  } else {
    const alt = (result?.others || []).find(o => textMatchesAnyGrape(wine.grape || wine.name, [o.grape]));
    if (alt) parts.push(`${grape} is the “${alt.direction ? alt.direction.toLowerCase() : 'alternative'}” route: ${alt.why}`);
    else parts.push(`${grape} fits the style asked for.`);
  }
  if (wine.verdict === 'buy') parts.push('You marked it “Buy Again”.');
  else if (wine.verdict === 'totry') parts.push('Still unopened — a good night to find out.');
  else if (wine.verdict === 'maybe') parts.push('You marked it “Maybe” before; this dish may suit it better.');
  if (wine.quantity > 1) parts.push(`You have ${wine.quantity} bottles.`);
  return parts.join(' ');
}

// The decision: one lead bottle, up to two alternatives, each explained.
// Returns { lead, alternatives:[{ wine, direction, reason }], count, note }.
// `count` is the number of DISTINCT fitting wines (after consolidation) so
// the screen can say "3 fit" honestly; `note` explains an empty result.
export function cellarPick(result, wines, options = {}){
  const ranked = ownedMatches(result, wines, { ...options, max: 3 });
  if (!ranked.length){
    const color = options.color ? ` ${COLOR_LABEL[options.color] || options.color}` : '';
    const dish = result?.dish ? ` for ${result.dish}` : '';
    return { lead:null, alternatives:[], count:0,
      note:`Nothing you own fits closely enough${color ? ` as a${color} wine` : ''}${dish}. The shelf guidance is what to look for.` };
  }
  const [lead, ...rest] = ranked;
  return {
    lead: { wine: lead, reason: bottleReason(lead, result) },
    alternatives: rest.slice(0, 2).map(w => ({ wine: w, direction: alternativeDirection(lead, w), reason: bottleReason(w, result) })),
    count: ranked.length,
    note: '',
  };
}
