// palate.js — taste-pattern analysis for the Palate "taste portrait".
// Pure functions over the wines array. No new data stored: everything is derived
// from fields already on each wine (flavor axes, grape, region/country, verdict, loc).

// ── Region atlas: canonical wine regions with map centers + a taste trait ──
// center is [lat, lng] (Leaflet order). `keys` are matched against region+country+grape.
// `trait` powers both the "Regions you love" label and the map's "why it fits".
const REGION_ATLAS = [
  { key:'russian-river', label:'Russian River Valley', country:'USA', center:[38.5,-122.92], keys:['russian river'], trait:'silky, cool-climate Pinot' },
  { key:'sonoma',     label:'Sonoma',        country:'USA',     center:[38.45,-122.9], keys:['sonoma','dry creek'], trait:'ripe, sun-filled reds' },
  { key:'napa',       label:'Napa Valley',   country:'USA',     center:[38.5,-122.3],  keys:['napa'], trait:'bold, structured Cabernet' },
  { key:'oregon',     label:'Oregon',        country:'USA',     center:[45.2,-123.1],  keys:['willamette','oregon'], trait:'elegant, high-acid Pinot' },
  { key:'mendocino',  label:'Mendocino',     country:'USA',     center:[39.15,-123.4], keys:['mendocino'], trait:'rustic, characterful reds' },
  { key:'sta-rita',   label:'Santa Barbara', country:'USA',     center:[34.6,-120.4],  keys:['sta. rita','santa rita','sta rita','santa barbara'], trait:'cool-climate Pinot & Chardonnay' },
  { key:'california', label:'California',     country:'USA',     center:[37.05,-121.0], keys:['santa cruz','california'], trait:'sun-filled New World reds' },
  { key:'piedmont',   label:'Piedmont',      country:'Italy',   center:[44.72,8.0],    keys:['piedmont','piemonte','barolo','barbaresco','nebbiolo','barbera','castiglione'], trait:'high-acid, structured reds' },
  { key:'sicily',     label:'Sicily',        country:'Italy',   center:[37.5,14.4],    keys:['sicil','vittoria','etna','frappato','nero d'], trait:'high-acid, volcanic reds' },
  { key:'tuscany',    label:'Tuscany',       country:'Italy',   center:[43.3,11.4],    keys:['tuscany','toscana','chianti','montepulciano','brunello','sangiovese'], trait:'tart-cherry, savory Sangiovese' },
  { key:'sardinia',   label:'Sardinia',      country:'Italy',   center:[40.0,9.0],     keys:['sardinia','sardegna','monica'], trait:'bright, herbal island reds' },
  { key:'beaujolais', label:'Beaujolais',    country:'France',  center:[46.15,4.65],   keys:['beaujolais','morgon','fleurie','brouilly','gamay','regni','régni'], trait:'juicy, light, food-friendly reds' },
  { key:'loire',      label:'Loire',         country:'France',  center:[47.3,0.5],     keys:['loire','montlouis','vouvray','sancerre','muscadet','chenin','chinon'], trait:'bright, mineral whites' },
  { key:'provence',   label:'Provence',      country:'France',  center:[43.4,5.8],     keys:['provence','bandol'], trait:'crisp, savory rosé' },
  { key:'burgundy',   label:'Burgundy',      country:'France',  center:[47.0,4.8],     keys:['burgundy','bourgogne','côte de','cote de'], trait:'precise, earthy Pinot & Chardonnay' },
  { key:'bordeaux',   label:'Bordeaux',      country:'France',  center:[44.8,-0.6],    keys:['bordeaux','médoc','medoc','margaux','pauillac'], trait:'firm, age-worthy blends' },
  { key:'rhone',      label:'Rhône',         country:'France',  center:[44.0,4.8],     keys:['rhône','rhone','gigondas','châteauneuf','chateauneuf'], trait:'peppery, savory Syrah' },
  { key:'ribera',     label:'Ribera del Duero', country:'Spain', center:[41.6,-3.7],   keys:['ribera'], trait:'dense, structured Tempranillo' },
  { key:'rioja',      label:'Rioja',         country:'Spain',   center:[42.4,-2.5],    keys:['rioja','tempranillo'], trait:'savory, oak-kissed Tempranillo' },
  { key:'catalonia',  label:'Catalonia',     country:'Spain',   center:[41.2,0.8],     keys:['priorat','montsant','catalonia'], trait:'powerful, mineral reds' },
  { key:'manchuela',  label:'Manchuela',     country:'Spain',   center:[39.5,-1.65],   keys:['manchuela','bobal'], trait:'juicy, great-value reds' },
  { key:'canary',     label:'Canary Islands',country:'Spain',   center:[28.29,-16.62], keys:['tenerife','canary','listán','listan'], trait:'wild, volcanic reds' },
  { key:'douro',      label:'Douro',         country:'Portugal',center:[41.2,-7.8],    keys:['douro','porto','dão','dao'], trait:'structured field-blend reds' },
  { key:'germany',    label:'Mosel',         country:'Germany', center:[49.9,7.0],     keys:['mosel','rheingau','pfalz','germany'], trait:'featherlight, electric Riesling' },
  { key:'mendoza',    label:'Mendoza',       country:'Argentina',center:[-32.9,-68.8], keys:['mendoza'], trait:'plush, dark-fruited Malbec' },
  { key:'patagonia',  label:'Patagonia',     country:'Argentina',center:[-39.0,-67.5], keys:['patagonia'], trait:'fresh, lifted Malbec' },
];

