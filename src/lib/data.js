// data.js — theme tokens, seed wines, verdict config, note vocab, order parser.
// Ported verbatim from the Wine Memory — Visual prototype (was app/data.jsx).

// ── Theme — clean, light, data-forward ───────────────────
const T = {
  bg:       '#f6f5f2',
  canvas:   '#efece5',   // app background behind cards
  surface:  '#faf9f6',
  raised:   '#eceae3',
  line:     'rgba(22,20,15,0.10)',
  line2:    'rgba(22,20,15,0.17)',
  ink:      '#17150f',
  ink2:     '#5d584c',
  ink3:     '#938d7e',
  ink4:     '#bdb6a6',
  black:    '#17150f',   // primary action
  // verdict palette — restrained, near-mono
  buy:      '#4f5e49',
  maybe:    '#857554',
  no:       '#9a685c',
  totry:    '#6b6a71',   // the queue colour
  buyBg:    '#eceee8', maybeBg:'#f0ece2', noBg:'#f1e9e6', totryBg:'#ececee',
};

// ── Verdicts ─────────────────────────────────────────────
const VERDICTS = {
  buy:   { id:'buy',   label:'Buy Again', short:'Buy', color:T.buy,   bg:T.buyBg,   glyph:'check' },
  maybe: { id:'maybe', label:'Maybe',     short:'Maybe', color:T.maybe, bg:T.maybeBg, glyph:'tilde' },
  no:    { id:'no',    label:'No',        short:'No',  color:T.no,    bg:T.noBg,    glyph:'cross' },
  totry: { id:'totry', label:'To Try',    short:'To Try', color:T.totry, bg:T.totryBg, glyph:'clock' },
};
const VERDICT_ORDER = ['buy','maybe','no']; // the settable verdicts (To Try is a queue status)

// ── Quick note tags (optional, memory-flavoured not technical) ──
const QUICK_TAGS = ['Great value','Special occasion','Crowd-pleaser','Weeknight','Worth the splurge','Cellar a few years','Too jammy','Funky','Crushable','Gift-worthy'];

