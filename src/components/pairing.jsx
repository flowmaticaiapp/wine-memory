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
import { DISH_RULES, DEFAULT_RULE, priceLimit, isPairingQuery, heuristicPairing, pairingHeadline } from '../lib/pairingrules.js';
import { textMatchesAnyGrape } from '../lib/grapes.js';
import { readLastAnswer, writeLastAnswer } from '../lib/lastanswer.js';
import { withTimeout, instantPairing, reconcileEnrichment, enrichmentDisposition, pairingBasis } from '../lib/answerflow.js';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';
import { track } from '../lib/analytics.js';

const { useState: pUS, useEffect: pUE, useRef: pUR } = React;

// Every run gets a token from this monotonic counter. A research response may
// only touch the screen while its token is still the latest — a late response
// for a question the user has moved past can at most upgrade the cache for
// that same question. Module scope (only one PairingSearch exists at a time)
// so it also survives the component unmounting while research is in flight.
let runCounter = 0;

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

// One-detail refinements. Each appends a qualifier to the question already
// asked rather than starting over, so the original stays visible and the user
// does not retype anything in a shop aisle.
const REFINEMENTS = [
  ['Under $20', 'under $20'],
  ['Something white', 'but a white wine'],
  ['Lighter', 'but something lighter'],
  ['Less oaky', 'with little or no oak'],
  ['A bit sweeter', 'slightly sweeter'],
];

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
// Matching uses canonical grape identities (src/lib/grapes.js): Cabernet
// Sauvignon and Cabernet Franc are distinct, as are Pinot Noir and Pinot
// Grigio, while Pinot Grigio and Pinot Gris are one grape under two names.
// The wine's own grape field is preferred; its name is the fallback.
function grapeFits(wine, targets){
  return textMatchesAnyGrape(wine.grape || wine.name, targets);
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
  researched:  'Checked against public wine sources',
  no_evidence: 'Public sources checked · no specific evidence used',
  unavailable: 'Public research unavailable · general wine knowledge',
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
function PairingSearch({ wines, userId, onClose, onOpen, initialQuery, onSavePairing }){
  const [q, setQ] = pUS('');
  const [phase, setPhase] = pUS('idle');   // idle | thinking | pairing | search
  const [data, setData] = pUS(null);
  const [asked, setAsked] = pUS('');
  const [saved, setSaved] = pUS(false);
  const [showWhy, setShowWhy] = pUS(false);   // depth stays closed by default
  const didInit = pUR(false);

  // Restore the last answer. Someone standing in a shop whose phone locks, or
  // who walks into a dead spot between the door and the shelf, should not lose
  // the recommendation they came in with.
  pUE(()=>{
    if (didInit.current || initialQuery) return;
    const saved = readLastAnswer(userId);
    if (!saved) return;
    // Re-match the cellar rather than trusting the stored copy: bottles may
    // have been added, drunk or re-rated since.
    const d = saved.data;
    setData(d.mode==='pairing' ? { ...d, owned:ownedMatches(d, wines) } : d);
    setAsked(saved.asked||''); setQ(saved.asked||'');
    setPhase(d.mode==='pairing' ? 'pairing' : 'answer');
  }, []);

  // `pendingResearch` is a live-screen state, not an answer property — a
  // restored answer must never come back with a spinner that nothing will
  // ever resolve.
  const remember = (d, question)=> writeLastAnswer(userId, question, { ...d, pendingResearch:false });

  // Background enrichment for an instant rule answer. Runs AFTER the useful
  // answer is already on screen; the user can leave, refine, or act on it.
  // Reconciliation (lib/answerflow.js) decides what a late response may
  // change; the run token decides whether it may touch the screen at all.
  const enrich = async (Q, initial, token)=>{
    let rec = { accepted:false };
    try {
      if (!supabase) throw new Error('not configured');
      const r = await withTimeout(askSommelier(Q, wines));
      rec = reconcileEnrichment(initial, r);
    } catch(e){
      // Timeout, network, or an unusable response: the rule answer stands and
      // its basis line already tells the truth (built-in guidance, no source).
      if (!(e && (e.timeout || e.blocked))) console.error('research enrichment failed', e);
    }
    const cached = readLastAnswer(userId);
    const where = enrichmentDisposition({
      isCurrentRun: token === runCounter,
      accepted: rec.accepted, asked: Q, cachedAsked: cached ? cached.asked : null,
    });
    if (where === 'discard') return;
    const final = rec.accepted
      ? { ...rec.data, owned: ownedMatches(rec.data, wines) }
      : { ...initial, pendingResearch:false };
    if (where === 'cache_only'){ if (rec.accepted) remember(final, Q); return; }
    remember(final, Q);
    setData(final);
  };

  const run = async (query)=>{
    const Q = (query!=null?query:q).trim(); if(!Q) return;
    const token = ++runCounter;
    setAsked(Q); setQ(Q); track('sommelier_question');

    // A KNOWN food-pairing request (a reviewed dish rule matches) renders the
    // built-in guidance immediately — local data, no network in the way — and
    // researches in the background. Everything else keeps research-first
    // waiting: exact bottles, vintages, critics, prices and open questions
    // cannot be answered honestly without evidence, so they earn the spinner —
    // now behind a firm timeout so it can never spin indefinitely.
    const h = heuristicPairing(Q);
    if (h.matched){
      const initial = { ...instantPairing(h), owned: ownedMatches(h, wines) };
      setData(initial); remember(initial, Q); setPhase('pairing');
      enrich(Q, initial, token);
      return;
    }

    setPhase('thinking');
    try {
      if (!supabase) throw new Error('not configured');
      const r = await withTimeout(askSommelier(Q, wines));   // model classifies pairing vs. answer
      if (token !== runCounter) return;                     // superseded while waiting
      if (r && r.kind==='pairing' && r.primary){
        const out = { dish:r.dish||Q, primary:r.primary, others:r.others||[], avoid:[], avoidNote:r.avoidNote||'',
          sources:r.sources||[], researchStatus:r.researchStatus||'no_evidence', limit:priceLimit(Q) };
        const d = { mode:'pairing', ...out, owned:ownedMatches(out, wines) };
        setData(d); remember(d, Q);
        setPhase('pairing');
      } else if (r && r.kind==='answer' && (r.text||'').trim()){
        const d = { mode:'answer', text:r.text.trim(), sources:r.sources||[],
          basis:(r.sources||[]).length ? 'researched' : (r.researchStatus||'no_evidence') };
        setData(d); remember(d, Q);
        setPhase('answer');
      } else {
        const err = new Error('empty sommelier result'); err.unusable = true; throw err;
      }
    } catch(e){
      if (token !== runCounter) return;                     // superseded while waiting
      console.error('sommelier failed', e);
      // Graceful fallback: pairing questions still get a useful answer. Track
      // WHY we fell back so the disclosure tells the truth — "unavailable" and
      // "answered, but unusably" are different things and the banner says which.
      if (isPairingQuery(Q)){
        const d = { mode:'pairing', ...h, owned:ownedMatches(h, wines),
          offline:true, offlineReason: e && e.unusable ? 'unusable' : 'unreachable' };
        setData(d); remember(d, Q);
        setPhase('pairing');
      } else {
        setData({ mode:'answer', text:'Sorry — I couldn’t reach your sommelier just now. Please try again in a moment.' });
        setPhase('answer');
      }
    }
  };
  pUE(()=>{ setSaved(false); setShowWhy(false); }, [asked]);
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
          {/* The question stays visible — someone refining in an aisle needs to
              see what was actually asked. */}
          <div style={{ fontSize:12.5, color:T.ink3, marginBottom:12 }}>You asked <span style={{ color:T.ink2, fontWeight:600 }}>“{asked}”</span></div>

          {/* ── The ten-second block ──────────────────────────────────
              Recommendation before explanation. Everything a hurried shopper
              needs to locate a bottle sits above this fold; depth is behind
              "Why this?". */}
          {pairingHeadline(data) && <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase', marginBottom:10 }}>{pairingHeadline(data)}</div>}
          <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.ink3, letterSpacing:'.14em', textTransform:'uppercase' }}>Look for</div>
          <div style={{ fontSize:30, fontWeight:790, letterSpacing:-0.9, color:T.ink, lineHeight:1.05, marginTop:4 }}>{data.primary.grape}</div>

          {data.primary.deeperTitle && <div style={{ marginTop:12 }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:10, color:T.maybe, letterSpacing:'.12em', textTransform:'uppercase' }}>Best bet</span>
            <div style={{ fontSize:16.5, fontWeight:700, color:T.ink, letterSpacing:-0.3, marginTop:3 }}>{data.primary.deeperTitle}</div>
          </div>}

          {data.primary.bottle && <div style={{ marginTop:14, padding:'12px 14px', border:`1px solid ${T.buy}`, background:T.buyBg, borderRadius:12 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.13em', textTransform:'uppercase', color:T.buy }}>Source-verified bottle</div>
            <div style={{ fontSize:15.5, fontWeight:720, color:T.ink, marginTop:4 }}>{data.primary.bottle}</div>
            {data.primary.bottleWhy && <div style={{ fontSize:13, color:T.ink2, lineHeight:1.45, marginTop:4 }}>{data.primary.bottleWhy}</div>}
          </div>}

          <div style={{ fontSize:14.5, color:T.ink2, lineHeight:1.5, marginTop:8 }}>{data.primary.why}</div>

          {/* On the shelf — the exact words to look for */}
          {(data.primary.lookFor||[]).length>0 && <div style={{ marginTop:14, padding:'12px 14px', background:T.canvas, border:`1px solid ${T.line}`, borderRadius:12 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.13em', textTransform:'uppercase', color:T.ink3, marginBottom:7 }}>On the label</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {data.primary.lookFor.slice(0,3).map((t,i)=>(
                <div key={i} style={{ display:'flex', gap:8, fontSize:13, color:T.ink2, lineHeight:1.4 }}>
                  <span style={{ flexShrink:0, width:4, height:4, borderRadius:99, background:T.ink4, marginTop:6 }}/><span>{t}</span>
                </div>
              ))}
            </div>
          </div>}

          {/* Also works — one line, never a second essay */}
          {data.others && data.others.length>0 && <div style={{ marginTop:14, display:'flex', flexWrap:'wrap', alignItems:'baseline', gap:'4px 8px' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:10, color:T.ink3, letterSpacing:'.12em', textTransform:'uppercase' }}>Also works</span>
            <span style={{ fontSize:14.5, color:T.ink, fontWeight:620 }}>{data.others.slice(0,2).map(o=>o.grape).join('  ·  ')}</span>
          </div>}

          <AvoidNote text={data.avoidNote}/>

          {/* Quiet enrichment status: the answer above is already complete and
              usable; this only says research is still looking for supporting
              sources. It resolves silently — never into a different answer. */}
          {data.pendingResearch && <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:8 }}>
            <Spinner size={13} stroke={2}/>
            <span style={{ fontSize:11.5, color:T.ink4 }}>Checking public wine sources…</span>
          </div>}

          {/* In your cellar — kept visually distinct from what to buy */}
          <div style={{ marginTop:20, paddingTop:18, borderTop:`2px solid ${T.line2}` }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:9, marginBottom:11 }}>
              <span style={{ fontSize:16.5, fontWeight:740, letterSpacing:-0.35 }}>In your cellar</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3 }}>{data.owned.length ? `${data.owned.length} match${data.owned.length>1?'es':''}` : 'nothing matching'}</span>
            </div>
            {data.owned.length
              ? data.owned.map(w=> <OwnedRow key={w.id} w={w} onOpen={onOpen}/>)
              : <div style={{ padding:'14px', border:`1px dashed ${T.line2}`, borderRadius:12, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Nothing here fits this one — the shelf guidance above is what to buy.</div>}
          </div>

          {/* Refine without starting over */}
          <div style={{ marginTop:20 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.ink3, letterSpacing:'.13em', textTransform:'uppercase', marginBottom:8 }}>Change one thing</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {REFINEMENTS.map(([label, qualifier])=>(
                <button key={label} onClick={()=>run(`${asked}, ${qualifier}`)}
                  style={{ padding:'7px 12px', borderRadius:99, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2,
                    fontFamily:'var(--sans)', fontSize:12.5, fontWeight:560, cursor:'pointer' }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Depth, behind one control */}
          <button onClick={()=>setShowWhy(v=>!v)} style={{ marginTop:20, background:'none', border:'none', padding:0, cursor:'pointer',
            display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, color:T.ink2 }}>
            <Icon name={showWhy?'x':'sparkle'} size={14} color={T.ink2}/>{showWhy ? 'Hide the detail' : 'Why this?'}
          </button>

          {showWhy && <div style={{ marginTop:12 }}>
            {data.primary.deeper && <div style={{ padding:'14px 16px', background:`hsl(${typeHue(data.owned&&data.owned[0]?data.owned[0].type:'Red')} 30% 97%)`, border:`1px solid ${T.line}`, borderRadius:13 }}>
              <div style={{ fontSize:15.5, fontWeight:700, color:T.ink, letterSpacing:-0.25 }}>{data.primary.deeperTitle}</div>
              <div style={{ fontSize:14, color:T.ink2, lineHeight:1.55, marginTop:5 }}>{data.primary.deeper}</div>
            </div>}
            {data.others && data.others.length>0 && <div style={{ marginTop:18 }}>
              <div style={{ fontSize:15.5, fontWeight:720, letterSpacing:-0.3, marginBottom:2 }}>How the alternatives differ</div>
              {data.others.slice(0,2).map((o,i)=> <StyleNote key={i} grape={o.grape} why={o.why} direction={o.direction}/>)}
            </div>}
            <BasisLine basis={pairingBasis(data)} sources={data.sources}/>
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
