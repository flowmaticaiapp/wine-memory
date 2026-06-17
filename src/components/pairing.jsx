// pairing.jsx — teaching sommelier: Food → Style → Region → Bottle.
// Layer 1: human-friendly style + why + regional deep-dive (educational).
// Layer 2: the bottles you already own that match that style.
// Real intelligence via the `sommelier` Supabase Edge Function (Claude). The
// model classifies pairing vs. general questions; heuristic pairing fallback offline.
// Ported from app/pairing.jsx.
import React from 'react';
import { T, styleLabel } from '../lib/data.js';
import { Icon, VerdictBadge } from './ui.jsx';
import { BottlePhoto, typeHue } from './bottle.jsx';
import { Spinner } from './add.jsx';
import { V_STATUS } from '../lib/constants.js';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';
import { track } from '../lib/analytics.js';

const { useState: pUS, useEffect: pUE, useRef: pUR } = React;

const EXAMPLES = [
  'What should I drink with pesto pasta?',
  'Best Pinot Noir under $25',
  'Explain Chenin Blanc',
  'Barolo vs Barbaresco?',
  'Similar to Oregon Pinot Noir',
  'What should I bring to a dinner party?',
];

// ── teaching rules (offline + structure the AI mirrors) ──
const DISH_RULES = [
  { re:/pesto|basil|herb|chimichurri.*(?!steak)/i, dish:'pesto pasta',
    primary:{ grape:'Pinot Noir', why:'A great lighter-bodied red — its bright acidity complements basil and garlic, and it sits more gracefully with pasta than a heavy red would.', deeperTitle:'Oregon Pinot Noir', deeper:'Focus on the Willamette Valley, Oregon. Those Pinots show vibrant cherry fruit, freshness, and a little earthiness that pair beautifully with herb-driven dishes.', matchGrapes:['Pinot Noir'] },
    others:[ {grape:'Vermentino', why:'Citrusy and herbal — a natural match for pesto.'}, {grape:'Sauvignon Blanc', why:'High acidity and green, herbal notes mirror the basil.'} ], avoid:['Cabernet','Malbec','Zinfandel','Syrah'] },

  { re:/cream|shellfish|scallop|lobster|crab|prawn|shrimp|clam|alfredo/i, dish:'creamy shellfish',
    primary:{ grape:'Pinot Noir', why:'Light-bodied with enough acidity to cut the cream, and soft tannins that won’t bully delicate shellfish.', deeperTitle:'Burgundy or Oregon Pinot Noir', deeper:'Look to red Burgundy or the Willamette Valley — silky, high-acid, low-oak styles that flatter cream sauces without overpowering the seafood.', matchGrapes:['Pinot Noir'] },
    others:[ {grape:'Unoaked Chardonnay', why:'Chablis-style whites bring acidity and minerality without heavy oak.'}, {grape:'Champagne', why:'Bubbles and acidity refresh the palate between rich bites.'} ], avoid:['Cabernet','Malbec','Zinfandel','Syrah','Nebbiolo'] },

  { re:/vegetable|veggie|\bgarden\b|ratatouille|eggplant|aubergine|zucchini|courgette|asparagus|\bsalad\b|roasted veg|grilled veg/i, dish:'garden vegetables',
    primary:{ grape:'Gamay', why:'Garden vegetables are fresh, green and delicate, so they want a light, high-acid wine that lifts the produce rather than burying it.', deeperTitle:'Beaujolais Gamay', deeper:'Beaujolais (Gamay) is bright, floral and low in tannin — it flatters herbs and seasonal vegetables. A crisp Sauvignon Blanc or dry rosé works just as well.', matchGrapes:['Gamay','Pinot Noir','Frappato','Sauvignon Blanc'] },
    others:[ {grape:'Sauvignon Blanc', why:'Green, herbal notes mirror fresh garden vegetables.'}, {grape:'Dry Rosé', why:'Fresh and versatile with herbs and seasonal produce.'} ], avoid:['Cabernet','Malbec','Zinfandel','Nebbiolo'] },

  { re:/ribeye|steak|\bbeef\b|braise|short rib|lamb|brisket|grilled meat/i, dish:'grilled red meat',
    primary:{ grape:'Malbec', why:'Bold, dark-fruited and structured — firm tannins grip the fat and char of grilled red meat.', deeperTitle:'Mendoza Malbec', deeper:'Argentine Malbec from Mendoza delivers plush black fruit and velvety tannin built for steak; Patagonia versions add a little freshness for herby sauces like chimichurri.', matchGrapes:['Malbec','Cabernet','Syrah','Nebbiolo'] },
    others:[ {grape:'Cabernet Sauvignon', why:'The steakhouse classic — cassis and grippy tannin.'}, {grape:'Syrah', why:'Peppery and savory, great with a charred, herby crust.'} ], avoid:[] },

  { re:/roast chicken|\bchicken\b|turkey|\bpork\b|poultry/i, dish:'roast chicken',
    primary:{ grape:'Pinot Noir', why:'Light, savory and bright — it flatters roast poultry without steamrolling it.', deeperTitle:'Beaujolais Gamay', deeper:'For joy and value, look to Beaujolais (the grape is Gamay): juicy, floral, low-tannin reds that are endlessly friendly with roast chicken.', matchGrapes:['Pinot Noir','Gamay'] },
    others:[ {grape:'Chardonnay', why:'A rounder white echoes roasted, buttery skin.'}, {grape:'Gamay', why:'Bright and low-tannin — wonderfully food-friendly.'} ], avoid:['Cabernet'] },

  { re:/spicy|thai|curry|szechuan|sichuan|korean|gochujang|chili|chilli|indian/i, dish:'spicy food',
    primary:{ grape:'Riesling', why:'A touch of sweetness and racy acidity tame chili heat while lifting aromatic spice.', deeperTitle:'Off-dry Mosel Riesling', deeper:'German Mosel Riesling (look for “Kabinett”) balances gentle sweetness with bright acidity — ideal for Thai and Sichuan heat.', matchGrapes:['Riesling','Chenin','Gew'] },
    others:[ {grape:'Gewürztraminer', why:'Floral and slightly sweet — a curry classic.'}, {grape:'Grüner Veltliner', why:'Peppery and crisp; handles spice and herbs.'} ], avoid:['Cabernet','Malbec','Nebbiolo','Zinfandel'] },

  { re:/mushroom|truffle|umami|porcini|risotto/i, dish:'mushroom pasta',
    primary:{ grape:'Pinot Noir', why:'Earthy and savory — it echoes umami mushroom flavors instead of fighting them.', deeperTitle:'Burgundy or Barolo', deeper:'Red Burgundy (Pinot Noir) or Nebbiolo from Barolo/Barbaresco bring forest-floor and truffle notes that sing with mushrooms.', matchGrapes:['Pinot Noir','Nebbiolo','Gamay'] },
    others:[ {grape:'Nebbiolo', why:'Tar, rose and dried herbs — magic with mushrooms.'}, {grape:'Gamay', why:'Lighter, earthy and bright.'} ], avoid:['Zinfandel'] },

  { re:/pizza|marinara|tomato|red sauce|lasagna|bolognese|\bpasta\b/i, dish:'pizza & red sauce',
    primary:{ grape:'Sangiovese', why:'High acidity matches the tomato’s tang and savory herbs, with enough grip for cheese and cured meats.', deeperTitle:'Chianti (Tuscany)', deeper:'Tuscan Sangiovese — Chianti Classico — is the classic red-sauce wine: tart cherry, herbs and mouth-watering acidity.', matchGrapes:['Sangiovese','Nero','Frappato','Barbera','Montepulciano','Gamay'] },
    others:[ {grape:'Barbera', why:'Juicy, low-tannin and high-acid — pizza’s best friend.'}, {grape:'Frappato', why:'Light, floral Sicilian red; chill it slightly.'} ], avoid:[] },

  { re:/oyster|sushi|raw fish|ceviche|crudo|white fish|sole|branzino|seafood|fish/i, dish:'seafood',
    primary:{ grape:'Sauvignon Blanc', why:'Crisp, zesty and mineral — it lifts delicate seafood without weighing it down.', deeperTitle:'Loire Sauvignon Blanc', deeper:'Sancerre and Pouilly-Fumé from the Loire are flinty, citrusy whites built for oysters and raw fish.', matchGrapes:['Sauvignon Blanc','Chenin','Chardonnay','Riesling','Vermentino'] },
    others:[ {grape:'Muscadet', why:'Briny and lean — the oyster wine.'}, {grape:'Albariño', why:'Saline and citrusy; perfect with shellfish.'} ], avoid:['Cabernet','Malbec','Zinfandel'] },

  { re:/cheese|charcuterie|cured|salami|prosciutto|board/i, dish:'a cheese board',
    primary:{ grape:'Nebbiolo', why:'Firm acidity and tannin cut through salty, fatty cheese and cured meats.', deeperTitle:'Barolo / Barbaresco', deeper:'Piedmont Nebbiolo offers structure and savory depth that stands up to a loaded board.', matchGrapes:['Nebbiolo','Gamay','Syrah','Sangiovese'] },
    others:[ {grape:'Gamay', why:'Bright and juicy — great with softer cheeses.'}, {grape:'Syrah', why:'Smoky and savory for cured meats.'} ], avoid:[] },
];
const DEFAULT_RULE = { dish:'this meal',
  primary:{ grape:'Pinot Noir', why:'A versatile, food-friendly red — light enough for most dishes, with acidity that keeps things fresh.', deeperTitle:'Cool-climate Pinot Noir', deeper:'Oregon or Burgundy Pinot Noir is a safe, food-loving choice across a wide range of meals.', matchGrapes:['Pinot Noir','Gamay'] },
  others:[ {grape:'Dry Rosé', why:'Crowd-pleasing and flexible across many foods.'}, {grape:'Sauvignon Blanc', why:'Crisp and bright for lighter plates.'} ], avoid:[] };