// ── Seed wines ───────────────────────────────────────────
// loc:[lng,lat] persisted for the future map. note = personal memory.
const SEED = [
  { id:'w1', producer:'Produttori del Barbaresco', name:'Barbaresco', vintage:2019,
    type:'Red', grape:'Nebbiolo', region:'Barbaresco, Piedmont', country:'Italy', loc:[8.06,44.72],
    verdict:'buy', tags:['Worth the splurge','Special occasion'],
    note:'Braised short rib on a cold January night. Worth every penny.', where:'home',
    source:'Total Wine & More', price:32.99, added:'2026-05-30' },

  { id:'w2', producer:'Domaine Tempier', name:'Bandol Rosé', vintage:2022,
    type:'Rosé', grape:'Mourvèdre', region:'Bandol, Provence', country:'France', loc:[5.80,43.14],
    verdict:'buy', tags:['Special occasion'],
    note:'Branzino at L’Artusi — we ordered a second bottle before the entrées came.', where:'restaurant',
    source:'L’Artusi (NYC)', price:78, added:'2026-05-24' },

  { id:'w3', producer:'Ridge Vineyards', name:'Lytton Springs', vintage:2020,
    type:'Red', grape:'Zinfandel blend', region:'Dry Creek Valley, Sonoma', country:'USA', loc:[-122.95,38.62],
    verdict:'maybe', tags:['Too jammy'],
    note:'BBQ ribs at the Fourth. Good, but a little hot on the finish.', where:'home',
    source:'Total Wine & More', price:42, added:'2026-05-18' },

  { id:'w4', producer:'Occhipinti', name:'SP68 Rosso', vintage:2022,
    type:'Red', grape:'Frappato · Nero d’Avola', region:'Vittoria, Sicily', country:'Italy', loc:[14.53,36.95],
    verdict:'buy', tags:['Crushable','Crowd-pleaser'],
    note:'Tuesday pizza wine. Luke liked this one a lot.', where:'home',
    source:'Astor Wines', price:26, added:'2026-05-12' },

  { id:'w5', producer:'Jean Foillard', name:'Morgon Côte du Py', vintage:2021,
    type:'Red', grape:'Gamay', region:'Morgon, Beaujolais', country:'France', loc:[4.68,46.18],
    verdict:'buy', tags:['Gift-worthy'],
    note:'Tasted at the domaine on the Beaujolais trip — bought two on the spot.', where:'winery',
    source:'Winery visit', price:34, added:'2026-04-28' },

  { id:'w6', producer:'Bodegas Ponce', name:'Clos Lojen', vintage:2022,
    type:'Red', grape:'Bobal', region:'Manchuela', country:'Spain', loc:[-1.65,39.50],
    verdict:'maybe', tags:['Great value','Weeknight'],
    note:'Great value at $16. The reliable weeknight bottle.', where:'home',
    source:'Total Wine & More', price:16, added:'2026-04-20' },

  { id:'w7', producer:'Lioco', name:'Indica Carignan', vintage:2021,
    type:'Red', grape:'Carignan', region:'Mendocino', country:'USA', loc:[-123.40,39.15],
    verdict:'no', tags:['Funky'],
    note:'Too volatile for me — smelled like nail polish by day two.', where:'home',
    source:'Total Wine & More', price:24, added:'2026-04-11' },

  // ── To-Try queue: imported, not yet tasted ──
  { id:'w8', producer:'Bedrock Wine Co.', name:'Old Vine Zinfandel', vintage:2021,
    type:'Red', grape:'Zinfandel field blend', region:'Sonoma', country:'USA', loc:[-122.86,38.45],
    verdict:'totry', tags:[], note:'', where:'home',
    source:'Total Wine & More', price:28.99, added:'2026-06-09' },

  { id:'w9', producer:'François Chidaine', name:'Montlouis Les Tuffeaux', vintage:2021,
    type:'White', grape:'Chenin Blanc', region:'Montlouis-sur-Loire', country:'France', loc:[0.82,47.38],
    verdict:'totry', tags:[], note:'', where:'home',
    source:'Total Wine & More', price:34.99, added:'2026-06-09' },

  { id:'w10', producer:'Envínate', name:'Benje Tinto', vintage:2021,
    type:'Red', grape:'Listán Prieto', region:'Tenerife', country:'Spain', loc:[-16.62,28.29],
    verdict:'totry', tags:[], note:'', where:'home',
    source:'Total Wine & More', price:39, added:'2026-06-09' },
];

// Sample pasted order text for the import demo
const SAMPLE_ORDER = `Total Wine & More — Order #TW-4821903
Thank you for your order!

1 x  Bedrock Wine Co. Old Vine Zinfandel 2021 ....... $28.99
2 x  Domaine de la Côte Bloom's Field Pinot Noir 2021 .. $54.00
1 x  François Chidaine Montlouis Les Tuffeaux 2021 .... $34.99
1 x  Envínate Benje Tinto 2021 ...................... $39.00

Subtotal ......... $210.98
Pickup: Total Wine & More, Union Square`;

// Parsed result the "AI" returns from the text above
const PARSED_ORDER = [
  { producer:'Bedrock Wine Co.', name:'Old Vine Zinfandel', vintage:2021, type:'Red', region:'Sonoma, USA', loc:[-122.86,38.45], qty:1, price:28.99, dup:true },
  { producer:'Domaine de la Côte', name:"Bloom's Field Pinot Noir", vintage:2021, type:'Red', region:'Sta. Rita Hills, USA', loc:[-120.42,34.61], qty:2, price:54.00, dup:false },
  { producer:'François Chidaine', name:'Montlouis Les Tuffeaux', vintage:2021, type:'White', region:'Loire, France', loc:[0.82,47.38], qty:1, price:34.99, dup:true },
  { producer:'Envínate', name:'Benje Tinto', vintage:2021, type:'Red', region:'Tenerife, Spain', loc:[-16.62,28.29], qty:1, price:39.00, dup:false },
];

