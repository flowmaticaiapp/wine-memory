// conversation.js — the Wine Memory Sommelier's conversation engine.
//
// Pure functions only: no React, no network, no storage. The pairing screen
// asks `planTurn()` what to do with a question and then executes the plan.
// Keeping the decision here (and testable) is what lets the acceptance tests
// prove the behaviour end to end without rendering:
//
//   1. UNDERSTAND INTENT  — pair with a meal, choose an owned bottle, evaluate
//      a bottle, shop for a style, explain, compare, discover, or continue /
//      refine / challenge the previous answer. Unclear intent never gets a
//      generic recommendation.
//   2. UNDERSTAND THE WHOLE DISH — protein, preparation, sauce, heat,
//      sweetness, acidity, richness, toppings, cuisine, occasion — and the
//      constraints around it (budget, colour, body, cellar-only, preferences,
//      bottle identity, availability).
//   3. ASK BEFORE GUESSING — when a missing detail would materially change
//      the answer, one concise question with quick choices (typing always
//      allowed). No fallback card is shown before the answer.
//   4. KEEP CONTEXT — a follow-up retains the meal, budget, colour and
//      preferences; the user never repeats them. "New question" discards.
//   5. STAY HONEST — local explanations are built ONLY from the reviewed rule
//      the answer actually used and the sources actually attached to it.
//      Anything the rule cannot say is handed to research with the context,
//      never improvised.

import {
  DISH_RULES, DEFAULT_RULE, COLOR_SWAPS, STYLE_DETAILS, HEAT_PRINCIPLE, HEAT_AVOID_NOTE, HEAT_AVOID,
  priceLimit, isPairingQuery, hasSpecificFoodContext, needsTacoGuidance, heuristicPairing,
} from './pairingrules.js';
import { needsTonightGuidance } from './tonight.js';
import { textMatchesAnyGrape } from './grapes.js';
import { colorOfGrape, requestedColor, COLOR_LABEL } from './winecolor.js';

const s = (q) => String(q ?? '').trim();
// Matching text: curly apostrophes straightened and accents folded, so that
// "doesn’t" and "rosé" behave like "doesn't" and "rose" at word boundaries.
const norm = (q) => s(q).replace(/[\u2018\u2019\u201B]/g, "'").normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const lc = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const words = (q) => s(q).split(/\s+/).filter(Boolean);

// ── Dish understanding ──────────────────────────────────────────────

const PROTEINS = [
  ['pork',      /\bpork\b|\bcarnitas\b|\bal pastor\b|\bporchetta\b|\bham\b|\bbacon\b|\bsausage\b|\bchorizo\b|\bribs\b/i],
  ['beef',      /\bbeef\b|\bsteak\b|\bribeye\b|\bsirloin\b|\bfilet\b|\bbrisket\b|\bshort ribs?\b|\bcarne asada\b|\bburgers?\b|\bbolognese\b/i],
  ['lamb',      /\blamb\b/i],
  ['chicken',   /\bchicken\b|\bpoultry\b|\bturkey\b|\bduck\b/i],
  ['fish',      /\bfish\b|\bsalmon\b|\btuna\b|\bhalibut\b|\bcod\b|\bbranzino\b|\bsole\b|\btrout\b|\bsushi\b|\bceviche\b/i],
  ['shellfish', /\bshrimp\b|\bprawns?\b|\bscallops?\b|\blobster\b|\bcrab\b|\boysters?\b|\bclams?\b|\bmussels?\b|\bshellfish\b/i],
  ['vegetable', /\bvegetables?\b|\bveggies?\b|\bvegetarian\b|\bvegan\b|\bmushrooms?\b|\bbeans?\b|\bcauliflower\b|\beggplant\b|\btofu\b|\bsalad\b/i],
  ['cheese',    /\bcheese\b|\bcharcuterie\b/i],
];
const PREPARATIONS = [
  ['grilled', /\bgrill(?:ed|ing)?\b|\bchar(?:red|grilled)?\b|\bbbq\b|\bbarbecue\b/i], ['roast', /\broast(?:ed)?\b/i], ['fried', /\bfried\b|\bcrispy\b/i],
  ['braised', /\bbraise[ds]?\b|\bslow[- ]cook(?:ed)?\b|\bstew(?:ed)?\b/i], ['smoked', /\bsmok(?:ed|y)\b/i], ['raw', /\braw\b|\bsushi\b|\bceviche\b|\bcrudo\b|\btartare\b/i],
];
const SAUCES = [
  ['cream', /\bcream(?:y)?\b|\balfredo\b|\bbutter\b|\bbéarnaise\b|\bbearnaise\b/i], ['tomato', /\btomato\b|\bmarinara\b|\bred sauce\b|\barrabbiata\b/i],
  ['mushroom', /\bmushroom\b|\bporcini\b|\btruffle\b/i], ['chimichurri', /\bchimichurri\b/i], ['pesto', /\bpesto\b|\bbasil\b/i],
  ['salsa', /\bsalsa\b|\bpico\b/i], ['mole', /\bmole\b/i], ['bbq', /\bbbq sauce\b|\bbarbecue sauce\b/i], ['curry', /\bcurry\b/i],
  ['soy', /\bsoy\b|\bteriyaki\b|\bhoisin\b/i],
];
const CUISINES = [
  ['Mexican', /\btacos?\b|\bsalsa\b|\bcarnitas\b|\bal pastor\b|\bmole\b|\benchiladas?\b|\bburritos?\b|\bmexican\b|\bcarne asada\b/i],
  ['Italian', /\bpasta\b|\bpizza\b|\brisotto\b|\blasagna\b|\bbolognese\b|\bitalian\b|\bosso buco\b/i],
  ['Thai', /\bthai\b|\bgreen curry\b|\bpad thai\b/i], ['Indian', /\bindian\b|\btikka\b|\bmasala\b|\bvindaloo\b|\bbiryani\b/i],
  ['Sichuan', /\bszechuan\b|\bsichuan\b|\bmapo\b/i], ['Japanese', /\bsushi\b|\bramen\b|\bteriyaki\b|\bjapanese\b/i],
  ['Korean', /\bkorean\b|\bgochujang\b|\bbulgogi\b|\bkimchi\b/i], ['Spanish', /\btapas\b|\bpaella\b|\bspanish\b/i], ['French', /\bfrench\b|\bcoq au vin\b|\bbeef bourguignon\b/i],
];
const TOPPINGS = /\bsalsa verde\b|\bsalsa\b|\bguacamole\b|\bguac\b|\bpico\b|\bcrema\b|\bcilantro\b|\bcabbage\b|\bpickled onions?\b|\bonions?\b|\bjalape[ñn]os?\b|\bcotija\b|\bqueso\b|\blime\b|\bavocado\b/gi;
const OCCASIONS = [
  ['tonight', /\btonight\b/i], ['dinner party', /\bdinner party\b/i], ['date night', /\bdate night\b/i], ['weeknight', /\bweeknight\b/i],
  ['Thanksgiving', /\bthanksgiving\b/i], ['holiday', /\bholiday\b|\bchristmas\b/i], ['cookout', /\bcookout\b|\bpotluck\b|\bpicnic\b/i], ['celebration', /\bcelebrat\w+\b|\banniversary\b|\bbirthday\b/i],
];
const HEAT_HOT = /\b(?:very|really|extra|super|quite|pretty|seriously|extremely)\s+(?:hot|spicy)\b|\bhot\s+(?:salsa|sauce|chil+i|chile|peppers?)\b|\bhabanero\b|\bghost pepper\b|\bfiery\b|\bscorching\b|\bsalsa (?:is|gets) (?:very |really )?hot\b|\blots of (?:chil+i|chile|heat)\b/i;
const HEAT_SOME = /\bspicy\b|\bchil+i\b|\bchile\b|\bjalape[ñn]o\b|\bheat\b|\bsriracha\b|\bcurry\b|\bszechuan\b|\bsichuan\b|\bgochujang\b/i;
const HEAT_MILD = /\bmild\b|\bnot (?:too )?spicy\b|\bno heat\b|\bnot hot\b/i;