function priceLimit(q){ const m=q.match(/under\s*\$?(\d+)|below\s*\$?(\d+)|\$(\d+)\s*or less/i); if(!m) return null; return parseInt(m[1]||m[2]||m[3]); }
const isPairingQuery = (q)=> /\bpair|with|eat|dinner|drink|food|night|meal|\?|\bfor\b/i.test(q) || DISH_RULES.some(r=>r.re.test(q));

function heuristicPairing(query){
  const rule = DISH_RULES.find(r=>r.re.test(query)) || DEFAULT_RULE;
  return { dish:rule.dish, primary:rule.primary, others:rule.others, limit:priceLimit(query), avoid:rule.avoid||[] };
}

// Build the personalization payload the sommelier function expects.
function collectionSummary(wines){
  const owned = wines.map(w=>({ grape:w.grape||'', region:(w.region||'')+(w.country?', '+w.country:''), verdict:w.verdict }));
  const gc={}; wines.forEach(w=>{ if(w.grape) gc[w.grape]=(gc[w.grape]||0)+1; });
  const ownedGrapes = Object.entries(gc).map(([g,n])=>g+' ('+n+')').join(', ') || 'none yet';
  return { owned, ownedGrapes };
}

// Ask the real sommelier (Supabase Edge Function → Claude). The model classifies
// the question; returns { kind:'pairing', dish, primary, others } or { kind:'answer', text }.
async function askSommelier(query, wines){
  const { owned, ownedGrapes } = collectionSummary(wines);
  return await invokeAI('sommelier', { query, owned, ownedGrapes });
}