// Candidate matches the "AI" returns when searching in Quick Add
const SEARCH_INDEX = [
  { producer:'Produttori del Barbaresco', name:'Barbaresco Riserva Asili', vintage:2017, type:'Red', grape:'Nebbiolo', region:'Barbaresco, Piedmont', country:'Italy', loc:[8.06,44.72] },
  { producer:'G.D. Vajra', name:'Barolo Albe', vintage:2020, type:'Red', grape:'Nebbiolo', region:'Barolo, Piedmont', country:'Italy', loc:[7.94,44.61] },
  { producer:'Giuseppe Rinaldi', name:'Barolo Tre Tine', vintage:2019, type:'Red', grape:'Nebbiolo', region:'Barolo, Piedmont', country:'Italy', loc:[7.94,44.61] },
  { producer:'Vietti', name:'Barolo Castiglione', vintage:2019, type:'Red', grape:'Nebbiolo', region:'Castiglione Falletto', country:'Italy', loc:[7.97,44.62] },
  { producer:'Cavallotto', name:'Barolo Bricco Boschis', vintage:2018, type:'Red', grape:'Nebbiolo', region:'Castiglione Falletto', country:'Italy', loc:[7.97,44.62] },
  { producer:'Arnot-Roberts', name:'Trout Gulch Chardonnay', vintage:2022, type:'White', grape:'Chardonnay', region:'Santa Cruz Mtns', country:'USA', loc:[-122.0,37.05] },
];

// ── AI-enriched wine intelligence (flavor family, flavor axes, pairings) ──
// flavor axes 0–5: body, acidity, tannin, fruit, oak
const FLAVOR_FAMILIES = [
  { id:'bold',   label:'Bold & Structured', sub:'Full-bodied, firm, age-worthy', hue:348 },
  { id:'bright', label:'Bright & Crisp',     sub:'High-acid, mineral, refreshing', hue:48 },
  { id:'juicy',  label:'Smooth & Juicy',     sub:'Fruit-forward and easy',        hue:330 },
  { id:'wild',   label:'Earthy & Wild',      sub:'Savoury, funky, low-intervention', hue:150 },
];
const ENRICH = {
  w1:{ family:'bold',   flavor:{body:5,acidity:4,tannin:5,fruit:3,oak:2}, pairings:['Braised beef','Aged cheese','Mushroom risotto'] },
  w2:{ family:'bright', flavor:{body:2,acidity:4,tannin:0,fruit:3,oak:0}, pairings:['Grilled fish','Summer salads','Charcuterie'] },
  w3:{ family:'bold',   flavor:{body:4,acidity:3,tannin:3,fruit:4,oak:3}, pairings:['BBQ ribs','Burgers','Hard cheese'] },
  w4:{ family:'juicy',  flavor:{body:2,acidity:4,tannin:2,fruit:4,oak:0}, pairings:['Pizza','Tomato pasta','Pepperoni'] },
  w5:{ family:'wild',   flavor:{body:3,acidity:4,tannin:2,fruit:4,oak:1}, pairings:['Roast chicken','Charcuterie','Duck'] },
  w6:{ family:'juicy',  flavor:{body:3,acidity:3,tannin:2,fruit:4,oak:1}, pairings:['Lentils','Weeknight pasta','Tapas'] },
  w7:{ family:'wild',   flavor:{body:2,acidity:4,tannin:2,fruit:3,oak:0}, pairings:['Pork','Mushrooms','Grilled veg'] },
  w8:{ family:'juicy',  flavor:{body:4,acidity:3,tannin:3,fruit:5,oak:2}, pairings:['BBQ','Grilled meats','Burgers'] },
  w9:{ family:'bright', flavor:{body:2,acidity:5,tannin:0,fruit:2,oak:1}, pairings:['Oysters','Goat cheese','Sushi'] },
  w10:{ family:'wild',  flavor:{body:3,acidity:4,tannin:2,fruit:3,oak:1}, pairings:['Roast chicken','Charcuterie','Grilled veg'] },
};
SEED.forEach(w=> Object.assign(w, ENRICH[w.id] || {}));
SEED.forEach((w,i)=>{ w.sample = true; w.grape = w.grape || ''; w.photo = 'app/scan/b'+((i%8)+1)+'.jpg'; });
const PAIRING_GROUPS = [
  { id:'pizza', label:'Pizza & pasta night', match:['Pizza','Tomato pasta','Weeknight pasta','Pepperoni'] },
  { id:'steak', label:'Steak & braises',     match:['Braised beef','BBQ','BBQ ribs','Grilled meats','Burgers','Duck'] },
  { id:'sea',   label:'From the sea',         match:['Grilled fish','Oysters','Sushi'] },
  { id:'board', label:'The cheese board',     match:['Aged cheese','Hard cheese','Goat cheese','Charcuterie'] },
  { id:'bird',  label:'Roast chicken',        match:['Roast chicken','Pork'] },
];
// give a stable enrichment for newly-imported wines (so import auto-enriches)
function autoEnrich(w){
  if (w.flavor) return w;
  const fam = w.type==='White'||w.type==='Rosé'||w.type==='Rosé' ? 'bright' : (Math.random()<0.5?'juicy':'wild');
  const base = { bold:{body:5,acidity:4,tannin:5,fruit:3,oak:2}, bright:{body:2,acidity:5,tannin:0,fruit:2,oak:1}, juicy:{body:3,acidity:3,tannin:2,fruit:5,oak:1}, wild:{body:3,acidity:4,tannin:2,fruit:3,oak:1} }[fam];
  const pair = { bright:['Grilled fish','Salads','Goat cheese'], juicy:['Pizza','Burgers','Tomato pasta'], wild:['Roast chicken','Charcuterie','Mushrooms'] }[fam];
  return Object.assign(w, { family:fam, flavor:base, pairings:pair });
}

