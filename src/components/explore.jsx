// explore.jsx — Explore a Region: search + featured regions, learn what grows there,
// ask the sommelier, and see what you own. Reuses the sommelier Edge Function via onAsk.
import React from 'react';
import { T, styleLabel } from '../lib/data.js';
import { Icon, VerdictBadge, typeColor } from './ui.jsx';
import { BottlePhoto } from './bottle.jsx';
import { V_STATUS, V_NAV } from '../lib/constants.js';

const { useState: eUS } = React;

// Curated featured regions (US-focused). Order matters — shown as wrapped pills.
const FEATURED = ['Beaujolais','Burgundy','Loire','Piedmont','Tuscany','Napa Valley','Oregon','Mendoza'];

const REGIONS = {
  'Beaujolais':{ country:'France', grapes:['Gamay'], keys:['beaujolais','morgon','fleurie','brouilly'],
    taste:'Granite hills just south of Burgundy. Gamay here is juicy, floral and low-tannin — joyful, chillable reds that go with almost anything.',
    pairs:['Charcuterie','Roast chicken','Picnic spreads','Thanksgiving dinner'],
    prompts:['Is Gamay the only grape grown in Beaujolais?','What is a Cru Beaujolais?','What should I buy next if I like Beaujolais?'] },
  'Burgundy': { country:'France', grapes:['Pinot Noir','Chardonnay'], keys:['burgundy','bourgogne','côte'],
    taste:'The world’s benchmark for Pinot Noir and Chardonnay. Precise, earthy, and age-worthy — wines that trade power for detail and a sense of place.',
    pairs:['Roast chicken','Mushrooms','Soft cheese','Salmon'],
    prompts:['Why is Burgundy so expensive?','What’s the difference between a Village and a Premier Cru?','Where should I look for affordable Burgundy?'] },
  'Loire':    { country:'France', grapes:['Chenin Blanc','Sauvignon Blanc','Cabernet Franc','Melon de Bourgogne'], keys:['loire','montlouis','vouvray','sancerre','muscadet'],
    taste:'A long, cool river valley making some of France’s most refreshing wines — crisp, mineral whites (Chenin, Sauvignon) and bright, leafy reds (Cabernet Franc).',
    pairs:['Goat cheese','Shellfish','Pork','Fresh salads'],
    prompts:['What grapes is the Loire known for?','What exactly is Sancerre?','What’s a good Loire wine for oysters?'] },
  'Piedmont': { country:'Italy', grapes:['Nebbiolo','Barbera','Dolcetto'], keys:['piedmont','piemonte','barolo','barbaresco'],
    taste:'Foggy hills in Italy’s northwest. Nebbiolo (Barolo, Barbaresco) is pale but powerful — tar, roses, and firm tannin that rewards patience.',
    pairs:['Braised beef','Mushroom risotto','Truffle dishes','Aged cheese'],
    prompts:['What’s the difference between Barolo and Barbaresco?','Why does Nebbiolo need aging?','What should I buy if I like Piedmont reds?'] },
  'Tuscany':  { country:'Italy', grapes:['Sangiovese'], keys:['tuscany','toscana','chianti','montepulciano','brunello'],
    taste:'Sun-baked hills of central Italy. Sangiovese gives tart-cherry fruit, dried herbs, and a savory, mouth-watering grip — built for the table (Chianti, Brunello).',
    pairs:['Pizza','Pasta with red sauce','Cured meats','Grilled vegetables'],
    prompts:['What’s the difference between Chianti and Brunello?','What is a Super Tuscan?','What food pairs best with Sangiovese?'] },
  'Napa Valley':{ country:'USA', grapes:['Cabernet Sauvignon','Chardonnay','Merlot'], keys:['napa','oakville','rutherford','stags leap'],
    taste:'California’s most famous valley. Warm days and cool nights give rich, ripe Cabernet Sauvignon — bold black fruit, polished tannin, and generous oak.',
    pairs:['Ribeye','Lamb','Burgers','Aged hard cheese'],
    prompts:['Why is Napa Cabernet so prized?','What’s the difference between Napa and Sonoma?','What should I buy if I like Napa Cabernet?'] },
  'Oregon':   { country:'USA', grapes:['Pinot Noir','Chardonnay','Pinot Gris'], keys:['willamette','oregon'],
    taste:'Cool, rainy and green — Oregon makes high-acid Pinot Noir full of red-cherry fruit, freshness, and an earthy, forest-floor edge. Think elegance over power.',
    pairs:['Roast chicken','Salmon','Mushroom dishes','Duck'],
    prompts:['Why is Oregon known for Pinot Noir?','What is the Willamette Valley?','How does Oregon Pinot differ from Burgundy?'] },
  'Mendoza':  { country:'Argentina', grapes:['Malbec','Cabernet Sauvignon'], keys:['mendoza'],
    taste:'High-altitude desert at the foot of the Andes. Malbec here is plush and dark-fruited with velvety tannins and a violet lift — bold but smooth.',
    pairs:['Steak','Grilled red meat','Burgers','Hard cheese'],
    prompts:['Why does Malbec grow so well in Mendoza?','What does high altitude do to the wine?','What should I buy if I like Malbec?'] },
};