function hayOf(w){ return ((w.region||'')+' '+(w.country||'')+' '+(w.grape||'')+' '+(w.name||'')).toLowerCase(); }

// Resolve a wine to a region group. Known regions use the atlas center; anything
// unmatched falls back to the wine's own stored centroid (loc) so it still maps.
function resolveRegion(w){
  const hay = hayOf(w);
  for (const r of REGION_ATLAS){ if (r.keys.some(k=>hay.includes(k))) return r; }
  const loc = Array.isArray(w.loc) ? [w.loc[1], w.loc[0]] : null; // [lng,lat] -> [lat,lng]
  const country = w.country || (w.region||'').split(',').slice(-1)[0].trim() || 'Other';
  return { key:'other:'+country, label:country, country, center:loc, trait:'' };
}

const VWEIGHT = { buy:3, maybe:1, totry:0.5, no:-2 };

// Group the cellar by region, with verdict tallies, affinity score, and a center.
export function groupByRegion(wines){
  const m = {};
  for (const w of wines){
    const r = resolveRegion(w);
    if (!m[r.key]) m[r.key] = { ...r, wines:[], buy:0, maybe:0, no:0, totry:0, score:0 };
    const g = m[r.key];
    g.wines.push(w);
    if (g[w.verdict] != null) g[w.verdict]++;
    g.score += (VWEIGHT[w.verdict] || 0);
    if (!g.center && Array.isArray(w.loc)) g.center = [w.loc[1], w.loc[0]];
  }
  return Object.values(m).filter(g=>g.center); // only mappable groups
}

// Regions you love — verdict-weighted ranking (Buy Again dominates).
export function regionsYouLove(wines, limit=6){
  return groupByRegion(wines).filter(g=>g.score>0)
    .sort((a,b)=> b.score-a.score || b.buy-a.buy)
    .slice(0, limit);
}

// Affinity meter level 1..4 from score (for the dots + halo size).
export function affinityLevel(score){
  if (score>=8) return 4;
  if (score>=4.5) return 3;
  if (score>=2) return 2;
  return 1;
}

// ── Taste signature: a phrase + fingerprint from your favorite wines ──
const AX = ['body','acidity','tannin','fruit','oak'];
export function tasteSignature(wines){
  const buys = wines.filter(w=>w.verdict==='buy' && w.flavor);
  const rated = wines.filter(w=>w.verdict!=='totry' && w.flavor);
  const pool = buys.length>=2 ? buys : (rated.length ? rated : wines.filter(w=>w.flavor));
  if (!pool.length) return null;

  const axes = {}; AX.forEach(k=> axes[k] = pool.reduce((s,w)=>s+(w.flavor[k]||0),0)/pool.length);
  const reds = pool.filter(w=>/red/i.test(w.type)).length;
  const whites = pool.filter(w=>/white|ros/i.test(w.type)).length;
  const noun = reds>=whites*2 ? 'reds' : whites>reds ? 'whites' : 'wines';

  const adj = [];
  if (axes.acidity>=3.3) adj.push('bright');
  if (axes.body>=3.8) adj.push('bold');
  else if (axes.body<=2.2 && noun!=='reds') adj.push('light');
  if (axes.tannin>=3.3) adj.push('structured');
  else if (axes.tannin<=2 && axes.fruit>=3.3) adj.push('juicy');
  if (axes.oak<=1.6 && !adj.includes('bold')) adj.push('savory');
  if (noun==='whites' && !adj.includes('bright')) adj.unshift('crisp');
  const picked = adj.slice(0,2);
  const phrase = picked.length
    ? picked.map((a,i)=> i===0 ? a[0].toUpperCase()+a.slice(1) : a).join(', ') + ' ' + noun
    : 'A taste of your own';

  // top grapes among the pool
  const gc = {}; pool.forEach(w=>{ if(w.grape) gc[w.grape]=(gc[w.grape]||0)+1; });
  const grapes = Object.entries(gc).sort((a,b)=>b[1]-a[1]).map(([g])=>g.split('·')[0].split('blend')[0].trim()).slice(0,3);
  const sub = grapes.length
    ? 'You keep coming back to ' + grapes.slice(0,3).reduce((acc,g,i,a)=> acc + (i===0?'':(i===a.length-1?' & ':', ')) + g, '') + '.'
    : 'Rate a few more wines and your signature sharpens.';

  const traits = []; // tags used to match Explore Next
  if (axes.acidity>=3.3) traits.push('high-acid');
  if (axes.tannin>=3.3) traits.push('structured');
  if (axes.body>=3.8) traits.push('bold');
  if (axes.tannin<=2.2) traits.push('light');
  if (noun==='whites') traits.push('white');
  return { phrase, sub, axes, grapes, traits, count: pool.length };
}