// ── Real order parser — extracts wines from arbitrary pasted receipts ──
const ORDER_GRAPES = ['Pinot Noir','Pinot Grigio','Pinot Gris','Pinot Blanc','Chardonnay','Malbec','Cabernet Sauvignon','Cabernet Franc','Cabernet','Merlot','Syrah','Shiraz','Sauvignon Blanc','Riesling','Zinfandel','Primitivo','Sangiovese','Nebbiolo','Barbera','Monica','Grenache','Garnacha','Tempranillo','Gamay','Chenin','Viognier','Carignan','Mourv','Nero d','Montepulciano','Albari','Grüner'];
const WHITE_RE = /Chardonnay|Pinot Grigio|Pinot Gris|Pinot Blanc|Sauvignon Blanc|Riesling|Chenin|Viognier|Albari|Gr[üu]ner|Verdejo|Soave|Vermentino/i;
const REGION_MAP = [
  [/willamette/i,'Willamette Valley, USA',[-123.1,45.2]],
  [/russian river/i,'Russian River Valley, USA',[-122.9,38.5]],
  [/napa/i,'Napa Valley, USA',[-122.3,38.5]],
  [/sonoma/i,'Sonoma, USA',[-122.9,38.4]],
  [/patagonia/i,'Patagonia, Argentina',[-67.5,-39.0]],
  [/mendoza/i,'Mendoza, Argentina',[-68.8,-32.9]],
  [/montepulciano|toscan|tuscan|chianti|brunello/i,'Tuscany, Italy',[11.4,43.3]],
  [/sardegna|sardinia/i,'Sardinia, Italy',[9.0,40.0]],
  [/piedmont|piemonte|barolo|barbaresco/i,'Piedmont, Italy',[8.0,44.7]],
  [/sicil|etna|vittoria/i,'Sicily, Italy',[14.4,37.5]],
  [/regni[ée]|beaujolais|morgon|fleurie|brouilly/i,'Beaujolais, France',[4.6,46.15]],
  [/bordeaux|médoc|margaux|pauillac/i,'Bordeaux, France',[-0.6,44.8]],
  [/burgundy|bourgogne|côte de/i,'Burgundy, France',[4.8,47.0]],
  [/loire|sancerre|vouvray|montlouis|muscadet/i,'Loire, France',[0.5,47.3]],
  [/châteauneuf|rhône|gigondas|côtes du rh/i,'Rhône, France',[4.8,44.0]],
  [/proven[cç]e|bandol/i,'Provence, France',[5.8,43.4]],
  [/rioja/i,'Rioja, Spain',[-2.5,42.4]],
  [/ribera/i,'Ribera del Duero, Spain',[-3.7,41.6]],
  [/priorat|montsant/i,'Catalonia, Spain',[0.8,41.2]],
  [/douro|porto|dao/i,'Douro, Portugal',[-7.8,41.2]],
  [/mosel|rheingau|pfalz/i,'Germany',[7.5,49.9]],
  [/marlborough|otago/i,'New Zealand',[173.9,-41.5]],
  [/barossa|mclaren|coonawarra/i,'Australia',[138.9,-34.5]],
];
function orderInferType(t){
  if (/ros[ée]\b|rosato/i.test(t)) return 'Rosé';
  if (/brut|champagne|cava|prosecco|spumante|sparkling|crémant|franciacorta/i.test(t)) return 'Sparkling';
  if (WHITE_RE.test(t)) return 'White';
  return 'Red';
}
function orderInferRegion(t){ for (const [re,reg,loc] of REGION_MAP) if (re.test(t)) return { region:reg, loc }; return { region:'Imported', loc:[2,42] }; }
function orderDetectGrape(title){ const t=title.toLowerCase(); for (const g of ORDER_GRAPES){ if (t.includes(g.toLowerCase())) return g; } return ''; }
function orderPrettyGrape(g){ return ({'Nero d':'Nero d’Avola','Mourv':'Mourvèdre','Albari':'Albariño','Grüner':'Grüner Veltliner','Cabernet':'Cabernet Sauvignon'})[g] || g; }
function orderDeriveProducer(title, g){
  const words = title.split(/\s+/).filter(Boolean);
  if (g){ const idx = title.toLowerCase().indexOf(g.toLowerCase()); const before = idx>0? title.slice(0,idx).trim():''; const bw = before? before.split(/\s+/):[];
    if (bw.length>=1 && bw.length<=3) return before;
    if (bw.length>3) return bw.slice(0,2).join(' '); }
  return words.slice(0, Math.min(2,words.length)).join(' ');
}
function parseOrder(text){
  if (!text) return [];
  const lines = text.split('\n').map(l=>l.replace(/ /g,' ').trim());
  const items = []; let cur = null;
  const pushCur = ()=>{ if (cur && cur.name) items.push(cur); cur=null; };
  const mk = (rawTitle, price)=>{
    let title = rawTitle.replace(/\t.*$/,'').replace(/\s+WD$/i,'').replace(/^\s*\d+\s*[x×]\s+/i,'').replace(/[.,\s]+$/,'').trim();
    let vintage='NV'; const vm = title.match(/,?\s*\b(19|20)\d{2}\b\s*$/);
    if (vm){ vintage = parseInt(vm[0].replace(/\D/g,'')); title = title.slice(0,vm.index).replace(/[,\s]+$/,'').trim(); }
    const graw = orderDetectGrape(title);
    return { producer: orderDeriveProducer(title, graw)||title, name: title, grape: orderPrettyGrape(graw), vintage, type:orderInferType(rawTitle), ...orderInferRegion(rawTitle), qty:1, price:price!=null?price:null, dup:false, sample:false };
  };
  const isPrice = l=> /^\$\s*[\d,.]+(\s*(each|\/\s*\w+)?)?$/i.test(l);
  const priceVal = l=>{ const m=l.match(/\$\s*([\d,.]+)/); return m? parseFloat(m[1].replace(/,/g,'')):null; };
  const isNoise = l=> /^WD$/i.test(l) || /^750\s?ml$/i.test(l) || /^\d+\s?ml$/i.test(l) || /^order summary/i.test(l) || /^sub-?total/i.test(l) || /^total\b/i.test(l) || /^pickup|^delivery|^shipping|^tax\b|^thank|^your order|^est\.?\s/i.test(l) || /^\(?\d+\s*items?\)?$/i.test(l);
  for (const l of lines){
    if (l==='') continue;
    const ol = l.match(/^(\d+)\s*x\s+(.+?)[\s.]*\$\s*([\d,.]+)/i);
    if (ol){ pushCur(); const it = mk(ol[2], parseFloat(ol[3].replace(/,/g,''))); it.qty = parseInt(ol[1])||1; items.push(it); continue; }
    const qm = l.match(/quantity:?\s*(\d+)/i);
    if (qm){ if (cur) cur.qty = parseInt(qm[1])||1; continue; }
    if (isPrice(l)){ if (cur && cur.price==null) cur.price = priceVal(l); continue; }
    if (isNoise(l)) continue;
    let clean = l.replace(/\t.*$/,'').replace(/\s+WD$/i,'').trim();
    let leadQty = null; const qx = clean.match(/^(\d+)\s*[x×]\s+/i); if (qx){ leadQty = parseInt(qx[1])||1; clean = clean.slice(qx[0].length).trim(); }
    const alphaWords = clean.split(/\s+/).filter(w=>/[a-zA-Z]/.test(w));
    if (alphaWords.length < 2 || /\$[\d]/.test(clean)) continue;
    if (cur && cur._raw===clean) continue;     // skip the duplicate name line
    pushCur(); cur = mk(clean, null); cur._raw = clean; if (leadQty) cur.qty = leadQty;
  }
  pushCur();
  const seen = new Set(); const out = [];
  for (const it of items){ const k=(it.producer+'|'+it.name+'|'+it.vintage).toLowerCase(); if (seen.has(k)) continue; seen.add(k); delete it._raw; out.push(it); }
  return out;
}

