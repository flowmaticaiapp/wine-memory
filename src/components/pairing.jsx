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
import { DISH_RULES, DEFAULT_RULE, priceLimit, isPairingQuery, hasSpecificFoodContext, needsTacoGuidance, heuristicPairing, pairingHeadline } from '../lib/pairingrules.js';
import { textMatchesAnyGrape } from '../lib/grapes.js';
import { needsTonightGuidance, rankTonightBottles, tonightReason, alternativeDirection } from '../lib/tonight.js';
import { relevantBuyAgainGrape } from '../lib/pairing-insight.js';
import { readLastAnswer, writeLastAnswer } from '../lib/lastanswer.js';
import { withTimeout, instantEligible, instantPairing, reconcileEnrichment, enrichmentDisposition, pairingBasis, RESEARCH_FIRST_TIMEOUT_MS, sommelierFailureMessage } from '../lib/answerflow.js';
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

const TONIGHT_MEALS = [
  ['Steak','steak'], ['Chicken','chicken'], ['Pasta','pasta'], ['Seafood','seafood'],
  ['Spicy','spicy food'], ['Cheese','cheese'], ['No food',''], ['Something else',null],
].map(([label,query])=>({ label, query }));
const TONIGHT_MOODS = [
  ['Light & fresh','light','light and fresh'],
  ['Rich & cozy','rich','rich and cozy'],
  ['Bold','bold','bold'],
  ['Something different','different','something different'],
  ['Decide for me','decide','decide for me'],
].map(([label,id,query])=>({ label,id,query }));
const TACO_FILLINGS = [
  ['Pork / carnitas','pork'], ['Beef / carne asada','beef'], ['Chicken','chicken'],
  ['Fish / shrimp','fish'], ['Vegetable / bean','vegetable'], ['Mixed / not sure','mixed'],
].map(([label,query])=>({ label,query }));

function TacoChoices({ onChoose }){
  return <div style={{ paddingTop:12 }}>
    <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase' }}>One quick question</div>
    <div style={{ fontFamily:'var(--serif)', fontSize:27, color:T.ink, marginTop:7 }}>What kind of tacos?</div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginTop:17 }}>
      {TACO_FILLINGS.map((choice)=><button key={choice.label} onClick={()=>onChoose(choice)}
        style={{ minHeight:58, padding:'11px 10px', borderRadius:13, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink,
          fontFamily:'var(--sans)', fontSize:13.5, fontWeight:630, cursor:'pointer' }}>{choice.label}</button>)}
    </div>
    <div style={{ marginTop:15, fontSize:12.5, color:T.ink4, lineHeight:1.45 }}>The filling, salsa and heat matter more than the word “tacos” alone.</div>
  </div>;
}

