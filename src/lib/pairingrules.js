// pairingrules.js — Wine Memory's own pairing guidance, as reviewed data.
//
// These rules are the app's "general wine principles" source. Keeping them here
// as versioned, inspectable data — rather than leaving them to model recall —
// is what lets an answer name the guidance it used, and lets that guidance be
// corrected once rather than argued with per query.
//
// Each rule carries an `id` so a later provenance record can cite it, and so a
// public-web research layer can attach sources to a named rule without the
// answer experience being redesigned around them.

const DISH_RULES = [
  // ── Compound dishes ─────────────────────────────────────────────
  // A sauce or preparation can change the pairing more than the protein does.
  // These sit FIRST because rule order is match order: "steak with mushroom
  // sauce" must reach the compound rule, not fall through to plain steak.
  // Each `why` speaks to BOTH elements of the dish.

  { re:/(steak|ribeye|filet|sirloin|\bbeef\b)[^.]*\b(mushroom|porcini|truffle)|\b(mushroom|porcini|truffle)\w*[^.]*\b(steak|ribeye|filet|sirloin|beef)/i,
    id:'steak-mushroom', dish:'steak with mushroom sauce',
    primary:{ grape:'Syrah', why:'It has enough body for the steak, while its peppery, smoky, savoury character meets the mushroom sauce head-on. Its dark fruit keeps the sauce’s umami from making the wine feel austere.', deeperTitle:'Northern Rhône Syrah — Crozes-Hermitage or Saint-Joseph', deeper:'These northern Rhône appellations make Syrah with savoury pepper and olive notes over dark fruit — structured enough for beef, earthy enough for mushrooms.', lookFor:["Crozes-Hermitage or Saint-Joseph on the label", "‘Northern Rhône’ or cool-climate Syrah — savoury, not jammy", "Umami reads as extra tannin, so favour real fruit over a lean, austere style"], matchGrapes:['Syrah','Cabernet Sauvignon','Merlot'] },
    others:[ {direction:'Bolder and firmer', grape:'Cabernet Sauvignon', why:'Structure and tannin suit the steak — favour a generous-fruited example rather than a very lean, aggressively tannic style.'}, {direction:'Softer and rounder', grape:'Merlot', why:'Enough body for the beef with rounder tannins and plum-like fruit that flatters the sauce.'} ], avoidNote:"Very jammy, high-alcohol reds fight the mushrooms’ earthiness instead of echoing it.", avoid:[] },

  { re:/chimichurri/i,
    id:'steak-chimichurri', dish:'steak with chimichurri',
    primary:{ grape:'Malbec', why:'Grilled beef wants Malbec’s dark fruit and grip, and the herbal, garlicky bite of chimichurri asks for a fresher, higher-lift style rather than a heavy one.', deeperTitle:'Malbec — Patagonia or high-altitude Mendoza (Uco Valley)', deeper:'Cooler-site Argentine Malbec keeps violet lift and freshness alongside the black fruit — the classic partner for beef with green, herby sauces.', lookFor:["‘Patagonia’ or ‘Uco Valley’ on an Argentine label for the fresher style", "Moderate oak — heavy vanilla smothers the herbs", "Cahors is the old-world Malbec route: darker and more savoury"], matchGrapes:['Malbec','Syrah','Cabernet Franc'] },
    others:[ {direction:'Greener and savoury', grape:'Cabernet Franc', why:'Its herbal, peppery streak echoes the chimichurri itself.'}, {direction:'Peppery and smoky', grape:'Syrah', why:'Trades some plushness for black pepper that suits the char.'} ], avoid:[] },

  { re:/(chicken|poultry|turkey)[^.]*\b(cream|creamy|alfredo|butter)|\b(cream|creamy|alfredo)\w*[^.]*\b(chicken|poultry|turkey)/i,
    id:'chicken-cream', dish:'chicken in cream sauce',
    primary:{ grape:'Chardonnay', why:'Its rounder body stands up to the cream while its acidity keeps each bite from feeling heavy, and the wine’s weight matches the chicken rather than burying it.', deeperTitle:'Lightly oaked Chardonnay — Mâcon or cooler-climate California', deeper:'White Burgundy from the Mâconnais, or coastal California Chardonnay, brings texture for the sauce with the freshness cream needs.', lookFor:["Mâcon-Villages or Saint-Véran for the Burgundy route", "‘Lightly oaked’ or ‘barrel fermented’ — some texture, not butterscotch", "Cooler regions (Sonoma Coast, Santa Barbara) keep the acidity you need"], matchGrapes:['Chardonnay','Pinot Noir','Chenin Blanc'] },
    others:[ {direction:'Lighter and red', grape:'Pinot Noir', why:'A silky, high-acid red that cuts the cream and stays gentle on the bird.'}, {direction:'Brighter and zestier', grape:'Chenin Blanc', why:'Trades roundness for nervy acidity and orchard fruit.'} ], avoid:[] },

  { re:/(spicy|arrabbiata|arrabiata|diavolo|nduja|calabrese)[^.]*\b(tomato|marinara|pasta|penne)|\b(tomato|marinara)[^.]*\b(spicy|chilli|chili|arrabbiata|diavolo)/i,
    id:'spicy-tomato', dish:'spicy tomato pasta',
    primary:{ grape:'Barbera', why:'The tomato needs matching acidity and the chilli punishes tannin, so Barbera’s high acid, low tannin and juicy fruit answer both at once — bright against the sauce, cooling against the heat.', deeperTitle:'Barbera d’Asti or Barbera d’Alba', deeper:'Piedmont Barbera is the weeknight red built for tangy, spicy tomato dishes: mouth-watering acidity, soft tannin, dark cherry fruit.', lookFor:["Barbera d’Asti or d’Alba on the label", "Low tannin and moderate alcohol — both keep chilli heat in check", "Frappato or a chilled lighter red works the same way"], matchGrapes:['Barbera','Frappato','Sangiovese','Riesling'] },
    others:[ {direction:'Cooler, gently sweet', grape:'Off-dry Riesling', why:'If the heat leads the dish, a touch of sweetness calms it in a way no red can.'}, {direction:'Lighter, chillable', grape:'Frappato', why:'A light Sicilian red served cool — refreshment with the acidity the tomato wants.'} ], avoidNote:"High-alcohol, firmly tannic reds amplify chilli heat and clash with the tomato’s acidity.", avoid:['Cabernet Sauvignon','Nebbiolo'] },

  // ── Single-focus dishes ─────────────────────────────────────────
  { re:/pesto|basil|herb|chimichurri.*(?!steak)/i, id:'pesto-herb', dish:'pesto pasta',
    primary:{ grape:'Pinot Noir', why:'A great lighter-bodied red — its bright acidity complements basil and garlic, and it sits more gracefully with pasta than a heavy red would.', deeperTitle:'Oregon Pinot Noir', deeper:'Focus on the Willamette Valley, Oregon. Those Pinots show vibrant cherry fruit, freshness, and a little earthiness that pair beautifully with herb-driven dishes.', lookFor:["Cool-climate Pinot: Willamette Valley, Sonoma Coast or red Burgundy", "‘Unoaked’ or ‘neutral oak’ on a white — oak fights basil", "Pale colour and 12–13.5% alcohol signal the lighter style you want"], matchGrapes:['Pinot Noir'] },
    others:[ {direction:'Fresher, whiter', grape:'Vermentino', why:'Citrusy and herbal — a natural match for pesto.'}, {direction:'Sharper, greener', grape:'Sauvignon Blanc', why:'High acidity and green, herbal notes mirror the basil.'} ], avoidNote:"Big tannic reds — Cabernet, Malbec, Syrah — flatten the basil and turn bitter against the garlic.", avoid:['Cabernet Sauvignon','Malbec','Zinfandel','Syrah'] },

  { re:/cream|shellfish|scallop|lobster|crab|prawn|shrimp|clam|alfredo/i, id:'cream-shellfish', dish:'creamy shellfish',
    primary:{ grape:'Pinot Noir', why:'Light-bodied with enough acidity to cut the cream, and soft tannins that won’t bully delicate shellfish.', deeperTitle:'Burgundy or Oregon Pinot Noir', deeper:'Look to red Burgundy or the Willamette Valley — silky, high-acid, low-oak styles that flatter cream sauces without overpowering the seafood.', lookFor:["Chablis, or a Chardonnay labelled unoaked", "Red Burgundy or Willamette Pinot for a light red", "Look for higher acidity — it is what cuts the cream"], matchGrapes:['Pinot Noir'] },
    others:[ {direction:'Crisper, no oak', grape:'Unoaked Chardonnay', why:'Chablis-style whites bring acidity and minerality without heavy oak.'}, {direction:'Sparkling, palate-cleansing', grape:'Champagne', why:'Bubbles and acidity refresh the palate between rich bites.'} ], avoidNote:"Tannic reds clash with delicate shellfish and can turn metallic.", avoid:['Cabernet Sauvignon','Malbec','Zinfandel','Syrah','Nebbiolo'] },

  { re:/vegetable|veggie|\bgarden\b|ratatouille|eggplant|aubergine|zucchini|courgette|asparagus|\bsalad\b|roasted veg|grilled veg/i, id:'garden-vegetables', dish:'garden vegetables',
    primary:{ grape:'Gamay', why:'Garden vegetables are fresh, green and delicate, so they want a light, high-acid wine that lifts the produce rather than burying it.', deeperTitle:'Beaujolais Gamay', deeper:'Beaujolais (Gamay) is bright, floral and low in tannin — it flatters herbs and seasonal vegetables. A crisp Sauvignon Blanc or dry rosé works just as well.', lookFor:["Beaujolais village names — Morgon, Fleurie, Brouilly", "Sancerre or Loire Sauvignon for the white route", "Dry rosé from Provence: pale, crisp, unoaked"], matchGrapes:['Gamay','Pinot Noir','Frappato','Sauvignon Blanc'] },
    others:[ {direction:'Herbal and white', grape:'Sauvignon Blanc', why:'Green, herbal notes mirror fresh garden vegetables.'}, {direction:'Pink and flexible', grape:'Dry Rosé', why:'Fresh and versatile with herbs and seasonal produce.'} ], avoidNote:"Heavy oak and firm tannin bury green vegetables rather than lifting them.", avoid:['Cabernet Sauvignon','Malbec','Zinfandel','Nebbiolo'] },

  { re:/ribeye|steak|\bbeef\b|braise|short rib|lamb|brisket|grilled meat/i, id:'grilled-red-meat', dish:'grilled red meat',
    primary:{ grape:'Malbec', why:'Bold, dark-fruited and structured — firm tannins grip the fat and char of grilled red meat.', deeperTitle:'Mendoza Malbec', deeper:'Argentine Malbec from Mendoza delivers plush black fruit and velvety tannin built for steak; Patagonia versions add a little freshness for herby sauces like chimichurri.', lookFor:["Northern Rhône names — Crozes-Hermitage, Saint-Joseph — for peppery Syrah", "Mendoza or Cahors for Malbec; Cahors is the more savoury", "With Cabernet, favour a generous-fruited example over a lean, aggressively tannic one"], matchGrapes:['Malbec','Cabernet Sauvignon','Syrah','Nebbiolo'] },
    others:[ {direction:'More structured', grape:'Cabernet Sauvignon', why:'The steakhouse classic — cassis and grippy tannin.'}, {direction:'Peppery and savoury', grape:'Syrah', why:'Peppery and savory, great with a charred, herby crust.'} ], avoid:[] },

  { re:/roast chicken|\bchicken\b|turkey|\bpork\b|poultry/i, id:'poultry', dish:'roast chicken',
    primary:{ grape:'Pinot Noir', why:'Light, savory and bright — it flatters roast poultry without steamrolling it.', deeperTitle:'Beaujolais Gamay', deeper:'For joy and value, look to Beaujolais (the grape is Gamay): juicy, floral, low-tannin reds that are endlessly friendly with roast chicken.', lookFor:["Beaujolais crus for juicy, low-tannin reds", "Village-level red Burgundy for something more savoury", "A rounder white: Chardonnay with light oak echoes the roasted skin"], matchGrapes:['Pinot Noir','Gamay'] },
    others:[ {direction:'Rounder and white', grape:'Chardonnay', why:'A rounder white echoes roasted, buttery skin.'}, {direction:'Juicier, lighter', grape:'Gamay', why:'Bright and low-tannin — wonderfully food-friendly.'} ], avoidNote:"Full-bodied Cabernet Sauvignon overwhelms roast poultry.", avoid:['Cabernet Sauvignon'] },

  { re:/spicy|thai|curry|szechuan|sichuan|korean|gochujang|chili|chilli|indian/i, id:'spicy-heat', dish:'spicy food',
    primary:{ grape:'Riesling', why:'A touch of sweetness and racy acidity tame chili heat while lifting aromatic spice.', deeperTitle:'Off-dry Mosel Riesling', deeper:'German Mosel Riesling (look for “Kabinett”) balances gentle sweetness with bright acidity — ideal for Thai and Sichuan heat.', lookFor:["German Riesling marked Kabinett or Feinherb — gently off-dry", "Alcohol at or below 11% — high alcohol amplifies chilli heat", "Aromatic whites: Gewürztraminer, Grüner Veltliner"], matchGrapes:['Riesling','Chenin','Gewürztraminer'] },
    others:[ {direction:'Floral and fuller', grape:'Gewürztraminer', why:'Floral and slightly sweet — a curry classic.'}, {direction:'Peppery and dry', grape:'Grüner Veltliner', why:'Peppery and crisp; handles spice and herbs.'} ], avoidNote:"High-alcohol reds make chilli burn hotter, and heavy tannin turns harsh against spice.", avoid:['Cabernet Sauvignon','Malbec','Nebbiolo','Zinfandel'] },

  { re:/mushroom|truffle|umami|porcini|risotto/i, id:'mushroom-umami', dish:'mushroom pasta',
    primary:{ grape:'Pinot Noir', why:'Earthy and savory — it echoes umami mushroom flavors instead of fighting them.', deeperTitle:'Burgundy or Barolo', deeper:'Red Burgundy (Pinot Noir) or Nebbiolo from Barolo/Barbaresco bring forest-floor and truffle notes that sing with mushrooms.', lookFor:["Village Burgundy, or Willamette Pinot, for forest-floor character", "Nebbiolo from Langhe for a more structured, savoury route", "Umami makes wine read more tannic — favour softer tannin and real fruit"], matchGrapes:['Pinot Noir','Nebbiolo','Gamay'] },
    others:[ {direction:'More structured', grape:'Nebbiolo', why:'Tar, rose and dried herbs — magic with mushrooms.'}, {direction:'Lighter and earthier', grape:'Gamay', why:'Lighter, earthy and bright.'} ], avoidNote:"Jammy, high-alcohol reds fight the earthiness rather than echoing it.", avoid:['Zinfandel'] },

  { re:/pizza|marinara|tomato|red sauce|lasagna|bolognese|\bpasta\b/i, id:'tomato-red-sauce', dish:'pizza & red sauce',
    primary:{ grape:'Sangiovese', why:'High acidity matches the tomato’s tang and savory herbs, with enough grip for cheese and cured meats.', deeperTitle:'Chianti (Tuscany)', deeper:'Tuscan Sangiovese — Chianti Classico — is the classic red-sauce wine: tart cherry, herbs and mouth-watering acidity.', lookFor:["Chianti Classico — the black rooster seal on the neck", "Barbera d’Asti or d’Alba for juicy, low-tannin weeknight bottles", "High acidity is the requirement — it matches the tomato"], matchGrapes:['Sangiovese','Nero','Frappato','Barbera','Montepulciano','Gamay'] },
    others:[ {direction:'Juicier, softer', grape:'Barbera', why:'Juicy, low-tannin and high-acid — pizza’s best friend.'}, {direction:'Lighter, chillable', grape:'Frappato', why:'Light, floral Sicilian red; chill it slightly.'} ], avoid:[] },

  { re:/oyster|sushi|raw fish|ceviche|crudo|white fish|sole|branzino|seafood|fish/i, id:'seafood', dish:'seafood',
    primary:{ grape:'Sauvignon Blanc', why:'Crisp, zesty and mineral — it lifts delicate seafood without weighing it down.', deeperTitle:'Loire Sauvignon Blanc', deeper:'Sancerre and Pouilly-Fumé from the Loire are flinty, citrusy whites built for oysters and raw fish.', lookFor:["Sancerre or Pouilly-Fumé for flinty Sauvignon", "Muscadet Sèvre-et-Maine sur lie for oysters", "Albariño from Rías Baixas: saline and citrusy"], matchGrapes:['Sauvignon Blanc','Chenin','Chardonnay','Riesling','Vermentino'] },
    others:[ {direction:'Leaner and brinier', grape:'Muscadet', why:'Briny and lean — the oyster wine.'}, {direction:'Rounder, more citrus', grape:'Albariño', why:'Saline and citrusy; perfect with shellfish.'} ], avoidNote:"Tannic reds and delicate seafood is the classic mismatch — it reads metallic.", avoid:['Cabernet','Malbec','Zinfandel'] },

  { re:/cheese|charcuterie|cured|salami|prosciutto|board/i, id:'cheese-charcuterie', dish:'a cheese board',
    primary:{ grape:'Nebbiolo', why:'Firm acidity and tannin cut through salty, fatty cheese and cured meats.', deeperTitle:'Barolo / Barbaresco', deeper:'Piedmont Nebbiolo offers structure and savory depth that stands up to a loaded board.', lookFor:["Langhe Nebbiolo is the affordable way into the style", "Salt softens tannin, so a firmer wine works better here than it would elsewhere", "Match the board: softer cheeses want lighter, brighter reds"], matchGrapes:['Nebbiolo','Gamay','Syrah','Sangiovese'] },
    others:[ {direction:'Brighter and softer', grape:'Gamay', why:'Bright and juicy — great with softer cheeses.'}, {direction:'Smokier, for cured meats', grape:'Syrah', why:'Smoky and savory for cured meats.'} ], avoid:[] },
];
const DEFAULT_RULE = { id:'general-versatile', dish:'this meal',
  primary:{ grape:'Pinot Noir', why:'A versatile, food-friendly red — light enough for most dishes, with acidity that keeps things fresh.', deeperTitle:'Cool-climate Pinot Noir', deeper:'Oregon or Burgundy Pinot Noir is a safe, food-loving choice across a wide range of meals.', lookFor:["Medium body, moderate alcohol and fresh acidity is the safest shape for a mixed table", "Avoid heavy oak when you don’t know the dish", "A dry rosé or a light red covers the widest range"], matchGrapes:['Pinot Noir','Gamay'] },
  others:[ {direction:'Pink and flexible', grape:'Dry Rosé', why:'Crowd-pleasing and flexible across many foods.'}, {direction:'Crisp and white', grape:'Sauvignon Blanc', why:'Crisp and bright for lighter plates.'} ], avoid:[] };