// ── friendly "Region Grape" style label (teach naturally) ──
const FRIENDLY_REGION = {
  'Willamette Valley':'Oregon','Russian River Valley':'California','Dry Creek Valley':'Sonoma',
  'Napa Valley':'Napa','Sonoma':'Sonoma','Mendoza':'Mendoza','Patagonia':'Patagonia',
  'Bandol':'Provence','Provence':'Provence','Morgon':'Beaujolais','Fleurie':'Beaujolais','Beaujolais':'Beaujolais',
  'Barbaresco':'Piedmont','Barolo':'Piedmont','Piedmont':'Piedmont','Vittoria':'Sicily','Sicily':'Sicily','Etna':'Sicily',
  'Manchuela':'Spain','Rioja':'Rioja','Tenerife':'Canary Islands','Montlouis-sur-Loire':'Loire','Loire':'Loire',
  'Tuscany':'Tuscany','Sardinia':'Sardinia','Mendocino':'Mendocino','Sta. Rita Hills':'Santa Barbara','Santa Cruz Mtns':'California',
};
function styleLabel(wine){
  const grape = wine.grape || wine.type || '';
  const r0 = (wine.region||'').split(',')[0].trim();
  let reg = FRIENDLY_REGION[r0] || FRIENDLY_REGION[(wine.region||'').trim()] || '';
  if (!reg && r0 && r0!=='Imported') reg = r0;
  if (!reg && wine.country && wine.country!=='USA') reg = wine.country;
  return reg ? `${reg} ${grape}`.trim() : grape;
}