const BODY = [
  ['light', /\blight(?:er)?\b|\bfresh(?:er)?\b|\bcrisp\b|\beasy[- ]drinking\b/i], ['rich', /\brich(?:er)?\b|\bcozy\b|\bfull(?:er)?[- ]bodied\b|\bround(?:er)?\b/i],
  ['bold', /\bbold(?:er)?\b|\bbig\b|\bpowerful\b|\bstructured\b/i],
];
const CELLAR_ONLY = /\b(?:from|in) my cellar\b|\bi (?:already )?(?:own|have)\b|\bdo i (?:already )?(?:own|have)\b|\balready own\b|\bwhat (?:do|should) i (?:have|own|open|pour)\b|\bshould i open\b|\bcheck my cellar\b|\bmy (?:own )?bottles?\b|\bsomething i (?:own|have)\b/i;
const AVAILABILITY = /\bavailable\b|\bin stock\b|\bwhere (?:can i|to|do i) (?:buy|find|get)\b|\bnear me\b|\bcan i (?:still )?(?:buy|find|get)\b/i;
const VINTAGE = /\b(19[5-9]\d|20[0-4]\d)\b/;
const BUDGET_EXTRA = /\$\s?(\d{1,4})\s*(?:budget|max|tops|limit|or under)\b|\bbudget (?:of |is )?\$?\s?(\d{1,4})\b/i;

