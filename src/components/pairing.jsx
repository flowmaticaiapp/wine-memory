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
import { personalWines } from '../lib/palate.js';
import { DISH_RULES, DEFAULT_RULE, priceLimit, isPairingQuery, heuristicPairing } from '../lib/pairingrules.js';
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

// Pairing guidance lives in lib/pairingrules.js as reviewed, versioned data.
// Re-exported here so existing importers of this module keep working.

// Build the personalization payload the sommelier function expects.
// Samples excluded: this payload is sent to the model AS the user's own taste,
// so a demo bottle here would put words in the user's mouth.
function collectionSummary(wines){
  const mine = personalWines(wines);
  const owned = mine.map(w=>({ grape:w.grape||'', region:(w.region||'')+(w.country?', '+w.country:''), verdict:w.verdict }));
  const gc={}; mine.forEach(w=>{ if(w.grape) gc[w.grape]=(gc[w.grape]||0)+1; });
  const ownedGrapes = Object.entries(gc).map(([g,n])=>g+' ('+n+')').join(', ') || 'none yet';
  return { owned, ownedGrapes };
}

// Ask the real sommelier (Supabase Edge Function → Claude). The model classifies
// the question; returns { kind:'pairing', dish, primary, others } or { kind:'answer', text }.
async function askSommelier(query, wines){
  const { owned, ownedGrapes } = collectionSummary(wines);
  return await invokeAI('sommelier', { query, owned, ownedGrapes });
}

// "From your cellar" must only offer a bottle that GENUINELY fits.
//
// The previous version reduced each grape to its first lowercased word and did a
// substring test, so "Pinot Noir" became "pinot" and matched a Pinot Grigio —
// a white — under a grilled-steak pairing. "Cabernet" likewise swallowed
// Cabernet Franc. Matching is now on whole words against the wine's own grape
// field first, falling back to the name only when no grape is recorded.
const wordsOf = (s)=> String(s||'').toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
function grapeFits(wine, targets){
  const hay = new Set(wordsOf(wine.grape || wine.name));
  return targets.some(t=>{
    const need = wordsOf(t);
    // Every word of the target grape must be present: "pinot noir" needs both,
    // so a Pinot Grigio no longer qualifies.
    return need.length>0 && need.every(w=>hay.has(w));
  });
}
function ownedMatches(result, wines){
  const targets = [ ...(result.primary.matchGrapes||[result.primary.grape]), ...((result.others||[]).map(o=>o.grape)) ].filter(Boolean);
  const avoid = (result.avoid||[]).filter(Boolean);
  let pool = wines.filter(w=> grapeFits(w, targets) && !grapeFits(w, avoid));
  if (result.limit!=null) pool = pool.filter(w=> w.price==null || w.price<=result.limit);
  const ord = { buy:0, totry:1, maybe:2, no:3 };
  return pool.sort((a,b)=> (ord[a.verdict]-ord[b.verdict])).slice(0,6);
}
// Powers the "We're learning your taste" banner — an explicit claim about the
// user, so samples are excluded.
function learnInsight(wines){
  const buys = personalWines(wines).filter(w=>w.verdict==='buy' && w.grape);
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
// An alternative has to say how it CHANGES the experience, not merely that it
// also works — otherwise the user has no basis for choosing between them.
function StyleNote({ grape, why, direction }){
  return (
    <div style={{ padding:'13px 0', borderTop:`1px solid ${T.line}` }}>
      {direction && <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.maybe, marginBottom:3 }}>{direction}</div>}
      <div style={{ fontSize:15, fontWeight:700, color:T.ink, letterSpacing:-0.2 }}>{grape}</div>
      <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:3 }}>{why}</div>
    </div>
  );
}