// ── "What are you eating?" — homepage prompt examples (V1) ──
const EATING_EXAMPLES = ['Creamy shellfish pasta','Steak frites','Pizza','Roast chicken','Spicy Thai food','Mushroom pasta'];

// ── Saved Pairing (V1) — Dish → Wine → Why; powers My Favorite Pairings + My Palate ──
const SAVED_PAIRING_SCHEMA = {
  id:'string', dish:'string', style:'string', why:'string',
  related_saved_wine_id:'string|null', type:'string', date:'date',
};
function newSavedPairing(p){
  return Object.assign({ id:'p'+Date.now(), dish:'', style:'', why:'', related_saved_wine_id:null, type:'Red', date:new Date().toISOString().slice(0,10) }, p||{});
}

// ── Dining Experiences (FUTURE / V2) — generalises "Restaurant Mode".
// Ships dormant so it can be added later without restructuring. experience_type
// covers restaurant, dinner party, vacation, winery visit, tasting, holiday meal. ──
const DINING_TYPES = ['Restaurant','Dinner party','Vacation','Winery visit','Wine tasting','Holiday meal'];
const DINING_EXPERIENCE_SCHEMA = {
  id:                   'string',
  experience_type:      'string',          // one of DINING_TYPES
  place_name:           'string',          // restaurant name, host, destination…
  place_location:       'string',
  menu_url:             'string|null',
  dish_name:            'string',
  wine_name:            'string|null',      // the bottle you drank
  wine_price:           'number|null',
  match_confidence:     'string|null',      // 'high' | 'medium' | 'low' — for fetched lists
  pairing_note:         'string',
  visit_date:           'date',
  would_order_again:    'boolean',
  related_saved_wine_id:'string|null',      // → Wine.id in the collection
};
function newDiningExperience(p){
  return Object.assign({ id:'dx'+Date.now(), experience_type:'Restaurant', place_name:'', place_location:'', menu_url:null, dish_name:'', wine_name:null, wine_price:null, match_confidence:null, pairing_note:'', visit_date:new Date().toISOString().slice(0,10), would_order_again:false, related_saved_wine_id:null }, p||{});
}