// A colour the user asked the WINE to be. "red sauce", "red meat" and
// "white fish" are food words and never count.
const WINE_COLOR_REQUEST = /\b(red|white|ros[eé]|rosado|sparkling|bubbl\w*|fizz\w*|champagne)\s+(?:wine|option|one|bottle|version|alternative|pick|choice|instead|please|would|that|for)\b|\b(?:a|an|some|something|give me|want|prefer|make it|go|do|pick|choose|only|just)\s+(red|white|ros[eé]|rosado|sparkling|bubbly|bubbles|fizz)\b|\b(red|white|ros[eé]|rosado|sparkling|bubbly|bubbles)\s*(?:instead|please|only)\b|^(?:a\s+)?(red|white|ros[eé]|rosado|sparkling|bubbly|bubbles)(?:\s+instead|\s+please)?[?.!]*$/i;
const COLOR_DISLIKE = /\b(?:i\s+)?(?:don'?t|do not|never|can'?t|cannot|won'?t)\s+(?:really\s+)?(?:like|want|drink|enjoy|do)\s+(?:a\s+|any\s+)?(red|white|ros[eé]|rosado|sparkling|bubbly|bubbles)s?\b|\bno\s+(red|white|ros[eé]|rosado|sparkling|bubbly)s?\b|\bnot\s+(?:a\s+)?(red|white|ros[eé]|rosado|sparkling|bubbly)s?\b|\b(?:hate|dislike)\s+(red|white|ros[eé]|rosado|sparkling|bubbly)s?\b/i;

export function requestedWineColor(q){
  const m = norm(q).match(WINE_COLOR_REQUEST);
  if (!m) return null;
  return requestedColor(m.slice(1).find(Boolean) || '');
}
export function dislikedWineColor(q){
  const m = norm(q).match(COLOR_DISLIKE);
  if (!m) return null;
  return requestedColor(m.slice(1).find(Boolean) || '');
}

export function detectHeat(q){
  const t = s(q);
  if (HEAT_MILD.test(t)) return 'mild';
  if (HEAT_HOT.test(t)) return 'hot';
  if (HEAT_SOME.test(t)) return 'some';
  return null;
}

// Everything the question says about the dish and the constraints.
export function extractContext(q){
  const t = s(q);
  const first = (table) => { const hit = table.find(([, re]) => re.test(t)); return hit ? hit[0] : null; };
  const ctx = {};
  const protein = first(PROTEINS); if (protein) ctx.protein = protein;
  const preparation = first(PREPARATIONS); if (preparation) ctx.preparation = preparation;
  const sauce = first(SAUCES); if (sauce) ctx.sauce = sauce;
  const cuisine = first(CUISINES); if (cuisine) ctx.cuisine = cuisine;
  const occasion = first(OCCASIONS); if (occasion) ctx.occasion = occasion;
  const heat = detectHeat(t); if (heat) ctx.heat = heat;
  const toppings = [...new Set((t.match(TOPPINGS) || []).map(x => x.toLowerCase()))]; if (toppings.length) ctx.toppings = toppings;
  if (/\bsweet\b|\bglaze[d]?\b|\bhoney\b|\bmaple\b|\bteriyaki\b|\bhoisin\b|\bbbq sauce\b/i.test(t)) ctx.sweetness = true;
  if (/\blime\b|\blemon\b|\bcitrus\b|\bvinegar\b|\bpickled\b|\btomato\b|\bsalsa\b|\btangy\b/i.test(t)) ctx.acidity = true;
  if (/\brich\b|\bfatty\b|\bbutter\b|\bcream\b|\bbraise[ds]?\b|\bconfit\b|\bfried\b|\bcheesy\b/i.test(t)) ctx.richness = true;
  const body = first(BODY); if (body) ctx.body = body;
  const budget = priceLimit(t) ?? (() => { const m = t.match(BUDGET_EXTRA); return m ? parseInt(m[1] || m[2], 10) : null; })();
  if (budget) ctx.budget = budget;
  const color = requestedWineColor(t); if (color) ctx.color = color;
  const dislike = dislikedWineColor(t); if (dislike) ctx.dislikeColors = [dislike];
  if (CELLAR_ONLY.test(t)) ctx.cellarOnly = true;
  if (AVAILABILITY.test(t)) ctx.availability = true;
  const vintage = t.match(VINTAGE); if (vintage) ctx.vintage = vintage[1];
  return ctx;
}

// Merge a follow-up's context into the conversation's, keeping the dish.
export function mergeContext(prev, delta){
  const out = { ...(prev || {}) };
  for (const [k, v] of Object.entries(delta || {})){
    if (v == null || v === false) continue;
    if (k === 'modifiers' || k === 'dislikeColors' || k === 'toppings' || k === 'preferences'){
      out[k] = [...new Set([...(out[k] || []), ...v])];
    } else out[k] = v;
  }
  return out;
}

// The dish, described from the context — for the thread, for "what I
// weighed", and for the research context. Concepts only: no cellar contents,
// no notes, no names.
export function describeDish(ctx){
  const c = ctx || {};
  const parts = [];
  if (c.dishLabel) parts.push(c.dishLabel);
  else if (c.protein) parts.push(c.protein);
  const details = [];
  if (c.preparation) details.push(c.preparation);
  if (c.sauce) details.push(`${c.sauce} sauce`.replace('salsa sauce', 'salsa').replace('chimichurri sauce', 'chimichurri').replace('pesto sauce', 'pesto').replace('mole sauce', 'mole').replace('curry sauce', 'curry'));
  if (c.cuisine) details.push(`${c.cuisine} preparation`);
  if (c.heat === 'hot') details.push('very hot');
  else if (c.heat === 'some') details.push('some heat');
  else if (c.heat === 'mild') details.push('mild');
  if (c.toppings && c.toppings.length) details.push(c.toppings.slice(0, 4).join(', '));
  if (c.sweetness) details.push('sweet element');
  if (c.acidity) details.push('acidity');
  if (c.richness) details.push('rich');
  if (c.modifiers && c.modifiers.length) details.push(...c.modifiers.slice(0, 3));
  return [parts.join(' '), details.length ? `(${details.join('; ')})` : ''].filter(Boolean).join(' ').trim();
}

export function describeConstraints(ctx){
  const c = ctx || {};
  const out = [];
  if (c.color) out.push(`${COLOR_LABEL[c.color] || c.color} wine`);
  if (c.dislikeColors && c.dislikeColors.length) out.push(`not ${c.dislikeColors.map(x => COLOR_LABEL[x] || x).join(' or ')}`);
  if (c.budget) out.push(`under $${c.budget}`);
  if (c.body) out.push(`${c.body} style`);
  if (c.cellarOnly) out.push('from bottles already owned');
  if (c.occasion) out.push(c.occasion);
  if (c.availability) out.push('must be available now');
  return out;
}

// ── Intent ──────────────────────────────────────────────────────────

const REVERSE_PAIRING = /\bwhat (?:food|foods|dish|dishes|meals?)\b.*\b(?:pairs?|goes?|works?|match\w*)\s+with\b|\bfood pairs? with\b|\bwhat to (?:eat|cook|serve) with\b/i;
const DISCOVER = /\bmust[- ]try\b|\bbucket[- ]list\b|\bwine experiences?\b|\bwines? (?:i|everyone|every wine lover) (?:should|must|need to) (?:try|taste)\b|\bsomething new to try\b|\bexpand my (?:palate|horizons)\b|\bbroaden my\b/i;
const COMPARE = /\bvs\.?\b|\bversus\b|\bcompare\b|\bcomparison\b|\bdifference between\b|\bhow (?:does|do) .+ differ\b|\bwhich is better[:,]? .+ or\b/i;
const EXPLAIN = /^(?:explain|describe|define|tell me about|teach me about|what is|what's|whats|what are|what does|what makes|what wine is|what grape is|what region is|why is|why are|why do i like|why do people|how is .+ made|how do .+ taste|where is .+ from|is \d{4} a good vintage|was \d{4} a good vintage|what'?s the deal with)\b|\bvintage (?:report|quality|good|bad)\b|\bgood vintage\b/i;
const EVALUATE = /\bshould i buy\b|\bworth (?:buying|it|the (?:price|money))\b|\bis (?:this|that|it|the \w+) (?:a )?(?:good|worth|any good)\b|\bgood bottle\b|\bhow good is\b|\bratings?\b|\bscores?\b|\bpoints\b|\breviews?\b|\bwhat do critics\b|\bcritic\b|\bdrink(?:ing)? window\b|\bis .+ (?:ready|too young|past it)\b|\bhow much (?:is|does|should) .+ (?:cost|worth)\b|\bprice of\b|\bwhat does .+ cost\b/i;
const SHOP = /\bbuy\b|\bshop(?:ping)?\b|\bunder\s*\$/i;
const SHOP_SOFT = /\bbest\b|\bsimilar to\b|\brecommend\b|\bfind me\b|\blooking for\b|\bgood value\b|\bbudget\b|\bsuggest\b|\bwhat (?:wine )?should i (?:get|try|pick|choose|order)\b|\bcheap\b|\baffordable\b/i;
const WINE_TERM = /\b(?:pinot|cabernet|merlot|syrah|shiraz|malbec|tempranillo|grenache|garnacha|gamay|nebbiolo|barbera|sangiovese|zinfandel|chardonnay|sauvignon|riesling|chenin|albari[ñn]o|verdejo|vermentino|gr[üu]ner|gew[üu]rztraminer|grigio|gris|champagne|prosecco|cava|barolo|barbaresco|chianti|rioja|bordeaux|burgundy|beaujolais|rh[ôo]ne|napa|sonoma|oregon|willamette|mosel|alsace|loire|provence|priorat|douro|mendoza|tuscany|piedmont|sicily|etna|ros[eé]|red|white|sparkling)\b/i;

export function isReversePairing(q){ return REVERSE_PAIRING.test(s(q)); }

// The intent of a NEW question (follow-ups are detected separately, first).
export function classifyIntent(q){
  const t = norm(q);
  if (!t) return 'explain';
  if (isReversePairing(t)) return 'explain';
  if (DISCOVER.test(t)) return 'discover';
  if (COMPARE.test(t) && !isPairingQuery(t)) return 'compare';
  if (EXPLAIN.test(t) && !isPairingQuery(t)) return 'explain';
  // "What wine should I buy?" is shopping; "Should I buy this bottle?" is
  // evaluating a specific bottle.
  if (/^(?:what|which)\b.*\bshould i (?:buy|get|pick|choose)\b/i.test(t) && !isPairingQuery(t)) return 'shop';
  if (EVALUATE.test(t) && !isPairingQuery(t)) return 'evaluate';
  if (CELLAR_ONLY.test(t) && (isPairingQuery(t) || !SHOP.test(t))) return 'cellar';
  if (isPairingQuery(t)) return 'pairing';
  if (SHOP.test(t) || SHOP_SOFT.test(t) || WINE_TERM.test(t)) return 'shop';
  return 'explain';
}

// ── Follow-ups ──────────────────────────────────────────────────────

const FU_SOURCES = /\bsources?\b|\bcit(?:e|ation|ations)\b|\bevidence\b|\bwhere did (?:that|this|it) come from\b|\bwho says\b|\baccording to\b|\bback (?:that|this|it) up\b|\bprove\b|\bsupports? that\b|\bsupport(?:s|ing)? (?:that|this|it)\b/i;
const FU_CELLAR = /\bdo i (?:already )?(?:own|have)\b|\balready own\b|\bin my cellar\b|\bfrom my cellar\b|\bcheck my cellar\b|\bwhat do i (?:have|own)\b|\bsomething i (?:own|have)\b|\bmy (?:own )?bottles?\b|\bwhat (?:should|could) i open\b|\bopen (?:something|one) i (?:own|have)\b/i;
const FU_CHEAPER = /\bcheaper\b|\bless expensive\b|\bmore affordable\b|\bcheap(?:er)? option\b|\bon a budget\b|\bbudget[- ]friendly\b|\bsomething (?:more )?affordable\b|\bless pricey\b|\bspend less\b/i;
const FU_WHY_NOT = /\bwhy not\s+(?:a\s+|an\s+|some\s+|the\s+)?(.+?)\s*[?.!]*$|\bwhat(?:'s| is) wrong with\s+(?:a\s+|the\s+)?(.+?)\s*[?.!]*$|\bwhy (?:isn'?t|not) (?:a\s+)?(.+?) (?:an option|on the list|recommended|suggested)\b/i;
const FU_WHY_INSTEAD = /\bwhy\s+(?:a\s+|the\s+)?(.+?)\s+(?:instead of|over|rather than|and not|not)\s+(?:a\s+|the\s+)?(.+?)\s*[?.!]*$/i;
const FU_WHY = /^why\b|\bwhy (?:this|that|those|is that|do you say|did you (?:pick|choose|suggest|recommend))\b|\bexplain (?:this|that|your (?:choice|pick|answer|reasoning)|the (?:choice|pick|reasoning))\b|\byour reasoning\b|\bhow did you (?:decide|choose|pick)\b|\bwhat makes (?:this|that|it) (?:a good|the right|the best)\b/i;
const FU_COMPARE = /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference\b|\bwhich (?:is|would be|one'?s) better\b|\bhow do (?:they|those|these) differ\b|\bside by side\b/i;
const FU_CHALLENGE = /doesn'?t (?:sound|seem|feel|look) right|not (?:right|convinced|sure about (?:that|this))|\bthat'?s wrong\b|\bwrong\b|\bdisagree\b|\bare you sure\b|\bi doubt\b|\bthat can'?t be\b|\bno way\b|\bhmm+\b|\breally\?|\bseems off\b|\bi don'?t (?:think so|buy (?:that|it)|agree)\b|\bthat'?s not (?:what|how)\b/i;
const FU_ALTERNATIVES = /\bwhat else\b|\bother (?:options?|choices?|ideas?|wines?|suggestions?|routes?)\b|\balternatives?\b|\banything else\b|\bwhat about something\b|\bsomething else (?:that )?(?:would|could|works?)\b|\bmore (?:options|ideas|choices)\b|\bgive me (?:another|more|other)\b/i;
const FU_MODIFY = /\bwhat if\b|^(?:and |but )?if (?:the|it|we|i|there|they|that|this)\b|\bactually\b|\binstead\b|\bwhat about\b|\bmake it\b|\bbut (?:with|it'?s|the|we|i)\b|\bwith (?:extra|more|less|no|lots of|a lot of)\b|^(?:with|plus|and|but)\s|\bswap\b|\bchange (?:it|the)\b|\bnow (?:it'?s|the|with)\b|\bturns out\b|\bforgot to (?:say|mention)\b/i;
const FU_REFERENT = /\b(?:it|that|this|those|these|one|the (?:same|first|second|other|alternative|lead|pick|choice))\b/i;
const NEW_QUESTION_SIGNALS = /^(?:explain|describe|tell me about|what is|what's|compare|should i buy|best|find me|similar to|what should i (?:open|drink|bring|pour|serve))\b|\bmust[- ]try\b/i;

function grapeNamed(text, candidates){
  // A grape the user typed may be shorter ("Cabernet", "rosé", "the sparkling")
  // or longer ("Off-dry Riesling") than the rule's name — match in both
  // directions, ignoring articles.
  const t = String(text || '').replace(/\b(?:the|a|an|some|that|this|one)\b/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return (candidates || []).find(c => c && (textMatchesAnyGrape(t, [c]) || textMatchesAnyGrape(c, [t])));
}

function pairingOf(data){
  if (!data || typeof data !== 'object') return null;
  if (data.mode === 'pairing') return data;
  if (data.mode === 'cellar' && data.pairing && data.pairing.mode === 'pairing') return data.pairing;
  return null;
}

// Locate a grape the user mentioned within the current answer. Returns
// { where:'primary'|'other'|'avoid', item } or null.
export function locateGrape(pairing, text){
  const p = pairing;
  if (!p || !p.primary) return null;
  const t = s(text);
  if (!t) return null;
  if (grapeNamed(t, [p.primary.grape])) return { where:'primary', item:p.primary };
  const other = (p.others || []).find(o => grapeNamed(t, [o.grape]));
  if (other) return { where:'other', item:other };
  const avoided = grapeNamed(t, p.avoid || []);
  if (avoided) return { where:'avoid', item:{ grape:avoided } };
  return null;
}

// Is this question a continuation of the current answer? Returns a
// follow-up descriptor or null (a new question).
export function detectFollowUp(q, conv){
  const raw = s(q);
  const t = norm(raw);
  if (!t || !conv || !conv.current) return null;
  const pairing = pairingOf(conv.current.data);
  const newDish = hasSpecificFoodContext(t);

  // Explicit new topics always win over follow-up heuristics.
  if (NEW_QUESTION_SIGNALS.test(t) && !FU_REFERENT.test(t) && !/\bwhat should i open\b/i.test(t)) return null;
  if (isReversePairing(t)) return null;
  if (DISCOVER.test(t)) return null;

  if (FU_SOURCES.test(t)) return { kind:'sources' };
  if (FU_CELLAR.test(t) && !newDish) return { kind:'cellar' };

  // Reasoning questions come before colour and budget: "why rosé instead of
  // Riesling?" mentions a colour but asks for the reasoning, not a swap.
  // Captures come from the raw text so accents and apostrophes survive.
  const whyNot = raw.match(FU_WHY_NOT) || t.match(FU_WHY_NOT);
  if (whyNot) return { kind:'why-not', grape: (whyNot[1] || whyNot[2] || whyNot[3] || '').trim() };
  const whyInstead = raw.match(FU_WHY_INSTEAD) || t.match(FU_WHY_INSTEAD);
  if (whyInstead) return { kind:'why-instead', chosen: whyInstead[1].trim(), other: whyInstead[2].trim() };
  if (FU_WHY.test(t) && !newDish) return { kind:'why' };

  const dislike = dislikedWineColor(t);
  const color = requestedWineColor(t);
  if (color || dislike){
    return { kind:'color', color: color || null, dislike: dislike || null };
  }

  const budget = priceLimit(t) ?? (() => { const m = t.match(BUDGET_EXTRA); return m ? parseInt(m[1] || m[2], 10) : null; })();
  if (budget && !newDish) return { kind:'budget', budget };
  if (FU_CHEAPER.test(t)) return { kind:'budget', budget:null };

  if (FU_COMPARE.test(t)){
    if (pairing){
      const names = [pairing.primary.grape, ...(pairing.others || []).map(o => o.grape)].filter(Boolean);
      const mentioned = names.filter(n => grapeNamed(t, [n]));
      if (mentioned.length >= 2) return { kind:'compare', a:mentioned[0], b:mentioned[1] };
      if (mentioned.length === 1){
        const outsider = t.replace(new RegExp(mentioned[0], 'i'), '').replace(/compare|vs\.?|versus|difference|between|and|with|which is better|\?/gi, ' ').trim();
        return { kind:'compare', a:mentioned[0], b:outsider || null };
      }
    }
    if (FU_REFERENT.test(t) || /\bthose two\b|\bthe two\b|\bboth\b/i.test(t)) return { kind:'compare', a:null, b:null };
    return null;                                   // "Barolo vs Barbaresco" is a new question
  }

  if (FU_CHALLENGE.test(t) && !newDish) return { kind:'challenge' };
  if (FU_ALTERNATIVES.test(t)) return { kind:'alternatives' };

  if (FU_MODIFY.test(t)){
    const modifier = raw.replace(/^(?:and |but |so |ok,? |okay,? )?(?:what if|what about|actually|but|and)\s*/i, '').replace(/[?.!]+$/, '').trim();
    return { kind:'modify', modifier: modifier || raw, replaceDish: newDish };
  }
  // A short qualifier with no new dish and no new-topic signal refines the
  // current answer ("lighter", "less oaky", "a bit sweeter", "for six people").
  if (words(t).length <= 6 && !newDish && !isPairingQuery(t) && !EXPLAIN.test(t) && !EVALUATE.test(t) && !SHOP.test(t) && !WINE_TERM.test(t)){
    return { kind:'modify', modifier: raw.replace(/[?.!]+$/, ''), replaceDish:false };
  }
  return null;
}

// Region-level detail for a style that is being promoted to the lead. The
// reviewed STYLE_DETAILS table first; otherwise a dish rule whose lead is the
// same grape lends its region title and grape family (never its dish-specific
// prose); otherwise the grape stands alone with no invented clues.
export function styleDetailsFor(grape){
  const key = String(grape || '').trim().toLowerCase();
  const exact = STYLE_DETAILS[key];
  if (exact) return { deeperTitle: exact.deeperTitle, deeper: exact.deeper, lookFor: exact.lookFor, matchGrapes: exact.matchGrapes };
  const rule = [...DISH_RULES, DEFAULT_RULE].find(r => grapeNamed(grape, [r.primary.grape]) && grapeNamed(r.primary.grape, [grape]));
  if (rule) return { deeperTitle: rule.primary.deeperTitle, deeper:'', lookFor:[], matchGrapes: rule.primary.matchGrapes };
  return { deeperTitle: String(grape || ''), deeper:'', lookFor:[], matchGrapes:[grape].filter(Boolean) };
}

// ── Adjustments to a rule answer ────────────────────────────────────

// Real chile heat changes the logic: promote the rule's own off-dry or
// sparkling alternative when it has one, keep the original lead as the
// "moderate heat" alternative, and carry the heat warning. When the rule
// has no such alternative the lead stands and the warning still travels.
export function applyHeat(result){
  if (!result || !result.primary) return result;
  const isSweetCoolant = (g) => /off-dry|riesling|gewürz|gewurz|chenin|moscato/i.test(String(g || ''));
  const isFizzCoolant = (g) => /sparkling|brut|champagne|cava|crémant|cremant/i.test(String(g || ''));
  const isCoolant = (g) => isSweetCoolant(g) || isFizzCoolant(g);
  const others = result.others || [];
  // The reviewed rules say it themselves: "if the salsa is hot, an off-dry
  // Riesling keeps the heat in check" — sweetness first, bubbles second.
  const coolant = isCoolant(result.primary.grape) ? null : (others.find(o => isSweetCoolant(o.grape)) || others.find(o => isFizzCoolant(o.grape)));
  const avoid = [...new Set([...(result.avoid || []), ...HEAT_AVOID])];
  if (!coolant){
    return { ...result,
      primary:{ ...result.primary, why:`${result.primary.why} ${HEAT_PRINCIPLE}`,
        lookFor:[...(result.primary.lookFor || []).slice(0, 2), 'Moderate alcohol and soft tannin — both keep the heat in check'] },
      avoid, avoidNote: HEAT_AVOID_NOTE, adjusted:'heat', dish:`${result.dish} with real heat` };
  }
  const lead = styleDetailsFor(coolant.grape);
  return { ...result,
    dish:`${result.dish} with very hot salsa or spice`,
    primary:{ grape: coolant.grape, why:`${coolant.why} ${HEAT_PRINCIPLE}`, ...lead },
    others:[ { direction:'If the heat is moderate', grape: result.primary.grape, why:`The original lead still works when the salsa is only medium: ${lc(result.primary.why)}` },
      ...others.filter(o => o !== coolant) ].slice(0, 2),
    avoid, avoidNote: HEAT_AVOID_NOTE, adjusted:'heat', matched:true,
  };
}

// "White instead" / "give me a red": the recommendation in another colour,
// from the rule's own alternatives first, then the reviewed colour-swap
// table. Returns null when nothing reviewed exists for that colour — the
// caller then hands the question to research rather than inventing.
export function colorSwap(result, color, dislikeColors = []){
  if (!result || !result.primary || !color) return null;
  const same = colorOfGrape(result.primary.grape) === color;
  if (same) return { ...result, sameColor:true };
  const others = result.others || [];
  const fromOthers = others.find(o => colorOfGrape(o.grape) === color);
  const table = (COLOR_SWAPS[result.ruleId] || {})[color];
  let primary = null;
  if (fromOthers){
    const details = table && colorOfGrape(table.grape) === color && grapeNamed(fromOthers.grape, [table.grape])
      ? { deeperTitle: table.deeperTitle, deeper: table.deeper, lookFor: table.lookFor, matchGrapes: table.matchGrapes }
      : styleDetailsFor(fromOthers.grape);
    primary = { grape: fromOthers.grape, why: fromOthers.why, ...details };
  } else if (table){
    primary = { grape: table.grape, why: table.why, deeperTitle: table.deeperTitle, deeper: table.deeper, lookFor: table.lookFor, matchGrapes: table.matchGrapes };
  }
  if (!primary) return null;
  const originalColor = colorOfGrape(result.primary.grape);
  const keepOriginal = !dislikeColors.includes(originalColor);
  const nextOthers = [
    ...(keepOriginal ? [{ direction:'The original lead', grape: result.primary.grape, why: result.primary.why }] : []),
    ...others.filter(o => o !== fromOthers && colorOfGrape(o.grape) === color),
  ].slice(0, 2);
  return { ...result, primary, others: nextOthers, adjusted:'color', swappedTo: color, matched:true };
}

// ── Local explanations (rule-grounded, never improvised) ────────────

export function factorsFor(ctx, pairing){
  const c = ctx || {};
  const out = [];
  if (c.protein) out.push(`the ${c.protein}`);
  if (c.preparation) out.push(`${c.preparation} preparation`);
  if (c.sauce) out.push(c.sauce === 'salsa' ? 'the salsa' : `${c.sauce} sauce`);
  if (c.cuisine) out.push(`${c.cuisine} seasoning`);
  if (c.heat === 'hot') out.push('serious chile heat');
  else if (c.heat === 'some') out.push('some heat');
  if (c.toppings && c.toppings.length) out.push(`toppings: ${c.toppings.slice(0, 4).join(', ')}`);
  if (c.sweetness) out.push('a sweet element');
  if (c.acidity && !c.sauce) out.push('acidity in the dish');
  if (c.richness) out.push('richness');
  if (c.modifiers && c.modifiers.length) out.push(...c.modifiers.slice(0, 3));
  if (c.color) out.push(`your ${COLOR_LABEL[c.color] || c.color} preference`);
  if (c.dislikeColors && c.dislikeColors.length) out.push(`no ${c.dislikeColors.map(x => COLOR_LABEL[x] || x).join(' or ')}`);
  if (c.budget) out.push(`a budget under $${c.budget}`);
  if (pairing){
    if (pairing.ruleId) out.push(`Wine Memory’s reviewed pairing guidance (${pairing.ruleId})`);
    const n = (pairing.sources || []).length;
    out.push(n ? `${n} public source${n > 1 ? 's' : ''} actually cited` : 'no public source was used for this answer');
  }
  return out;
}

// Only the sources this answer actually attached — never a preferred voice
// that was not used, never an invented link.
export function sourcesFor(data){
  const list = Array.isArray(data?.sources) ? data.sources : [];
  return list.filter(x => x && typeof x.url === 'string' && /^https:\/\//i.test(x.url) && typeof x.title === 'string')
    .map(({ title, url }) => ({ title, url }));
}

const BASIS_TEXT = {
  rule:        'This answer came from Wine Memory’s reviewed pairing guidance; no public source was consulted for it.',
  researched:  'These are the public sources this answer actually drew on.',
  no_evidence: 'Public sources were checked, but none directly supported this answer, so none are cited.',
  unavailable: 'Public research was unavailable when this was answered; it rests on reviewed guidance only.',
  unreachable: 'Your sommelier was offline when this was answered; it rests on reviewed guidance only.',
  unusable:    'The research response could not be used; this answer rests on reviewed guidance only.',
  cellar:      'This choice was made from your own cellar records and the pairing above.',
};
function basisOf(data){
  if (!data) return 'rule';
  if (data.mode === 'cellar') return 'cellar';
  if (data.offline) return data.offlineReason || 'unreachable';
  if ((data.sources || []).length) return 'researched';
  if (data.enriched) return data.researchStatus || 'no_evidence';
  if (data.basis) return data.basis;
  return data.researchStatus || 'rule';
}

function whyLead(p, dish){
  const head = `${p.grape} leads${dish ? ` for ${dish}` : ''}: ${p.why}`;
  return p.deeper ? `${head} ${p.deeper}` : head;
}

// Build a local explanation for a follow-up, or return { needsResearch:true,
// question } when the reviewed rule genuinely cannot answer it.
export function explainFollowUp(fu, conv){
  const current = conv?.current;
  const data = current?.data;
  const pairing = pairingOf(data);
  const dish = pairing?.dish || conv?.context?.dishLabel || '';
  const p = pairing?.primary;

  if (fu.kind === 'sources'){
    const sources = sourcesFor(data && data.mode === 'cellar' ? data.pairing : data);
    const basis = basisOf(data && data.mode === 'cellar' ? data.pairing : data);
    const text = sources.length ? BASIS_TEXT.researched : (BASIS_TEXT[basis] || BASIS_TEXT.rule);
    return { mode:'explanation', kind:'sources', text, sources, basis, factors: factorsFor(conv.context, pairing),
      offerResearch: !sources.length && basis !== 'no_evidence' };
  }

  if (!pairing || !p){
    // A written research answer: its sources are all we can say locally.
    if (fu.kind === 'why' || fu.kind === 'challenge'){
      return { needsResearch:true, question:`${fu.kind === 'challenge' ? 'The user is not convinced by' : 'Explain the reasoning behind'} the previous answer.` };
    }
    return { needsResearch:true };
  }

  if (fu.kind === 'why'){
    // A guided tonight answer led with an owned bottle: explain that decision,
    // not the generic style behind it.
    const text = pairing.guidedTonight && pairing.tonightReason ? pairing.tonightReason : whyLead(p, dish);
    return { mode:'explanation', kind:'why', text, sources: sourcesFor(pairing), basis: basisOf(pairing),
      factors: factorsFor(conv.context, pairing) };
  }

  if (fu.kind === 'why-not' || fu.kind === 'why-instead'){
    const other = fu.kind === 'why-not' ? fu.grape : fu.other;
    const found = locateGrape(pairing, other);
    if (!found) return { needsResearch:true, question:`For ${dish || 'this dish'}, why ${p.grape} rather than ${other}?` };
    let text;
    if (found.where === 'primary') text = `${p.grape} is the lead here. ${p.why}`;
    else if (found.where === 'other') text = `${whyLead(p, dish)} ${found.item.grape} is the “${lc(found.item.direction || 'alternative')}” route: ${found.item.why}`;
    else text = `${found.item.grape} is on the avoid list for ${dish || 'this dish'}. ${pairing.avoidNote || `It does not fit the dish’s balance.`} That is why ${p.grape} leads: ${lc(p.why)}`;
    if (fu.kind === 'why-instead' && fu.chosen && !grapeNamed(fu.chosen, [p.grape])){
      text = `The current lead is ${p.grape}, not ${fu.chosen}. ${text}`;
    }
    return { mode:'explanation', kind:fu.kind, text, sources: sourcesFor(pairing), basis: basisOf(pairing), factors: factorsFor(conv.context, pairing) };
  }

  if (fu.kind === 'compare'){
    const others = pairing.others || [];
    const a = fu.a ? locateGrape(pairing, fu.a) : { where:'primary', item:p };
    const b = fu.b ? locateGrape(pairing, fu.b) : (others[0] ? { where:'other', item:others[0] } : null);
    if (!a || !b) return { needsResearch:true, question:`For ${dish || 'this dish'}, compare ${fu.a || p.grape} with ${fu.b || 'the alternative'}.` };
    const line = (x) => x.where === 'primary'
      ? `- ${x.item.grape} (the lead): ${x.item.why}`
      : x.where === 'other' ? `- ${x.item.grape} (${lc(x.item.direction || 'alternative')}): ${x.item.why}`
      : `- ${x.item.grape}: on the avoid list. ${pairing.avoidNote || ''}`.trim();
    return { mode:'explanation', kind:'compare', text:`${line(a)}\n${line(b)}`, sources: sourcesFor(pairing), basis: basisOf(pairing), factors: factorsFor(conv.context, pairing) };
  }

  if (fu.kind === 'alternatives'){
    const others = pairing.others || [];
    if (!others.length) return { needsResearch:true, question:`What else would work with ${dish || 'this dish'}?` };
    const text = others.map(o => `- ${o.grape} — ${lc(o.direction || 'another route')}: ${o.why}`).join('\n');
    return { mode:'explanation', kind:'alternatives', text, sources: sourcesFor(pairing), basis: basisOf(pairing), factors: factorsFor(conv.context, pairing),
      choices:[ ...others.slice(0, 2).map(o => ({ label:`Why ${o.grape}?`, value:`why ${o.grape} instead of ${p.grape}?` })), { label:'Check my cellar', value:'do I already own something?' } ] };
  }

  if (fu.kind === 'challenge'){
    const factors = factorsFor(conv.context, pairing);
    const text = `Fair challenge. Here is what I weighed for ${dish || 'this dish'}: ${factors.slice(0, -2).join(', ') || 'the dish as you described it'}. ${p.grape} leads because ${lc(p.why)} If something about the dish or what you want is different, tell me and I’ll rework it — or I can check public sources.`;
    return { mode:'explanation', kind:'challenge', text, sources: sourcesFor(pairing), basis: basisOf(pairing), factors, offerResearch:true,
      choices:[ { label:'It should be red', value:'red instead' }, { label:'It should be white', value:'white instead' },
        { label:'Something cheaper', value:'something cheaper' }, { label:'Check public sources', value:'__research' } ] };
  }
  return { needsResearch:true };
}

// ── Clarification questions ─────────────────────────────────────────

export const TACO_FILLINGS = [
  ['Pork / carnitas','pork'], ['Beef / carne asada','beef'], ['Chicken','chicken'],
  ['Fish / shrimp','fish'], ['Vegetable / bean','vegetable'], ['Mixed / not sure','mixed'],
].map(([label, value]) => ({ label, value }));

export const MEAL_CHOICES = [
  ['Steak','steak'], ['Chicken','chicken'], ['Pasta','pasta'], ['Seafood','seafood'],
  ['Spicy','spicy food'], ['Cheese','cheese'], ['Several dishes','a mixed table of several dishes'], ['No food',''],
].map(([label, value]) => ({ label, value }));

export const BUDGET_CHOICES = [
  ['Under $15', 15], ['Under $25', 25], ['Under $40', 40], ['Under $75', 75],
].map(([label, value]) => ({ label, value }));

export const SHOP_GOALS = [
  ['A meal tonight','for a meal tonight'], ['A gift','as a gift'], ['Something new to try','something new to try'], ['To stock up','to stock up on everyday bottles'],
].map(([label, value]) => ({ label, value }));

function clarify(id, intent, question, pending = {}){
  return { kind:'clarify', intent, question:{ id, allowText:true, ...question }, pending };
}

// ── Composing the question after a clarification ────────────────────
export function composeClarified(pending, value, typed){
  const original = pending?.original || '';
  const v = value != null ? value : typed;
  switch (pending?.id){
    case 'taco-filling':   return `Best wine for ${v === 'mixed' ? 'mixed' : v} tacos`;
    case 'meal':           return v ? `${original.replace(/[?.!]+$/, '')} — we're having ${v}` : `${original.replace(/[?.!]+$/, '')} — no food, just a glass`;
    case 'bottle-identity':return `Should I buy ${v}?`;
    case 'shop-goal':      return `${original.replace(/[?.!]+$/, '')} ${v}`;
    case 'budget':         return typeof v === 'number' ? `something under $${v}` : String(v || '');
    default:               return String(v || original);
  }
}

// ── The plan ────────────────────────────────────────────────────────

function pairingQuery(ctx){
  const c = ctx || {};
  const parts = [c.dishQuery || ''];
  for (const m of (c.modifiers || [])) parts.push(m);
  if (c.color) parts.push(`but a ${COLOR_LABEL[c.color] || c.color} wine`);
  if (c.budget) parts.push(`under $${c.budget}`);
  return parts.filter(Boolean).join(', ');
}

// A self-contained question for research on a follow-up: the server sees the
// dish and constraints (concepts only) alongside the new question, so the
// user never repeats them and the cellar never enters a search prompt.
export function researchQuestion(question, conv, pairing){
  const ctx = conv?.context || {};
  const dish = describeDish(ctx) || ctx.dishQuery || conv?.current?.asked || '';
  const bits = [];
  if (dish) bits.push(`the meal is ${dish}`);
  if (pairing?.primary?.grape) bits.push(`the current suggestion is ${pairing.primary.grape}${pairing.primary.deeperTitle ? ` (${pairing.primary.deeperTitle})` : ''}`);
  const constraints = describeConstraints(ctx);
  if (constraints.length) bits.push(`constraints: ${constraints.join(', ')}`);
  if (!bits.length && conv?.current?.asked) bits.push(`the previous question was “${conv.current.asked}”`);
  return bits.length ? `Context: ${bits.join('; ')}. Question: ${question}` : question;
}

// Concept-only context string for the server's `context` field.
export function researchContext(conv, pairing){
  const ctx = conv?.context || {};
  const bits = [];
  const dish = describeDish(ctx);
  if (dish) bits.push(`meal: ${dish}`);
  if (pairing?.primary?.grape) bits.push(`current suggestion: ${pairing.primary.grape}`);
  const constraints = describeConstraints(ctx);
  if (constraints.length) bits.push(`constraints: ${constraints.join(', ')}`);
  return bits.join('; ').slice(0, 600);
}

// The last few turns, text only, for the server. User text is what the user
// typed to the sommelier already; sommelier text is the one-line summary.
export function historyFor(conv, max = 6){
  return (conv?.turns || []).slice(-max).map(t => ({ role:t.role, text:String(t.text || '').slice(0, 300) }));
}

function research(intent, question, conv, over = {}){
  return { kind:'research', intent, question, effectiveQuery: question, context: conv?.context || {},
    expects:'any', fallback:'message', requiresEvidence:false, ...over };
}

function instantPlan(intent, ctx, options = {}){
  const effectiveQuery = pairingQuery(ctx) || ctx.dishQuery || '';
  let result = heuristicPairing(effectiveQuery);
  if (ctx.heat === 'hot') result = applyHeat(result);
  if (ctx.color){
    const swapped = colorSwap(result, ctx.color, ctx.dislikeColors || []);
    if (!swapped) return null;                       // nothing reviewed for that colour
    result = swapped;
  }
  if (ctx.budget && result.limit == null) result = { ...result, limit: ctx.budget };
  const context = { ...ctx, dishLabel: result.dish, ruleId: result.ruleId };
  return { kind:'instant', intent, effectiveQuery, context, result,
    leadWithCellar: intent === 'cellar' || !!ctx.cellarOnly || !!options.guidedTonight,
    cellarOptions:{ color: ctx.color || null, dislikeColors: ctx.dislikeColors || [], limit: result.limit ?? null, mood: options.mood || null, guidedTonight: !!options.guidedTonight },
    research: true, guided: options };
}

// Decide what to do with a question. `options`:
//   guidedTaco / guidedTonight / mood / mealLabel / hasMeal — the guided flows
//   clarified — the clarification this question answers (skips re-asking)
//   newTopic  — never treat this as a follow-up (Home prompts, drawer links)
export function planTurn(query, conv, options = {}){
  const t = s(query);
  if (!t) return null;

  // 1. A continuation of the current answer. Guided flows, clarification
  // answers and questions seeded from Home or the drawer are new topics.
  // A clarification raised BY a follow-up (budget, colour) continues that
  // follow-up once answered; the new-question clarifications do not.
  const skipFollowUp = options.newTopic || options.guidedTaco || options.guidedTonight || (options.clarified && !options.clarified.followUp);
  const fu = skipFollowUp ? null : detectFollowUp(t, conv);
  if (fu){
    const pairing = pairingOf(conv.current.data);
    const base = conv.context || {};
    const currentIntent = conv.current.intent || (pairing ? 'pairing' : 'explain');

    if (fu.kind === 'sources' || fu.kind === 'why' || fu.kind === 'why-not' || fu.kind === 'why-instead' || fu.kind === 'compare' || fu.kind === 'alternatives' || fu.kind === 'challenge'){
      const ans = explainFollowUp(fu, conv);
      if (ans && !ans.needsResearch){
        return { kind:'explanation', intent:'followup', followUp: fu.kind, answer: ans, context: base, effectiveQuery: conv.current.effectiveQuery || conv.current.asked };
      }
      const q = ans && ans.question ? ans.question : t;
      return research('followup', researchQuestion(q, conv, pairing), conv, { followUp: fu.kind, expects:'answer', contextText: researchContext(conv, pairing) });
    }

    if (fu.kind === 'cellar'){
      if (!pairing) return research('followup', researchQuestion(t, conv, null), conv, { followUp:'cellar', expects:'pairing' });
      return { kind:'cellar', intent:'followup', followUp:'cellar', pairing, context:{ ...base, cellarOnly:true },
        options:{ color: base.color || null, dislikeColors: base.dislikeColors || [], limit: base.budget ?? pairing.limit ?? null } };
    }

    if (fu.kind === 'budget'){
      if (fu.budget == null){
        return clarify('budget', 'followup', { kicker:'One quick question', title:'What’s the most you’d like to spend?', hint:'Pick a ceiling, or type an amount.', choices: BUDGET_CHOICES }, { id:'budget', original:t, followUp:true });
      }
      const ctx = mergeContext(base, { budget: fu.budget });
      if (!pairing || !base.dishQuery){
        return research('followup', researchQuestion(`${conv.current.asked} — now under $${fu.budget}`, { ...conv, context: ctx }, pairing), { ...conv, context: ctx }, { followUp:'budget' });
      }
      const plan = instantPlan(currentIntent === 'cellar' ? 'cellar' : 'pairing', ctx, {});
      return plan ? { ...plan, followUp:'budget' } : research('followup', researchQuestion(t, { ...conv, context: ctx }, pairing), { ...conv, context: ctx }, { followUp:'budget', expects:'pairing' });
    }

    if (fu.kind === 'color'){
      const delta = {};
      if (fu.color) delta.color = fu.color;
      if (fu.dislike) delta.dislikeColors = [fu.dislike];
      const ctx = mergeContext(base, delta);
      if (!ctx.color && fu.dislike){
        // "I don't like rosé." with no replacement colour named: ask.
        const opts = ['red','white','sparkling'].filter(c => c !== fu.dislike).map(c => ({ label:`${COLOR_LABEL[c][0].toUpperCase()}${COLOR_LABEL[c].slice(1)} instead`, value:`${COLOR_LABEL[c]} instead` }));
        return clarify('color', 'followup', { kicker:'Noted — no ' + COLOR_LABEL[fu.dislike], title:'What would you rather drink?', hint:'Pick a colour, or describe what you like.', choices: opts }, { id:'color', original:t, followUp:true });
      }
      if (!pairing || !base.dishQuery){
        return research('followup', researchQuestion(t, { ...conv, context: ctx }, pairing), { ...conv, context: ctx }, { followUp:'color', expects:'pairing' });
      }
      const plan = instantPlan(currentIntent === 'cellar' ? 'cellar' : 'pairing', ctx, {});
      if (plan) return { ...plan, followUp:'color' };
      // Nothing reviewed for that colour: say so via research, with context.
      return research('followup', researchQuestion(`What ${COLOR_LABEL[ctx.color]} wine would work instead?`, { ...conv, context: ctx }, pairing), { ...conv, context: ctx }, { followUp:'color', expects:'pairing', fallback:'message', contextText: researchContext({ ...conv, context: ctx }, pairing) });
    }

    if (fu.kind === 'modify'){
      const delta = extractContext(fu.modifier);
      let ctx;
      if (fu.replaceDish){
        ctx = mergeContext({ budget: base.budget, color: base.color, dislikeColors: base.dislikeColors, cellarOnly: base.cellarOnly, occasion: base.occasion }, { ...delta, dishQuery: fu.modifier, modifiers: [] });
      } else {
        ctx = mergeContext(base, { ...delta, modifiers: [fu.modifier] });
      }
      if (!ctx.dishQuery){
        return research('followup', researchQuestion(t, { ...conv, context: ctx }, pairing), { ...conv, context: ctx }, { followUp:'modify' });
      }
      const plan = instantPlan(currentIntent === 'cellar' ? 'cellar' : 'pairing', ctx, {});
      return plan ? { ...plan, followUp:'modify' } : research('followup', researchQuestion(t, { ...conv, context: ctx }, pairing), { ...conv, context: ctx }, { followUp:'modify', expects:'pairing' });
    }
  }

  // 2. A new question.
  const intent = classifyIntent(t);
  const ctx = extractContext(t);

  if (intent === 'pairing' || intent === 'cellar'){
    if (!options.guidedTaco && needsTacoGuidance(t)){
      return clarify('taco-filling', intent, { kicker:'One quick question', title:'What kind of tacos?', hint:'The filling, salsa and heat matter more than the word “tacos” alone.', choices: TACO_FILLINGS }, { id:'taco-filling', original:t });
    }
    if (!options.guidedTonight && needsTonightGuidance(t, hasSpecificFoodContext(t))){
      return clarify('tonight-meal', 'cellar', { kicker:'One quick question', title:'What are you having?', hint:'This keeps the sommelier from guessing before it knows the meal.', choices: MEAL_CHOICES }, { id:'tonight-meal', original:t });
    }
    if (!options.guidedTonight && !options.clarified && !hasSpecificFoodContext(t) && !ctx.cellarOnly){
      return clarify('meal', intent, { kicker:'One quick question', title:'What’s on the menu?', hint:'A generic pick would guess; the dish decides the wine.', choices: MEAL_CHOICES }, { id:'meal', original:t });
    }
    const dishQuery = t;
    const plan = instantPlan(intent, { ...ctx, dishQuery }, options);
    if (plan) return plan;
    return research(intent, t, { context: ctx }, { expects:'pairing', fallback:'pairing' });
  }

  if (intent === 'evaluate'){
    const hasBottle = VINTAGE.test(t) || /\b(?:[A-Z][\w'’.-]+\s+){1,}[A-Z][\w'’.-]+/.test(t) && !/\bthis bottle\b|\bthat bottle\b|\bthis wine\b|\bthis one\b/i.test(t);
    if (!hasBottle){
      return clarify('bottle-identity', 'evaluate', { kicker:'Which bottle?', title:'Tell me the producer, wine and vintage.', hint:'Exact-bottle answers need the exact bottle — I won’t guess at a rating or price.', choices: [] }, { id:'bottle-identity', original:t });
    }
    return research('evaluate', t, { context: ctx }, { expects:'answer', requiresEvidence:true });
  }

  if (intent === 'shop'){
    const specific = ctx.budget || ctx.color || WINE_TERM.test(t) || hasSpecificFoodContext(t) || ctx.occasion || /\bsimilar to\b|\blike\b/i.test(t);
    if (!specific && !options.clarified){
      return clarify('shop-goal', 'shop', { kicker:'One quick question', title:'What are you shopping for?', hint:'The occasion changes the bottle.', choices: SHOP_GOALS }, { id:'shop-goal', original:t });
    }
    return research('shop', t, { context: ctx }, { expects:'any', requiresEvidence: !!(ctx.availability || ctx.vintage) });
  }

  if (intent === 'discover') return research('discover', t, { context: ctx }, { expects:'answer', suggestMustTry:true });
  if (intent === 'compare') return research('compare', t, { context: ctx }, { expects:'answer' });
  return research('explain', t, { context: ctx }, { expects:'answer' });
}

// ── Follow-up actions offered after an answer ───────────────────────
export function followUpActions(data){
  const pairing = pairingOf(data);
  if (pairing && pairing.primary){
    const color = colorOfGrape(pairing.primary.grape);
    const actions = [ ['Why this?', 'why this?'], ['What else?', 'what else would work?'] ];
    if (color !== 'white') actions.push(['White instead', 'white instead']);
    if (color !== 'red') actions.push(['Red instead', 'red instead']);
    actions.push(['Something cheaper', 'something cheaper']);
    if (data.mode !== 'cellar' && !pairing.guidedTonight) actions.push(['Check my cellar', 'do I already own something?']);
    actions.push(['Show sources', 'what source supports that?']);
    return actions.map(([label, value]) => ({ label, value }));
  }
  if (data && (data.mode === 'answer' || data.mode === 'explanation')){
    return [ ['Show sources', 'what source supports that?'], ['Tell me more', 'tell me more about that'] ].map(([label, value]) => ({ label, value }));
  }
  return [];
}

// One-line summary of an answer for the thread.
export function summaryOf(data){
  if (!data) return '';
  if (data.mode === 'pairing'){
    const p = data.primary || {};
    return [p.grape, p.deeperTitle].filter(Boolean).join(' · ');
  }
  if (data.mode === 'cellar'){
    const lead = data.lead;
    return lead ? `From your cellar: ${[lead.producer, lead.name, lead.vintage].filter(Boolean).join(' ')}` : 'Nothing in your cellar fits closely';
  }
  const text = String(data.text || '').replace(/^[-•*]\s+/, '');
  const first = text.split(/(?<=[.!?])\s+/)[0] || text;
  return first.length > 140 ? first.slice(0, 137) + '…' : first;
}

export { pairingOf, DEFAULT_RULE as VERSATILE_RULE };