function ownedMatches(result, wines){
  const grapes = [ ...(result.primary.matchGrapes||[result.primary.grape]), ...((result.others||[]).map(o=>o.grape)) ];
  const mg = grapes.map(g=>(g||'').toLowerCase().split(' ')[0]).filter(Boolean);
  const avoid = (result.avoid||[]).map(a=>a.toLowerCase());
  let pool = wines.filter(w=>{ const hay=((w.grape||'')+' '+w.name).toLowerCase();
    return mg.some(g=>hay.includes(g)) && !avoid.some(a=>hay.includes(a)); });
  if (result.limit!=null) pool = pool.filter(w=> w.price==null || w.price<=result.limit);
  const ord = { buy:0, totry:1, maybe:2, no:3 };
  return pool.sort((a,b)=> (ord[a.verdict]-ord[b.verdict])).slice(0,6);
}
function learnInsight(wines){
  const buys = wines.filter(w=>w.verdict==='buy' && w.grape);
  const tally = {}; buys.forEach(w=>{ tally[w.grape]=(tally[w.grape]||0)+1; });
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
  return (top && top[1]>=2) ? top[0] : null;
}

// ── UI pieces ──
function OwnedRow({ w, onOpen }){
  return (
    <button onClick={()=>onOpen(w.id)} style={{ width:'100%', textAlign:'left', display:'flex', gap:12, alignItems:'center', padding:'11px 12px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:13, cursor:'pointer', marginBottom:9 }}>
      <BottlePhoto wine={w} w={50} h={62} rounded={9}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.maybe, letterSpacing:0.25, textTransform:'uppercase' }}>{styleLabel(w)}</div>
        <div style={{ fontSize:14.5, fontWeight:670, color:T.ink, letterSpacing:-0.2, lineHeight:1.2, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.name} <span style={{ color:T.ink3, fontWeight:500 }}>{w.vintage}</span></div>
        <div style={{ fontSize:12, color:T.ink3, marginTop:2 }}>{w.region}{w.country?', '+w.country:''}</div>
      </div>
      <div style={{ flexShrink:0 }}><VerdictBadge id={w.verdict} variant="expressive" size="sm"/></div>
    </button>
  );
}
function StyleNote({ grape, why }){
  return (
    <div style={{ padding:'13px 0', borderTop:`1px solid ${T.line}` }}>
      <div style={{ fontSize:15, fontWeight:700, color:T.ink, letterSpacing:-0.2 }}>{grape}</div>
      <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:3 }}>{why}</div>
    </div>
  );
}