// "What to look for" is the step that turns an abstract characteristic into
// something findable on a shelf. A pairing answer that stops at "high-acid,
// savoury" has not finished the job.
function LookFor({ items }){
  const list = (items||[]).filter(Boolean); if (!list.length) return null;
  return (
    <div style={{ marginTop:22, padding:'14px 16px', background:T.canvas, border:`1px solid ${T.line}`, borderRadius:13 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.13em', textTransform:'uppercase', color:T.ink3, marginBottom:8 }}>What to look for</div>
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {list.map((t,i)=>(
          <div key={i} style={{ display:'flex', gap:9, fontSize:13.5, color:T.ink2, lineHeight:1.45 }}>
            <span style={{ flexShrink:0, width:4, height:4, borderRadius:99, background:T.ink4, marginTop:7 }}/>
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shown only when a real conflict exists — an empty "avoid" section would be
// noise, and would imply a warning where there is none.
function AvoidNote({ text }){
  if (!text) return null;
  return (
    <div style={{ marginTop:12, display:'flex', gap:9, padding:'12px 14px', background:T.noBg, borderRadius:11 }}>
      <Icon name="x" size={15} color={T.no} style={{ flexShrink:0, marginTop:2 }}/>
      <span style={{ fontSize:13, color:T.no, lineHeight:1.45 }}>{text}</span>
    </div>
  );
}

// ── Basis line ──────────────────────────────────────────────────────
// One quiet line beneath the answer, not a banner above it. Every answer
// carries one: labelling only the offline fallback would teach users that an
// unlabelled answer had been verified.
//
// `sources` is unused today and renders only when present. That is deliberate —
// when a public-web research layer is added later it attaches links here, and
// the answer experience does not need redesigning around them.
const BASIS_LABEL = {
  ai:          'General wine knowledge · not checked against a wine source',
  rule:        'General pairing guidance built into Wine Memory',
  unreachable: 'Offline · general pairing guidance',
  unusable:    'Couldn’t complete that · general pairing guidance',
};
function BasisLine({ basis, sources }){
  const label = BASIS_LABEL[basis]; if (!label) return null;
  const off = basis==='unreachable' || basis==='unusable';
  const tone = off ? T.maybe : T.ink4;
  const list = sources || [];
  return (
    <div style={{ display:'flex', flexWrap:'wrap', alignItems:'center', gap:'5px 9px',
      marginTop:18, paddingTop:11, borderTop:`1px solid ${T.line}` }}>
      <span style={{ width:5, height:5, borderRadius:99, background:tone, flexShrink:0 }}/>
      <span style={{ fontSize:11.5, lineHeight:1.4, color:tone }}>{label}</span>
      {list.map((s,i)=>(
        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:11.5, lineHeight:1.4, color:T.ink3 }}>{s.title}</a>
      ))}
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
        const out = { dish:r.dish||Q, primary:r.primary, others:r.others||[], avoid:[], avoidNote:r.avoidNote||'', limit:priceLimit(Q) };
        setData({ mode:'pairing', ...out, owned:ownedMatches(out, wines) });
        setPhase('pairing');
      } else if (r && r.kind==='answer' && (r.text||'').trim()){
        setData({ mode:'answer', text:r.text.trim(), basis:'ai' });
        setPhase('answer');
      } else {
        const err = new Error('empty sommelier result'); err.unusable = true; throw err;
      }
    } catch(e){
      console.error('sommelier failed', e);
      // Graceful fallback: pairing questions still get a useful answer. Track
      // WHY we fell back so the disclosure tells the truth — "unavailable" and
      // "answered, but unusably" are different things and the banner says which.
      if (isPairingQuery(Q)){
        const out = heuristicPairing(Q);
        setData({ mode:'pairing', ...out, owned:ownedMatches(out, wines),
          offline:true, offlineReason: e && e.unusable ? 'unusable' : 'unreachable' });
        setPhase('pairing');
      } else {
        setData({ mode:'answer', text:'Sorry — I couldn’t reach your sommelier just now. Please try again in a moment.' });
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
          <BasisLine basis={data.basis} sources={data.sources}/>
          <button onClick={()=>{ setPhase('idle'); setQ(''); }} style={{ width:'100%', marginTop:22, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>Ask something else</button>
        </>}

        {phase==='search' && data && <>
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, marginBottom:12, textTransform:'uppercase' }}>In your collection</div>
          {data.wines.map(w=> <OwnedRow key={w.id} w={w} onOpen={onOpen}/>)}
          {!data.wines.length && <div style={{ color:T.ink3, fontSize:14 }}>No bottles match that search.</div>}
        </>}

        {phase==='pairing' && data && <>
          <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase' }}>{data.matched===false ? 'A good general starting point' : 'For '+data.dish}</div>
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

          <LookFor items={data.primary.lookFor}/>
          <AvoidNote text={data.avoidNote}/>

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
            {data.others.map((o,i)=> <StyleNote key={i} grape={o.grape} why={o.why} direction={o.direction}/>)}
          </div>}

          <BasisLine basis={data.offline ? (data.offlineReason || 'unreachable') : 'ai'} sources={data.sources}/>

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