function TonightChoices({ step, meal, onMeal, onMood }){
  const choices = step === 'meal' ? TONIGHT_MEALS : TONIGHT_MOODS;
  return <div style={{ paddingTop:12 }}>
    <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase' }}>
      {step === 'meal' ? 'One quick question' : meal?.label}
    </div>
    <div style={{ fontFamily:'var(--serif)', fontSize:27, color:T.ink, marginTop:7 }}>
      {step === 'meal' ? 'What are you having?' : 'What sounds good tonight?'}
    </div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginTop:17 }}>
      {choices.map((choice)=><button key={choice.label} onClick={()=>step==='meal'?onMeal(choice):onMood(choice)}
        style={{ minHeight:58, padding:'11px 10px', borderRadius:13, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink,
          fontFamily:'var(--sans)', fontSize:13.5, fontWeight:630, cursor:'pointer' }}>{choice.label}</button>)}
    </div>
    <div style={{ marginTop:15, fontSize:12.5, color:T.ink4, lineHeight:1.45 }}>
      {step === 'meal' ? 'This keeps the sommelier from guessing before it knows the meal.' : 'Wine Memory will look in your cellar first.'}
    </div>
  </div>;
}

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
function ownedMatches(result, wines, options = {}){
  const targets = [ ...(result.primary.matchGrapes||[result.primary.grape]), ...((result.others||[]).map(o=>o.grape)) ].filter(Boolean);
  const avoid = (result.avoid||[]).filter(Boolean);
  const mine = personalWines(wines);
  let pool = options.guidedTonight && result.matched === false
    ? mine.filter(w=>!grapeFits(w, avoid))
    : mine.filter(w=> grapeFits(w, targets) && !grapeFits(w, avoid));
  if (result.limit!=null) pool = pool.filter(w=> w.price==null || w.price<=result.limit);
  return rankTonightBottles(pool, options.mood, options.guidedTonight ? 3 : 6);
}
// ── UI pieces ──
function OwnedRow({ w, onOpen }){
  return (
    <button onClick={()=>onOpen(w.id)} style={{ width:'100%', textAlign:'left', display:'flex', gap:12, alignItems:'center', padding:'11px 12px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:13, cursor:'pointer', marginBottom:9 }}>
      <BottlePhoto wine={w} w={50} h={62} rounded={9}/>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.maybe, letterSpacing:0.25, textTransform:'uppercase' }}>{styleLabel(w)}</div>
        <div style={{ fontSize:14.5, fontWeight:670, color:T.ink, letterSpacing:-0.2, lineHeight:1.2, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.producer ? `${w.producer} ` : ''}{w.name} <span style={{ color:T.ink3, fontWeight:500 }}>{w.vintage}{w.quantity>1?` · ${w.quantity} bottles`:''}</span></div>
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
  const [phase, setPhase] = pUS('idle');   // idle | guide-taco | guide-meal | guide-mood | thinking | pairing | search
  const [data, setData] = pUS(null);
  const [asked, setAsked] = pUS('');
  const [guideMeal, setGuideMeal] = pUS(null);
  const [saved, setSaved] = pUS(false);
  const [showWhy, setShowWhy] = pUS(false);   // depth stays closed by default
  const didInit = pUR(false);
  // Leaving the screen invalidates every pending screen update: late research
  // may still upgrade the per-user cache for its own question, but it must
  // never call state setters on an unmounted screen.
  const mounted = pUR(true);
  pUE(()=>{ mounted.current = true; return ()=>{ mounted.current = false; }; }, []);

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
    setData(d.mode==='pairing' ? { ...d, owned:ownedMatches(d, wines, { guidedTonight:!!d.guidedTonight, mood:d.guidedMood }) } : d);
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
      ? (rec.data.mode === 'pairing'
          ? { ...rec.data, owned: ownedMatches(rec.data, wines, { guidedTonight:!!initial.guidedTonight, mood:initial.guidedMood }) }
          : rec.data)                              // mode correction → written answer
      : { ...initial, pendingResearch:false };
    if (where === 'cache_only'){ if (rec.accepted) remember(final, Q); return; }
    remember(final, Q);
    if (!mounted.current) return;                  // cache updated; screen is gone
    setData(final);
    if (final.mode === 'answer') setPhase('answer');
  };

  const run = async (query, options = {})=>{
    const Q = (query!=null?query:q).trim(); if(!Q) return;
    const token = ++runCounter;
    setAsked(Q); setQ(Q); track('sommelier_question');

    if (!options.guidedTaco && needsTacoGuidance(Q)){
      setData(null); setPhase('guide-taco');
      return;
    }

    if (!options.guidedTonight && needsTonightGuidance(Q, hasSpecificFoodContext(Q))){
      setData(null); setGuideMeal(null); setPhase('guide-meal');
      return;
    }

    // EVERY food-pairing question renders useful guidance immediately — the
    // matched dish rule when one fires, the honest "versatile starting point"
    // otherwise — with research enriching (or, for the unmatched fallback,
    // correcting) in the background. Only questions that are not pairing
    // questions at all keep research-first waiting: exact bottles, vintages,
    // critics, prices and explainers cannot be answered honestly without
    // evidence, so they earn the spinner — behind a firm timeout so it can
    // never spin indefinitely.
    const h = heuristicPairing(Q);
    if (options.guidedTonight || instantEligible(Q)){
      const owned = ownedMatches(h, wines, { guidedTonight:!!options.guidedTonight, mood:options.mood });
      const initial = { ...instantPairing(h), owned,
        guidedTonight:!!options.guidedTonight, guidedMood:options.mood||null,
        tonightMeal:options.mealLabel||'', tonightReason: options.guidedTonight && owned.length
          ? `${tonightReason(options.mealLabel||'your evening', options.mood, !!options.hasMeal)}${h.matched ? ` ${h.primary.why}` : ''}` : '' };
      setData(initial); remember(initial, Q); setPhase('pairing');
      // With no meal there is no pairing claim to research. The answer is a
      // ranked decision among owned bottles, not a web-generated substitute.
      if (!options.guidedTonight || h.matched) enrich(Q, initial, token);
      else { const settled={ ...initial, pendingResearch:false }; setData(settled); remember(settled,Q); }
      return;
    }

    setPhase('thinking');
    const slowTimer = setTimeout(()=>{
      if (token === runCounter && mounted.current) setPhase('thinking-slow');
    }, 8_000);
    try {
      if (!supabase) throw new Error('not configured');
      const r = await withTimeout(askSommelier(Q, wines), RESEARCH_FIRST_TIMEOUT_MS);   // model classifies pairing vs. answer
      clearTimeout(slowTimer);
      if (token !== runCounter || !mounted.current) return; // superseded, or the screen is gone
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
      clearTimeout(slowTimer);
      if (token !== runCounter || !mounted.current) return; // superseded, or the screen is gone
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
        setData({ mode:'answer', text:sommelierFailureMessage(e) });
        setPhase('answer');
      }
    }
  };

  const chooseMeal = (meal)=>{
    if (meal.query === null){
      setGuideMeal(null); setAsked(''); setQ('What should I open tonight with '); setPhase('idle');
      return;
    }
    setGuideMeal(meal); setPhase('guide-mood');
  };
  const chooseTaco = (filling)=> run(`Best wine for ${filling.query} tacos`, { guidedTaco:true });
  const chooseMood = (mood)=>{
    const withMeal = guideMeal?.query ? ` with ${guideMeal.query}` : '';
    run(`What should I open tonight${withMeal}? I want ${mood.query}.`, {
      guidedTonight:true, mood:mood.id, mealLabel:guideMeal?.label||'No food', hasMeal:!!guideMeal?.query,
    });
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

  const insightGrape = data && data.mode==='pairing' ? relevantBuyAgainGrape(wines, data) : null;

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

        {phase==='guide-taco' && <TacoChoices onChoose={chooseTaco}/>}
        {phase==='guide-meal' && <TonightChoices step="meal" meal={guideMeal} onMeal={chooseMeal} onMood={chooseMood}/>}
        {phase==='guide-mood' && <TonightChoices step="mood" meal={guideMeal} onMeal={chooseMeal} onMood={chooseMood}/>}

        {(phase==='thinking' || phase==='thinking-slow') && <div style={{ paddingTop:60, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <Spinner size={40} stroke={3}/>
          <div style={{ fontSize:15.5, fontWeight:680, marginTop:18 }}>{phase==='thinking-slow'?'Still checking sources…':'Thinking it through…'}</div>
          <div style={{ fontSize:13, color:T.ink3, marginTop:5, textAlign:'center', maxWidth:'30ch' }}>{phase==='thinking-slow'?'Public wine research is taking a little longer than usual.':'Finding the best wine for “'+asked+'”.'}</div>
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

          {data.guidedTonight && data.owned.length>0 && <>
            <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase', marginBottom:9 }}>Tonight’s bottle</div>
            <OwnedRow w={data.owned[0]} onOpen={onOpen}/>
            <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5, marginTop:5 }}>{data.tonightReason}</div>
            {data.owned.length>1 && <div style={{ marginTop:20 }}>
              <div style={{ fontSize:15.5, fontWeight:720, letterSpacing:-0.3, marginBottom:9 }}>Two other good choices</div>
              {data.owned.slice(1,3).map(w=><div key={w.id} style={{ marginBottom:12 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.maybe, letterSpacing:'.11em', textTransform:'uppercase', marginBottom:5 }}>{alternativeDirection(data.owned[0],w)}</div>
                <OwnedRow w={w} onOpen={onOpen}/>
              </div>)}
            </div>}
          </>}
          {data.guidedTonight && !data.owned.length && <div style={{ marginBottom:16, padding:'13px 14px', border:`1px dashed ${T.line2}`, borderRadius:12, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>
            Nothing you currently own fits closely enough. Here is the style to look for instead.
          </div>}

          {/* ── The ten-second block ──────────────────────────────────
              Recommendation before explanation. Everything a hurried shopper
              needs to locate a bottle sits above this fold; depth is behind
              "Why this?". */}
          {(!data.guidedTonight || !data.owned.length) && <>
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
          </>}

          <AvoidNote text={data.avoidNote}/>

          {/* Quiet enrichment status: the answer above is already complete and
              usable; this only says research is still looking for supporting
              sources. It resolves silently — never into a different answer. */}
          {data.pendingResearch && <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:8 }}>
            <Spinner size={13} stroke={2}/>
            <span style={{ fontSize:11.5, color:T.ink4 }}>Checking public wine sources…</span>
          </div>}

          {/* In your cellar — kept visually distinct from what to buy */}
          {!data.guidedTonight && <div style={{ marginTop:20, paddingTop:18, borderTop:`2px solid ${T.line2}` }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:9, marginBottom:11 }}>
              <span style={{ fontSize:16.5, fontWeight:740, letterSpacing:-0.35 }}>In your cellar</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3 }}>{data.owned.length ? `${data.owned.length} match${data.owned.length>1?'es':''}` : 'nothing matching'}</span>
            </div>
            {data.owned.length
              ? data.owned.map(w=> <OwnedRow key={w.id} w={w} onOpen={onOpen}/>)
              : <div style={{ padding:'14px', border:`1px dashed ${T.line2}`, borderRadius:12, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Nothing here fits this one — the shelf guidance above is what to buy.</div>}
          </div>}

          {/* Refine without starting over */}
          {!data.guidedTonight && <div style={{ marginTop:20 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.ink3, letterSpacing:'.13em', textTransform:'uppercase', marginBottom:8 }}>Change one thing</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
              {REFINEMENTS.map(([label, qualifier])=>(
                <button key={label} onClick={()=>run(`${asked}, ${qualifier}`)}
                  style={{ padding:'7px 12px', borderRadius:99, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2,
                    fontFamily:'var(--sans)', fontSize:12.5, fontWeight:560, cursor:'pointer' }}>{label}</button>
              ))}
            </div>
          </div>}

          {data.guidedTonight && <button onClick={()=>{ setGuideMeal(null); setPhase('guide-meal'); }} style={{ width:'100%', marginTop:18, padding:'12px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, cursor:'pointer' }}>Change the meal or mood</button>}

          {/* Depth, behind one control */}
          {!data.guidedTonight && <button onClick={()=>setShowWhy(v=>!v)} style={{ marginTop:20, background:'none', border:'none', padding:0, cursor:'pointer',
            display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, color:T.ink2 }}>
            <Icon name={showWhy?'x':'sparkle'} size={14} color={T.ink2}/>{showWhy ? 'Hide the detail' : 'Why this?'}
          </button>}

          {!data.guidedTonight && showWhy && <div style={{ marginTop:12 }}>
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
          {!data.guidedTonight && insightGrape && <div style={{ marginTop:22, display:'flex', gap:10, padding:'13px 14px', background:T.buyBg, borderRadius:12 }}>
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
