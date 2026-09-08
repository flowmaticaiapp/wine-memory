// winecolor.js — which colour a grape, style or owned bottle is.
//
// The conversation engine needs this to honour "white instead", "I don't
// like rosé", and "give me a red" without guessing: an alternative is offered
// for a colour only when a reviewed rule actually contains one of that colour,
// and a cellar bottle is offered for a colour only when its own type or grape
// says so. Unknown stays unknown (null) — it is never rounded to red.

const fold = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Checked in this order: a "Sparkling Brut Rosé" is sparkling before it is
// pink, "Garnacha rosado" is pink before it is Grenache, and reds come before
// whites so "Cabernet Sauvignon" is never read as a Sauvignon.
const TABLE = [
  ['sparkling', ['sparkling', 'champagne', 'cava', 'prosecco', 'cremant', 'franciacorta', 'brut', 'pet-nat', 'pet nat', 'lambrusco', 'sekt', 'bubbles', 'bubbly', 'fizz']],
  ['rose',      ['rose', 'rosado', 'rosato', 'tavel', 'pink']],
  ['fortified', ['port', 'porto', 'sherry', 'madeira', 'marsala', 'vermouth', 'fortified']],
  ['red',       ['pinot noir', 'syrah', 'shiraz', 'cabernet sauvignon', 'cabernet franc', 'cabernet', 'merlot', 'malbec', 'tempranillo', 'grenache',
                 'garnacha', 'gamay', 'nebbiolo', 'barbera', 'sangiovese', 'zinfandel', 'primitivo', 'frappato', 'nero d\'avola', 'nero', 'montepulciano',
                 'mourvedre', 'monastrell', 'carignan', 'zweigelt', 'blaufrankisch', 'dolcetto', 'cinsault', 'bobal', 'mencia', 'touriga', 'aglianico',
                 'nerello', 'pinotage', 'carmenere', 'petite sirah', 'lagrein', 'schiava', 'trousseau', 'poulsard', 'listan negro', 'beaujolais',
                 'barolo', 'barbaresco', 'chianti', 'rioja', 'bordeaux', 'red burgundy', 'red']],
  ['white',     ['chardonnay', 'sauvignon blanc', 'fume blanc', 'riesling', 'chenin blanc', 'chenin', 'albarino', 'verdejo', 'vermentino',
                 'gruner veltliner', 'gruner', 'gewurztraminer', 'pinot grigio', 'pinot gris', 'pinot blanc', 'pinot bianco', 'muscadet', 'melon de bourgogne',
                 'txakoli', 'viognier', 'marsanne', 'roussanne', 'semillon', 'garganega', 'soave', 'fiano', 'greco', 'falanghina', 'godello',
                 'assyrtiko', 'torrontes', 'muscat', 'silvaner', 'sylvaner', 'furmint', 'trebbiano', 'verdicchio', 'arneis', 'chablis', 'sancerre',
                 'pouilly-fume', 'pouilly fume', 'white burgundy', 'white']],
];

const PATTERNS = TABLE.map(([color, names]) => [color, names.map(n => new RegExp(`(?<![a-z])${n.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?![a-z])`))]);

export const WINE_COLORS = ['red', 'white', 'rose', 'sparkling', 'fortified'];

export const COLOR_LABEL = { red:'red', white:'white', rose:'rosé', sparkling:'sparkling', fortified:'fortified' };

// The colour of a grape or style name, or null when it cannot be told.
export function colorOfGrape(text){
  const hay = fold(text);
  if (!hay) return null;
  for (const [color, res] of PATTERNS){
    if (res.some(re => re.test(hay))) return color;
  }
  return null;
}

// The colour of an owned bottle: its recorded type first, its grape or name
// as the fallback. A bottle whose colour cannot be told is never assumed.
export function colorOfWine(wine){
  const type = fold(wine?.type);
  if (type){
    if (type.startsWith('spark')) return 'sparkling';
    if (type.startsWith('ros')) return 'rose';
    if (type.startsWith('red')) return 'red';
    if (type.startsWith('white')) return 'white';
    if (type.startsWith('fort') || type.startsWith('dessert')) return 'fortified';
  }
  return colorOfGrape(wine?.grape) || colorOfGrape(wine?.name);
}

// A colour the user asked for in free text ("give me a red", "white instead",
// "something sparkling"), or null. Deliberately conservative: the word must
// be a colour word, not a grape that happens to be red.
export function requestedColor(text){
  const s = fold(text);
  if (/(?<![a-z])(sparkling|bubbl\w*|fizz\w*|champagne)(?![a-z])/.test(s)) return 'sparkling';
  if (/(?<![a-z])(rose|rosado|rosato|pink)(?![a-z])/.test(s)) return 'rose';
  if (/(?<![a-z])(white|whites)(?![a-z])/.test(s)) return 'white';
  if (/(?<![a-z])(red|reds)(?![a-z])/.test(s)) return 'red';
  if (/(?<![a-z])(fortified|port|sherry|madeira)(?![a-z])/.test(s)) return 'fortified';
  return null;
}