function AnswerText({ text }){
  const lines = (text||'').split('\n').map(l=>l.trim()).filter(Boolean);
  return <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
    {lines.map((l,i)=>{ const bullet=/^[-•*]\s+/.test(l); return (
      <div key={i} style={{ display:'flex', gap:9, fontSize:15, color:T.ink, lineHeight:1.55 }}>
        {bullet && <span style={{ color:T.maybe, flex:'none' }}>•</span>}
        <span>{l.replace(/^[-•*]\s+/,'')}</span>
      </div> ); })}
  </div>;
}
function PairingSearch({ wines, onClose, onOpen, initialQuery, onSavePairing }){
  const [q, setQ] = pUS('');
  const [phase, setPhase] = pUS('idle');   // idle | thinking | pairing | search
  const [data, setData] = pUS(null);
  const [asked, setAsked] = pUS('');
  const [saved, setSaved] = pUS(false);
  const didInit = pUR(false);

  const run = async (query)=>{
    const Q = (query!=null?query:q).trim(); if(!Q) return;
    setAsked(Q); setQ(Q); setPhase('thinking'); track('sommelier_question');
    try {
      if (!supabase) throw new Error('not configured');
      const r = await askSommelier(Q, wines);   // model classifies pairing vs. answer
      if (r && r.kind==='pairing' && r.primary){
        const out = { dish:r.dish||Q, primary:r.primary, others:r.others||[], avoid:[], limit:priceLimit(Q) };
        setData({ mode:'pairing', ...out, owned:ownedMatches(out, wines) });
        setPhase('pairing');
      } else if (r && r.kind==='answer' && (r.text||'').trim()){
        setData({ mode:'answer', text:r.text.trim() });
        setPhase('answer');
      } else {
        throw new Error('empty sommelier result');
      }
    } catch(e){
      console.error('sommelier failed', e);
      // Graceful offline fallback: pairing questions still get a useful answer.
      if (isPairingQuery(Q)){
        const out = heuristicPairing(Q);
        setData({ mode:'pairing', ...out, owned:ownedMatches(out, wines) });
        setPhase('pairing');
      } else {
        setData({ mode:'answer', text:'Sorry — I couldn’t reach the sommelier just now. Please try again in a moment.' });
        setPhase('answer');
      }
    }
  };
  pUE(()=>{ setSaved(false); }, [asked]);
  pUE(()=>{ if(initialQuery && !didInit.current){ didInit.current=true; run(initialQuery); } }, [initialQuery]);

  const savePairing = ()=>{
    if (!data || data.mode!=='pairing' || !onSavePairing) return;
    const top = data.owned && data.owned[0];
    onSavePairing({ dish:data.dish, style:(data.primary.deeperTitle||data.primary.grape), why:data.primary.why,
      related_saved_wine_id: top?top.id:null, type: top?top.type:'Red' });
    setSaved(true);
  };

  const insightGrape = data && data.mode==='pairing' ? learnInsight(wines) : null;

  return (
    <div style={{ position:'absolute', inset:0, zIndex:75, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ paddingTop:V_STATUS, borderBottom:`1px solid ${T.line}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px 12px' }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:9, background:T.raised, border:`1.5px solid ${q?T.ink:T.line}`, borderRadius:12, padding:'0 12px', height:46 }}>
            <Icon name="sparkle" size={17} color={T.maybe}/>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') run(); }} placeholder="Ask your sommelier…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontFamily:'var(--sans)', fontSize:15.5, color:T.ink }}/>
            {q && <button onClick={()=>{ setQ(''); setPhase('idle'); }} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex' }}><Icon name="x" size={16} color={T.ink3}/></button>}
          </div>
          {q.trim() && q.trim() !== asked
            ? <button onClick={()=>run()} style={{ background:'none', border:'none', cursor:'pointer', color:T.ink, fontFamily:'var(--sans)', fontSize:15, fontWeight:700 }}>Ask</button>
            : <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:T.ink, fontFamily:'var(--sans)', fontSize:15, fontWeight:600 }}>Done</button>}
        </div>
      </div>

      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'16px 16px 40px' }}>
        {phase==='idle' && <>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, marginBottom:12, textTransform:'uppercase' }}>Ask your sommelier</div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {EXAMPLES.map(ex=>(
              <button key={ex} onClick={()=>run(ex)} style={{ display:'flex', alignItems:'center', gap:11, textAlign:'left', padding:'13px 14px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:12, cursor:'pointer' }}>
                <Icon name="glass" size={17} color={T.maybe}/>
                <span style={{ flex:1, fontSize:14.5, color:T.ink, fontWeight:540 }}>{ex}</span>
                <Icon name="arrow" size={16} color={T.ink3}/>
              </button>
            ))}
          </div>
          <div style={{ marginTop:18, fontSize:12.5, color:T.ink4, lineHeight:1.5, display:'flex', gap:8 }}><Icon name="sparkle" size={14} color={T.ink4}/> Each answer explains the style and region, then shows the bottles you already own that fit.</div>
        </>}

        {phase==='thinking' && <div style={{ paddingTop:60, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <Spinner size={40} stroke={3}/>
          <div style={{ fontSize:15.5, fontWeight:680, marginTop:18 }}>Thinking it through…</div>
          <div style={{ fontSize:13, color:T.ink3, marginTop:5, textAlign:'center', maxWidth:'30ch' }}>Finding the best wine for “{asked}”.</div>
        </div>}

        {phase==='answer' && data && <>
          <div style={{ fontSize:13, color:T.ink3, marginBottom:14 }}>You asked <span style={{ color:T.ink, fontWeight:620 }}>“{asked}”</span></div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
            <span style={{ width:30, height:30, borderRadius:99, background:T.maybeBg, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkle" size={16} color={T.maybe}/></span>
            <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase' }}>Your sommelier</span>
          </div>
          <AnswerText text={data.text}/>
          <button onClick={()=>{ setPhase('idle'); setQ(''); }} style={{ width:'100%', marginTop:22, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>Ask something else</button>
        </>}

        {phase==='search' && data && <>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, marginBottom:12, textTransform:'uppercase' }}>In your collection</div>
          {data.wines.map(w=> <OwnedRow key={w.id} w={w} onOpen={onOpen}/>)}
          {!data.wines.length && <div style={{ color:T.ink3, fontSize:14 }}>No bottles match that search.</div>}
        </>}

        {phase==='pairing' && data && <>
          <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase' }}>For {data.dish}</div>
          {/* Layer 1 — the style */}
          <div style={{ marginTop:8 }}>
            <div style={{ fontSize:26, fontWeight:780, letterSpacing:-0.7, color:T.ink }}>{data.primary.grape}</div>
            <div style={{ fontSize:15, color:T.ink2, lineHeight:1.55, marginTop:7 }}>{data.primary.why}</div>
          </div>
          {/* deeper dive */}
          {data.primary.deeper && <div style={{ marginTop:15, padding:'15px 16px', background:`hsl(${typeHue(data.owned&&data.owned[0]?data.owned[0].type:'Red')} 30% 97%)`, border:`1px solid ${T.line}`, borderRadius:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:0.4, textTransform:'uppercase' }}><Icon name="sparkle" size={13} color={T.maybe}/> Want to explore deeper?</div>
            <div style={{ fontSize:16, fontWeight:720, color:T.ink, letterSpacing:-0.3, marginTop:7 }}>{data.primary.deeperTitle}</div>
            <div style={{ fontSize:14, color:T.ink2, lineHeight:1.55, marginTop:5 }}>{data.primary.deeper}</div>
          </div>}

          {/* Layer 2 — your bottles */}
          <div style={{ marginTop:26 }}>
            <div style={{ fontSize:17, fontWeight:740, letterSpacing:-0.4, marginBottom:12 }}>From your collection</div>
            {data.owned.length
              ? data.owned.map(w=> <OwnedRow key={w.id} w={w} onOpen={onOpen}/>)
              : <div style={{ padding:'16px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>You don’t own a {data.primary.grape} yet. Next time you’re shopping, that’s the style to look for — or paste an order to add one.</div>}
          </div>

          {/* other styles */}
          {data.others && data.others.length>0 && <div style={{ marginTop:26 }}>
            <div style={{ fontSize:17, fontWeight:740, letterSpacing:-0.4, marginBottom:4 }}>Other styles that work</div>
            {data.others.map((o,i)=> <StyleNote key={i} grape={o.grape} why={o.why}/>)}
          </div>}

          {/* learning */}
          {insightGrape && <div style={{ marginTop:22, display:'flex', gap:10, padding:'13px 14px', background:T.buyBg, borderRadius:12 }}>
            <Icon name="sparkle" size={16} color={T.buy}/>
            <span style={{ fontSize:13, color:T.buy, lineHeight:1.45, fontWeight:560 }}>We’re learning your taste: you mark <b>{insightGrape}</b> “Buy Again” most often.</span>
          </div>}

          {/* save pairing */}
          {onSavePairing && <button onClick={savePairing} disabled={saved} style={{ width:'100%', marginTop:20, padding:'15px', borderRadius:13, border:'none', cursor:saved?'default':'pointer',
            background:saved?T.buyBg:T.ink, color:saved?T.buy:'#fff', fontFamily:'var(--sans)', fontSize:15, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Icon name={saved?'check':'heart'} size={18} color={saved?T.buy:'#fff'} stroke={saved?3:1.8}/>{saved?'Saved to My Palate':'Save this pairing'}</button>}

          <button onClick={()=>{ setPhase('idle'); setQ(''); }} style={{ width:'100%', marginTop:10, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>Ask something else</button>
        </>}
      </div>
    </div>
  );
}

export { PairingSearch, DISH_RULES, DEFAULT_RULE, heuristicPairing };