function ExploreScreen({ region, wines, onOpenWine, onPick, onAsk }){
  const [query, setQuery] = eUS('');
  const r = REGIONS[region] || REGIONS[FEATURED[0]];
  const name = REGIONS[region] ? region : FEATURED[0];

  const q = query.trim().toLowerCase();
  const featured = !q ? FEATURED : FEATURED.filter(nm=>{
    const reg = REGIONS[nm];
    return nm.toLowerCase().includes(q) || reg.country.toLowerCase().includes(q) || reg.grapes.some(g=>g.toLowerCase().includes(q));
  });

  const owned = wines.filter(w=>{ const hay=((w.region||'')+' '+(w.country||'')).toLowerCase(); return r.keys.some(k=>hay.includes(k)) || (w.country===r.country && r.grapes.some(g=>(w.grape||'').toLowerCase().includes(g.toLowerCase().split(' ')[0]))); });
  const accent = typeColor(r.grapes[0].match(/blanc|chardonnay|gris|chenin|sauvignon|melon/i)?'White':'Red');

  return (
    <div style={{ height:'100%', overflowX:'hidden', overflowY:'auto', background:'#fff' }}>
      <div style={{ paddingTop:V_STATUS }}/>
      <div style={{ padding:'8px 20px 0' }}>
        <h1 style={{ margin:0, fontSize:27, fontWeight:780, letterSpacing:-0.9 }}>Explore</h1>
        <p style={{ margin:'6px 0 0', fontSize:14, color:T.ink3, lineHeight:1.5 }}>Regions, grapes, and what you own from each.</p>
      </div>
      <div style={{ padding:'16px 20px 0', paddingBottom:V_NAV+96 }}>

        {/* search */}
        <div style={{ position:'relative', marginBottom:18 }}>
          <span style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', display:'flex' }}><Icon name="search" size={17} color={T.ink3}/></span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search regions, grapes, countries…"
            style={{ width:'100%', boxSizing:'border-box', height:46, border:`1px solid ${T.line2}`, borderRadius:12, padding:'0 13px 0 39px', fontFamily:'var(--sans)', fontSize:16, color:T.ink, outline:'none', background:T.raised }}/>
        </div>

        {/* featured regions — wrapped pills */}
        <Lbl3>Featured regions</Lbl3>
        {featured.length ? (
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {featured.map(nm=>{ const on=nm===name; return (
              <button key={nm} onClick={()=>onPick(nm)} style={{ padding:'7px 14px', borderRadius:99, cursor:'pointer', background:on?T.ink:'#fff', border:`1px solid ${on?T.ink:T.line2}`, color:on?'#fff':T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:on?660:540 }}>{nm}</button> ); })}
          </div>
        ) : (
          <div style={{ padding:'15px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas }}>
            <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginBottom:10 }}>No featured region matches “{query.trim()}” yet — more regions are coming. For now, ask your sommelier.</div>
            <button onClick={()=>onAsk(`Tell me about ${query.trim()} wine`)} style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, cursor:'pointer' }}><Icon name="sparkle" size={15} color={T.maybe}/> Ask about “{query.trim()}”</button>
          </div>
        )}

        {/* selected region */}
        <div style={{ borderTop:`1px solid ${T.line}`, marginTop:22, paddingTop:20 }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase' }}>{r.country}</div>
          <h1 style={{ margin:'4px 0 0', fontSize:32, fontWeight:800, letterSpacing:-1 }}>{name}</h1>

          {/* what grows */}
          <div style={{ marginTop:18 }}>
            <Lbl3>What grows here</Lbl3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {r.grapes.map(g=> <span key={g} style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 13px', borderRadius:10, background:T.canvas, border:`1px solid ${T.line}`, fontSize:13.5, fontWeight:600, color:T.ink }}><span style={{ width:8, height:8, borderRadius:99, background:accent }}/>{g}</span>)}
            </div>
          </div>

          {/* what it tastes like */}
          <div style={{ marginTop:24 }}>
            <Lbl3>What it tastes like</Lbl3>
            <p style={{ margin:0, fontSize:15.5, color:T.ink, lineHeight:1.6 }}>{r.taste}</p>
          </div>

          {/* curious? ask your sommelier */}
          {(r.prompts||[]).length>0 && <div style={{ marginTop:24 }}>
            <Lbl3>Curious? Ask your sommelier</Lbl3>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {r.prompts.map(p=>(
                <button key={p} onClick={()=>onAsk(p)} style={{ display:'flex', alignItems:'center', gap:10, textAlign:'left', padding:'12px 13px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:13, cursor:'pointer' }}>
                  <Icon name="sparkle" size={16} color={T.maybe}/>
                  <span style={{ flex:1, fontSize:14, color:T.ink, fontWeight:540, lineHeight:1.35 }}>{p}</span>
                  <Icon name="arrow" size={15} color={T.ink3}/>
                </button>
              ))}
            </div>
          </div>}

          {/* what you own */}
          <div style={{ marginTop:26 }}>
            <Lbl3>What you own from here</Lbl3>
            {owned.length ? <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {owned.map(w=>(
                <button key={w.id} onClick={()=>onOpenWine(w.id)} style={{ width:'100%', textAlign:'left', display:'flex', gap:12, alignItems:'center', padding:'11px 12px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:13, cursor:'pointer' }}>
                  <BottlePhoto wine={w} w={46} h={58} rounded={9}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.maybe, letterSpacing:0.25, textTransform:'uppercase' }}>{styleLabel(w)}</div>
                    <div style={{ fontSize:14.5, fontWeight:670, color:T.ink, letterSpacing:-0.2, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.name} <span style={{ color:T.ink3, fontWeight:500 }}>{w.vintage}</span></div>
                    <div style={{ fontSize:12, color:T.ink3, marginTop:1 }}>{w.region}</div>
                  </div>
                  <VerdictBadge id={w.verdict} variant="expressive" size="sm"/>
                </button>
              ))}
            </div> : <div style={{ padding:'16px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Nothing from {name} yet. Now you know the grapes to look for — try a {r.grapes[0]} next time you’re shopping.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
function Lbl3({ children }){ return <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.5, textTransform:'uppercase', marginBottom:12 }}>{children}</div>; }

export { ExploreScreen, REGIONS };