// ── Explore next: curated regions whose style matches you, that you own zero of ──
const EXPLORE_CANDIDATES = [
  { label:'Etna', country:'Italy', center:[37.75,15.0], atlasKey:'etna',
    why:'Nerello drinks like your beloved Nebbiolo or Pinot — high-acid, savory, red cherry.',
    grapes:['nebbiolo','pinot','gamay','sangiovese'], traits:['high-acid','structured','light'] },
  { label:'Jura', country:'France', center:[46.9,5.75], atlasKey:'jura',
    why:'Mineral, nervy whites that take Loire freshness further.',
    grapes:['chardonnay','chenin','savagnin','sauvignon'], traits:['high-acid','white'] },
  { label:'Mosel', country:'Germany', center:[49.9,7.0], atlasKey:'germany',
    why:'Featherlight, electric Riesling for anyone who loves bright whites.',
    grapes:['riesling','chenin'], traits:['high-acid','white','light'] },
  { label:'Valtellina', country:'Italy', center:[46.17,9.87], atlasKey:'valtellina',
    why:'Alpine Nebbiolo — lighter, floral, and even higher-acid than Barolo.',
    grapes:['nebbiolo'], traits:['high-acid','structured','light'] },
  { label:'Northern Rhône', country:'France', center:[45.07,4.83], atlasKey:'n-rhone',
    why:'Peppery, savory Syrah for a structured-red lover ready to go darker.',
    grapes:['syrah','nebbiolo','cabernet'], traits:['structured','bold'] },
  { label:'Cahors', country:'France', center:[44.45,1.44], atlasKey:'cahors',
    why:'Malbec’s old-world home — darker and more savory than Mendoza.',
    grapes:['malbec'], traits:['bold','structured'] },
  { label:'Douro', country:'Portugal', center:[41.2,-7.8], atlasKey:'douro',
    why:'Structured field-blend reds with real grip and a great-value streak.',
    grapes:['tempranillo','touriga','malbec'], traits:['bold','structured'] },
  { label:'Santorini', country:'Greece', center:[36.4,25.43], atlasKey:'santorini',
    why:'Volcanic, saline Assyrtiko — racing acidity for a white lover.',
    grapes:['assyrtiko','sauvignon','chenin'], traits:['high-acid','white'] },
];

export function exploreNext(wines, signature, limit=2){
  const owned = new Set(groupByRegion(wines).map(g=>g.label.toLowerCase()));
  const sig = signature || tasteSignature(wines) || { grapes:[], traits:[] };
  const userGrapes = (sig.grapes||[]).map(g=>g.toLowerCase());
  const userTraits = new Set(sig.traits||[]);
  const scored = EXPLORE_CANDIDATES
    .filter(c=> !owned.has(c.label.toLowerCase()))
    .map(c=>{
      let s = 0;
      c.grapes.forEach(g=>{ if (userGrapes.some(ug=>ug.includes(g)||g.includes(ug))) s+=2; });
      c.traits.forEach(t=>{ if (userTraits.has(t)) s+=1; });
      return { ...c, _s:s };
    })
    .sort((a,b)=> b._s-a._s);
  // keep matches if any score; otherwise fall back to the top curated picks
  const matched = scored.filter(c=>c._s>0);
  return (matched.length ? matched : scored).slice(0, limit);
}

export { REGION_ATLAS };
