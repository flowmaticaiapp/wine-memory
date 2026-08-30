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
  { re:/pesto|basil|herb|chimichurri.*(?!steak)/i, id:'pesto-herb', dish:'pesto pasta',
    primary:{ grape:'Pinot Noir', why:'A great lighter-bodied red — its bright acidity complements basil and garlic, and it sits more gracefully with pasta than a heavy red would.', deeperTitle:'Oregon Pinot Noir', deeper:'Focus on the Willamette Valley, Oregon. Those Pinots show vibrant cherry fruit, freshness, and a little earthiness that pair beautifully with herb-driven dishes.', matchGrapes:['Pinot Noir'] },
    others:[ {grape:'Vermentino', why:'Citrusy and herbal — a natural match for pesto.'}, {grape:'Sauvignon Blanc', why:'High acidity and green, herbal notes mirror the basil.'} ], avoid:['Cabernet','Malbec','Zinfandel','Syrah'] },

  { re:/cream|shellfish|scallop|lobster|crab|prawn|shrimp|clam|alfredo/i, id:'cream-shellfish', dish:'creamy shellfish',
    primary:{ grape:'Pinot Noir', why:'Light-bodied with enough acidity to cut the cream, and soft tannins that won’t bully delicate shellfish.', deeperTitle:'Burgundy or Oregon Pinot Noir', deeper:'Look to red Burgundy or the Willamette Valley — silky, high-acid, low-oak styles that flatter cream sauces without overpowering the seafood.', matchGrapes:['Pinot Noir'] },
    others:[ {grape:'Unoaked Chardonnay', why:'Chablis-style whites bring acidity and minerality without heavy oak.'}, {grape:'Champagne', why:'Bubbles and acidity refresh the palate between rich bites.'} ], avoid:['Cabernet','Malbec','Zinfandel','Syrah','Nebbiolo'] },

  { re:/vegetable|veggie|\bgarden\b|ratatouille|eggplant|aubergine|zucchini|courgette|asparagus|\bsalad\b|roasted veg|grilled veg/i, id:'garden-vegetables', dish:'garden vegetables',
    primary:{ grape:'Gamay', why:'Garden vegetables are fresh, green and delicate, so they want a light, high-acid wine that lifts the produce rather than burying it.', deeperTitle:'Beaujolais Gamay', deeper:'Beaujolais (Gamay) is bright, floral and low in tannin — it flatters herbs and seasonal vegetables. A crisp Sauvignon Blanc or dry rosé works just as well.', matchGrapes:['Gamay','Pinot Noir','Frappato','Sauvignon Blanc'] },
    others:[ {grape:'Sauvignon Blanc', why:'Green, herbal notes mirror fresh garden vegetables.'}, {grape:'Dry Rosé', why:'Fresh and versatile with herbs and seasonal produce.'} ], avoid:['Cabernet','Malbec','Zinfandel','Nebbiolo'] },

  { re:/ribeye|steak|\bbeef\b|braise|short rib|lamb|brisket|grilled meat/i, id:'grilled-red-meat', dish:'grilled red meat',
    primary:{ grape:'Malbec', why:'Bold, dark-fruited and structured — firm tannins grip the fat and char of grilled red meat.', deeperTitle:'Mendoza Malbec', deeper:'Argentine Malbec from Mendoza delivers plush black fruit and velvety tannin built for steak; Patagonia versions add a little freshness for herby sauces like chimichurri.', matchGrapes:['Malbec','Cabernet','Syrah','Nebbiolo'] },
    others:[ {grape:'Cabernet Sauvignon', why:'The steakhouse classic — cassis and grippy tannin.'}, {grape:'Syrah', why:'Peppery and savory, great with a charred, herby crust.'} ], avoid:[] },

  { re:/roast chicken|\bchicken\b|turkey|\bpork\b|poultry/i, id:'poultry', dish:'roast chicken',
    primary:{ grape:'Pinot Noir', why:'Light, savory and bright — it flatters roast poultry without steamrolling it.', deeperTitle:'Beaujolais Gamay', deeper:'For joy and value, look to Beaujolais (the grape is Gamay): juicy, floral, low-tannin reds that are endlessly friendly with roast chicken.', matchGrapes:['Pinot Noir','Gamay'] },
    others:[ {grape:'Chardonnay', why:'A rounder white echoes roasted, buttery skin.'}, {grape:'Gamay', why:'Bright and low-tannin — wonderfully food-friendly.'} ], avoid:['Cabernet'] },

  { re:/spicy|thai|curry|szechuan|sichuan|korean|gochujang|chili|chilli|indian/i, id:'spicy-heat', dish:'spicy food',
    primary:{ grape:'Riesling', why:'A touch of sweetness and racy acidity tame chili heat while lifting aromatic spice.', deeperTitle:'Off-dry Mosel Riesling', deeper:'German Mosel Riesling (look for “Kabinett”) balances gentle sweetness with bright acidity — ideal for Thai and Sichuan heat.', matchGrapes:['Riesling','Chenin','Gew'] },
    others:[ {grape:'Gewürztraminer', why:'Floral and slightly sweet — a curry classic.'}, {grape:'Grüner Veltliner', why:'Peppery and crisp; handles spice and herbs.'} ], avoid:['Cabernet','Malbec','Nebbiolo','Zinfandel'] },

  { re:/mushroom|truffle|umami|porcini|risotto/i, id:'mushroom-umami', dish:'mushroom pasta',
    primary:{ grape:'Pinot Noir', why:'Earthy and savory — it echoes umami mushroom flavors instead of fighting them.', deeperTitle:'Burgundy or Barolo', deeper:'Red Burgundy (Pinot Noir) or Nebbiolo from Barolo/Barbaresco bring forest-floor and truffle notes that sing with mushrooms.', matchGrapes:['Pinot Noir','Nebbiolo','Gamay'] },
    others:[ {grape:'Nebbiolo', why:'Tar, rose and dried herbs — magic with mushrooms.'}, {grape:'Gamay', why:'Lighter, earthy and bright.'} ], avoid:['Zinfandel'] },

  { re:/pizza|marinara|tomato|red sauce|lasagna|bolognese|\bpasta\b/i, id:'tomato-red-sauce', dish:'pizza & red sauce',
    primary:{ grape:'Sangiovese', why:'High acidity matches the tomato’s tang and savory herbs, with enough grip for cheese and cured meats.', deeperTitle:'Chianti (Tuscany)', deeper:'Tuscan Sangiovese — Chianti Classico — is the classic red-sauce wine: tart cherry, herbs and mouth-watering acidity.', matchGrapes:['Sangiovese','Nero','Frappato','Barbera','Montepulciano','Gamay'] },
    others:[ {grape:'Barbera', why:'Juicy, low-tannin and high-acid — pizza’s best friend.'}, {grape:'Frappato', why:'Light, floral Sicilian red; chill it slightly.'} ], avoid:[] },

  { re:/oyster|sushi|raw fish|ceviche|crudo|white fish|sole|branzino|seafood|fish/i, id:'seafood', dish:'seafood',
    primary:{ grape:'Sauvignon Blanc', why:'Crisp, zesty and mineral — it lifts delicate seafood without weighing it down.', deeperTitle:'Loire Sauvignon Blanc', deeper:'Sancerre and Pouilly-Fumé from the Loire are flinty, citrusy whites built for oysters and raw fish.', matchGrapes:['Sauvignon Blanc','Chenin','Chardonnay','Riesling','Vermentino'] },
    others:[ {grape:'Muscadet', why:'Briny and lean — the oyster wine.'}, {grape:'Albariño', why:'Saline and citrusy; perfect with shellfish.'} ], avoid:['Cabernet','Malbec','Zinfandel'] },

  { re:/cheese|charcuterie|cured|salami|prosciutto|board/i, id:'cheese-charcuterie', dish:'a cheese board',
    primary:{ grape:'Nebbiolo', why:'Firm acidity and tannin cut through salty, fatty cheese and cured meats.', deeperTitle:'Barolo / Barbaresco', deeper:'Piedmont Nebbiolo offers structure and savory depth that stands up to a loaded board.', matchGrapes:['Nebbiolo','Gamay','Syrah','Sangiovese'] },
    others:[ {grape:'Gamay', why:'Bright and juicy — great with softer cheeses.'}, {grape:'Syrah', why:'Smoky and savory for cured meats.'} ], avoid:[] },
];
const DEFAULT_RULE = { id:'general-versatile', dish:'this meal',
  primary:{ grape:'Pinot Noir', why:'A versatile, food-friendly red — light enough for most dishes, with acidity that keeps things fresh.', deeperTitle:'Cool-climate Pinot Noir', deeper:'Oregon or Burgundy Pinot Noir is a safe, food-loving choice across a wide range of meals.', matchGrapes:['Pinot Noir','Gamay'] },
  others:[ {grape:'Dry Rosé', why:'Crowd-pleasing and flexible across many foods.'}, {grape:'Sauvignon Blanc', why:'Crisp and bright for lighter plates.'} ], avoid:[] };

function priceLimit(q){ const m=q.match(/under\s*\$?(\d+)|below\s*\$?(\d+)|\$(\d+)\s*or less/i); if(!m) return null; return parseInt(m[1]||m[2]||m[3]); }
const isPairingQuery = (q)=> /\bpair|with|eat|dinner|drink|food|night|meal|\?|\bfor\b/i.test(q) || DISH_RULES.some(r=>r.re.test(q));

// `matched` says whether a real dish rule fired. When nothing matched we fall
// back to versatile guidance, and the answer presents itself that way rather
// than implying the dish was understood.
function heuristicPairing(query){
  const hit = DISH_RULES.find(r=>r.re.test(query));
  const rule = hit || DEFAULT_RULE;
  return { dish:rule.dish, ruleId:rule.id, primary:rule.primary, others:rule.others,
    limit:priceLimit(query), avoid:rule.avoid||[], matched:!!hit };
}

export { DISH_RULES, DEFAULT_RULE, priceLimit, isPairingQuery, heuristicPairing };
