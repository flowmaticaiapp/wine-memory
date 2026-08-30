// grapes.js — canonical grape identities.
//
// WHY: word-level matching treated "Cabernet" as one identity, so a target of
// 'Cabernet' matched Cabernet Franc, and an earlier comment claimed otherwise.
// Grapes are identities, not bags of words: Cabernet Sauvignon, Cabernet Franc,
// Pinot Noir and Pinot Grigio are four different things, while Pinot Grigio and
// Pinot Gris (or Syrah and Shiraz) are the SAME thing under two names.
//
// The rules: multi-word variety names are claimed longest-first, so the words
// of "cabernet franc" are consumed as one identity and can never leak into a
// bare-"cabernet" reading. Deliberate aliases map synonyms to one id. A bare
// "Cabernet" on a label or in a rule means Cabernet Sauvignon by convention —
// that is an explicit entry below, not an accident of substring matching.
// A bare "Pinot" maps to nothing, because it genuinely is ambiguous.
//
// Varieties not in this table (Nebbiolo, Gamay, Bobal, Frappato…) fall back to
// whole-word matching, which is safe precisely because they have no sibling
// that shares a word.

const wordsOf = (s)=> String(s||'').toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);

// [canonical id, phrases that mean it]. Phrases are matched longest-first.
const VARIETIES = [
  ['cabernet-sauvignon', ['cabernet sauvignon', 'cab sauv']],
  ['cabernet-franc',     ['cabernet franc', 'cab franc']],
  ['pinot-noir',         ['pinot noir', 'pinot nero', 'spätburgunder', 'spatburgunder']],
  ['pinot-gris',         ['pinot gris', 'pinot grigio', 'grauburgunder']],
  ['pinot-blanc',        ['pinot blanc', 'pinot bianco']],
  ['sauvignon-blanc',    ['sauvignon blanc', 'fumé blanc', 'fume blanc']],
  ['chenin-blanc',       ['chenin blanc']],
  ['gewurztraminer',     ['gewürztraminer', 'gewurztraminer']],
  ['gruner-veltliner',   ['grüner veltliner', 'gruner veltliner']],
  ['syrah',              ['syrah', 'shiraz']],
  ['grenache',           ['grenache', 'garnacha']],
  ['zinfandel',          ['zinfandel', 'primitivo']],
  ['mourvedre',          ['mourvèdre', 'mourvedre', 'monastrell', 'mataro']],
];

// A lone word that carries a conventional meaning when no longer phrase
// claimed it. "Cabernet" alone conventionally means Cabernet Sauvignon.
// "Pinot", "sauvignon" and "blanc" alone are ambiguous and deliberately absent.
const LONE_WORDS = {
  cabernet: 'cabernet-sauvignon',
  gewürztraminer: 'gewurztraminer',
};

// Pre-split phrases, longest (most words) first so "cabernet franc" is tried
// before any single-word reading of "cabernet".
const PHRASES = VARIETIES
  .flatMap(([id, names]) => names.map(n => ({ id, words: wordsOf(n) })))
  .sort((a, b) => b.words.length - a.words.length);

// Analyze a free-text grape/name string into canonical identities plus the
// words no identity claimed. Exported for tests.
export function analyzeGrapeText(text){
  const words = wordsOf(text);
  const claimed = new Array(words.length).fill(false);
  const ids = new Set();

  for (const { id, words: pw } of PHRASES){
    for (let i = 0; i + pw.length <= words.length; i++){
      if (pw.every((w, j) => words[i + j] === w && !claimed[i + j])){
        ids.add(id);
        for (let j = 0; j < pw.length; j++) claimed[i + j] = true;
      }
    }
  }
  const rest = [];
  for (let i = 0; i < words.length; i++){
    if (claimed[i]) continue;
    const lone = LONE_WORDS[words[i]];
    if (lone) ids.add(lone);
    else rest.push(words[i]);
  }
  return { ids, rest, all: new Set(words) };
}

// Does hay text (a wine's grape and/or name) satisfy one target grape/style?
//
// When the target names a canonical identity, only that identity matches —
// 'Cabernet Sauvignon' never accepts a Cabernet Franc, 'Pinot Noir' never
// accepts a Pinot Grigio, while 'Pinot Grigio' accepts a Pinot Gris because
// they are one grape. When the target has no canonical entry (Nebbiolo,
// 'Dry Rosé', …), every target word must appear whole in the hay.
export function grapeTextMatches(hayText, target){
  const t = analyzeGrapeText(target);
  if (t.ids.size){
    const h = analyzeGrapeText(hayText);
    return [...t.ids].some(id => h.ids.has(id));
  }
  const need = [...t.all];
  if (!need.length) return false;
  const hay = new Set(wordsOf(hayText));
  return need.every(w => hay.has(w));
}

// Convenience used by both the pairing screen and the candidate ranker.
export function textMatchesAnyGrape(hayText, targets){
  return (targets || []).some(t => grapeTextMatches(hayText, t));
}