// ── Multi-bottle scan (V1) — detected bottles from a counter photo ──
const DETECTED_BOTTLES = [
  { producer:'Phebus', name:'Phebus Malbec Patagonia Reserva', vintage:2024, type:'Red', grape:'Malbec', region:'Patagonia, Argentina', loc:[-67.5,-39.0], confidence:'high' },
  { producer:'Cruz Alta', name:'Cruz Alta Reserve Malbec', vintage:2024, type:'Red', grape:'Malbec', region:'Mendoza, Argentina', loc:[-68.8,-32.9], confidence:'high' },
  { producer:'Dolia', name:'Dolia Monica di Sardegna', vintage:'NV', type:'Red', grape:'Monica', region:'Sardinia, Italy', loc:[9.0,40.0], confidence:'medium' },
  { producer:'Domaine Pardon', name:'Domaine Pardon Régnié Cuvée Tim', vintage:2024, type:'Red', grape:'Gamay', region:'Beaujolais, France', loc:[4.6,46.15], confidence:'medium' },
  { producer:'Vecchia Cantina', name:'Vino Nobile di Montepulciano', vintage:2019, type:'Red', grape:'Sangiovese', region:'Tuscany, Italy', loc:[11.4,43.3], confidence:'high' },
  { producer:'River Road', name:'River Road Reserve Russian River Pinot Noir', vintage:2023, type:'Red', grape:'Pinot Noir', region:'Russian River Valley, USA', loc:[-122.9,38.5], confidence:'low' },
  { producer:'Kudos', name:'Kudos Pinot Noir', vintage:2023, type:'Red', grape:'Pinot Noir', region:'Willamette Valley, USA', loc:[-123.1,45.2], confidence:'high' },
  { producer:'Courtney Benham', name:'Courtney Benham Pinot Noir', vintage:2022, type:'Red', grape:'Pinot Noir', region:'California, USA', loc:[-120.0,37.0], confidence:'medium' },
];

export {
  T, VERDICTS, VERDICT_ORDER, QUICK_TAGS, SEED, SAMPLE_ORDER, PARSED_ORDER, SEARCH_INDEX,
  FLAVOR_FAMILIES, ENRICH, PAIRING_GROUPS, autoEnrich, parseOrder, styleLabel, EATING_EXAMPLES,
  SAVED_PAIRING_SCHEMA, newSavedPairing, DINING_TYPES, DINING_EXPERIENCE_SCHEMA, newDiningExperience,
  DETECTED_BOTTLES,
};