function priceLimit(q){ const m=q.match(/under\s*\$?(\d+)|below\s*\$?(\d+)|\$(\d+)\s*or less/i); if(!m) return null; return parseInt(m[1]||m[2]||m[3]); }

// ── What counts as a food-pairing question ──────────────────────────
// A pairing question earns the INSTANT rule answer; everything else waits for
// research. An earlier version treated any question containing "?" as a
// pairing question, which briefly showed the versatile pairing card for
// "Should I buy this bottle?", "Why do I like Nebbiolo?", "Is 2021 a good
// vintage?" and "Barolo vs Barbaresco?" — questions whose honest answers need
// evidence, not a Pinot Noir card. The classifier now requires an actual
// pairing signal: pairing-specific language, a food term, a meal occasion, or
// a matched dish rule. No punctuation shortcut.
const PAIRING_LANGUAGE = /\bpair\w*\b|\bgo(?:es)?\s+with\b|\bserve\s+with\b|\bdrink\s+with\b|\bhave\s+with\b|\bmatch\w*\s+with\b|\bwine\s+(?:for|with)\b|\bwhat\s+(?:should\s+i|to)\s+(?:drink|open|pour|serve)\b|\bwhat\s+wine\b|\bwhich\s+wine\b/i;
const FOOD_WORDS = /\bpasta\b|\bpizza\b|\bsteak\b|\bbeef\b|\bribeye\b|\bchicken\b|\bpoultry\b|\bturkey\b|\bpork\b|\blamb\b|\bbrisket\b|\bfish\b|\bseafood\b|\bshellfish\b|\boysters?\b|\bsushi\b|\bshrimp\b|\bprawns?\b|\bcrab\b|\blobster\b|\bscallops?\b|\bcheese\b|\bcharcuterie\b|\bsalad\b|\bvegetables?\b|\bveggies?\b|\bmushrooms?\b|\brisotto\b|\bcurry\b|\btacos?\b|\bburgers?\b|\bbbq\b|\bbarbecue\b|\bcasserole\b|\bsoup\b|\bstew\b|\broast\b|\bgrill(?:ed|ing)?\b|\bdessert\b|\bchocolate\b|\bappetizers?\b|\bsnacks?\b|\bsauce\b|\beat(?:ing)?\b|\bmeals?\b|\bdish(?:es)?\b|\bfood\b|\bdinner\b|\blunch\b|\bbrunch\b|\bcooking\b|\brecipe\b/i;
const OCCASIONS = /\btonight\b|\bdinner\s+party\b|\bpotluck\b|\bthanksgiving\b|\bbring\s+to\b|\bdate\s+night\b|\bweeknight\b|\bholiday\s+meal\b|\bcookout\b/i;
const isPairingQuery = (q)=>{
  const s = String(q ?? '');
  if (!s.trim()) return false;
  if (DISH_RULES.some(r=>r.re.test(s))) return true;
  if (PAIRING_LANGUAGE.test(s)) return true;
  if (FOOD_WORDS.test(s)) return true;
  if (OCCASIONS.test(s)) return true;
  return false;
};

// `matched` says whether a real dish rule fired. When nothing matched we fall
// back to versatile guidance, and the answer presents itself that way rather
// than implying the dish was understood. `avoidNote` travels with the rule so
// a meaningful warning survives even when the AI is unavailable.
function heuristicPairing(query){
  const hit = DISH_RULES.find(r=>r.re.test(query));
  const rule = hit || DEFAULT_RULE;
  return { dish:rule.dish, ruleId:rule.id, primary:rule.primary, others:rule.others,
    limit:priceLimit(query), avoid:rule.avoid||[], avoidNote:rule.avoidNote||'', matched:!!hit };
}

// The headline above a pairing answer. When the dish was not recognised, the
// answer must present itself as a versatile starting point — never as a
// pairing calculated for that specific dish. AI results carry no `matched`
// flag (undefined !== false), so they keep the dish headline.
function pairingHeadline(result){
  if (result && result.matched === false) return 'A versatile starting point';
  return result && result.dish ? 'For ' + result.dish : '';
}

export { DISH_RULES, DEFAULT_RULE, priceLimit, isPairingQuery, heuristicPairing, pairingHeadline };
