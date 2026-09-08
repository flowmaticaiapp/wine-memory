// pairing.jsx — Your sommelier: a stateful, challengeable conversation.
// Layer 1: human-friendly style + why + regional deep-dive (educational).
// Layer 2: the bottles you already own that match that style.
// Layer 3 (this stage): the conversation. Every question is planned by
// lib/conversation.js — intent, whole-dish context, clarification before
// guessing, follow-ups that keep the meal, budget and colour, local
// rule-grounded explanations for "why", "why not", "compare" and "sources",
// and research (the `sommelier` Edge Function) only where evidence is needed.
// Real intelligence via the Supabase Edge Function (Claude); heuristic pairing
// fallback offline. Ported from app/pairing.jsx.
import React from 'react';
import { T, styleLabel } from '../lib/data.js';
import { Icon, VerdictBadge } from './ui.jsx';
import { BottlePhoto, typeHue } from './bottle.jsx';
import { Spinner } from './add.jsx';
import { V_STATUS } from '../lib/constants.js';
import { personalWines } from '../lib/palate.js';
import { DISH_RULES, DEFAULT_RULE, priceLimit, isPairingQuery, needsTacoGuidance, heuristicPairing, pairingHeadline } from '../lib/pairingrules.js';
import { tonightReason, alternativeDirection } from '../lib/tonight.js';
import { relevantBuyAgainGrape } from '../lib/pairing-insight.js';
import { readLastAnswer, writeLastAnswer } from '../lib/lastanswer.js';
import { withTimeout, instantPairing, reconcileEnrichment, enrichmentDisposition, pairingBasis, RESEARCH_FIRST_TIMEOUT_MS, sommelierFailureMessage } from '../lib/answerflow.js';
import { planTurn, composeClarified, followUpActions, summaryOf, researchQuestion, researchContext, historyFor, pairingOf, TACO_FILLINGS } from '../lib/conversation.js';
import { readConversation, writeConversation, clearConversation, emptyConversation, appendUserTurn, appendAnswer, withContext, turnGuard, sanitizeAnswer } from '../lib/conversation-store.js';
import { ownedMatches, cellarPick, bottleReason } from '../lib/cellarpick.js';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';
import { track } from '../lib/analytics.js';

const { useState: pUS, useEffect: pUE } = React;

// Every question gets a token from this guard. A response may only touch the
// screen while its token is still the latest — a late response for a question
// the user has moved past can at most upgrade the stored conversation for
// that same question. Module scope (only one PairingSearch exists at a time)
// so it also survives the component unmounting while research is in flight.
const guard = turnGuard();

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
const TACO_FILLING_CHOICES = TACO_FILLINGS.map(({ label, value })=>({ label, query:value }));

const choiceButton = { minHeight:58, padding:'11px 10px', borderRadius:13, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink,
  fontFamily:'var(--sans)', fontSize:13.5, fontWeight:630, cursor:'pointer' };

function TacoChoices({ onChoose }){
  return <div style={{ paddingTop:12 }}>
    <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase' }}>One quick question</div>
    <div style={{ fontFamily:'var(--serif)', fontSize:27, color:T.ink, marginTop:7 }}>What kind of tacos?</div>
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginTop:17 }}>
      {TACO_FILLING_CHOICES.map((choice)=><button key={choice.label} onClick={()=>onChoose(choice)} style={choiceButton}>{choice.label}</button>)}
    </div>
    <div style={{ marginTop:15, fontSize:12.5, color:T.ink4, lineHeight:1.45 }}>The filling, salsa and heat matter more than the word “tacos” alone. Or type the dish above.</div>
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
      {choices.map((choice)=><button key={choice.label} onClick={()=>step==='meal'?onMeal(choice):onMood(choice)} style={choiceButton}>{choice.label}</button>)}
    </div>
    <div style={{ marginTop:15, fontSize:12.5, color:T.ink4, lineHeight:1.45 }}>
      {step === 'meal' ? 'This keeps the sommelier from guessing before it knows the meal.' : 'Wine Memory will look in your cellar first.'}
    </div>
  </div>;
}

// The generic clarification: one concise question, quick choices, and the
// input above always accepts a typed answer instead.
function ChoiceQuestion({ question, onChoose }){
  const choices = question.choices || [];
  return <div style={{ paddingTop:12 }}>
    <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase' }}>{question.kicker || 'One quick question'}</div>
    <div style={{ fontFamily:'var(--serif)', fontSize:27, color:T.ink, marginTop:7, lineHeight:1.15 }}>{question.title}</div>
    {choices.length>0 && <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginTop:17 }}>
      {choices.map((choice)=><button key={choice.label} onClick={()=>onChoose(choice)} style={choiceButton}>{choice.label}</button>)}
    </div>}
    <div style={{ marginTop:15, fontSize:12.5, color:T.ink4, lineHeight:1.45 }}>
      {question.hint}{question.allowText !== false && ' Or type a different answer above.'}
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
// `extra` carries the conversation: a concept-only context string, the last
// few turns, and the app's intent — never cellar contents in a search query.
async function askSommelier(query, wines, extra = {}){
  const { owned, ownedGrapes } = collectionSummary(wines);
  return await invokeAI('sommelier', { query, owned, ownedGrapes, ...extra });
}

// The stored copy of an answer: live-screen fields (owned bottles with signed
// photo URLs, cellar picks, the enrichment spinner) never go to storage. They
// are recomputed from the live cellar on restore.
function persistable(d){
  if (!d) return d;
  const { owned, picks, pendingResearch, ...rest } = d;   // eslint-disable-line no-unused-vars
  return rest;
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
const BASIS_LABEL = {
  ai:          'General wine knowledge · not checked against a wine source',
  researched:  'Checked against public wine sources',
  no_evidence: 'Public sources checked · no specific evidence used',
  unavailable: 'Public research unavailable · general wine knowledge',
  rule:        'General pairing guidance built into Wine Memory',
  unreachable: 'Offline · general pairing guidance',
  unusable:    'Couldn’t complete that · general pairing guidance',
  cellar:      'Chosen from your own cellar records',
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

function SommelierMark(){
  return <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
    <span style={{ width:30, height:30, borderRadius:99, background:T.maybeBg, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkle" size={16} color={T.maybe}/></span>
    <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase' }}>Your sommelier</span>
  </div>;
}

// The conversation so far, above the current answer. Compact on purpose: the
// point is that the user can see what the sommelier already knows, not a
// transcript to scroll.
function Thread({ turns, onNew }){
  const [open, setOpen] = pUS(false);
  if (!turns || !turns.length) return null;
  const shown = open ? turns : turns.slice(-4);
  return <div style={{ marginBottom:16, paddingBottom:12, borderBottom:`1px solid ${T.line}` }}>
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
      <span style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.ink3, letterSpacing:'.13em', textTransform:'uppercase' }}>This conversation</span>
      <div style={{ display:'flex', gap:12 }}>
        {turns.length > 4 && <button onClick={()=>setOpen(v=>!v)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:'var(--sans)', fontSize:11.5, color:T.ink3 }}>{open ? 'Show less' : `Show all ${Math.ceil(turns.length/2)}`}</button>}
        <button onClick={onNew} style={{ background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:'var(--sans)', fontSize:11.5, fontWeight:620, color:T.ink2 }}>New question</button>
      </div>
    </div>
    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
      {shown.map((t,i)=> t.role==='user'
        ? <div key={i} style={{ fontSize:12.5, color:T.ink2, lineHeight:1.4 }}><span style={{ color:T.ink4 }}>You · </span>{t.text}</div>
        : <div key={i} style={{ fontSize:12.5, color:T.ink3, lineHeight:1.4, paddingLeft:10, borderLeft:`2px solid ${T.line2}` }}>{t.text}</div>)}
    </div>
  </div>;
}

// Useful next moves after an answer. Each is an ordinary question the engine
// understands, so a tap and a typed sentence take the same path.
function FollowUpBar({ data, onAsk, onFocusInput }){
  const actions = followUpActions(data);
  if (!actions.length) return null;
  return <div style={{ marginTop:20 }}>
    <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.ink3, letterSpacing:'.13em', textTransform:'uppercase', marginBottom:8 }}>Keep going</div>
    <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
      {actions.map((a)=>(
        <button key={a.label} onClick={()=>onAsk(a.value)}
          style={{ padding:'7px 12px', borderRadius:99, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2,
            fontFamily:'var(--sans)', fontSize:12.5, fontWeight:560, cursor:'pointer' }}>{a.label}</button>
      ))}
      <button onClick={onFocusInput}
        style={{ padding:'7px 12px', borderRadius:99, border:`1px solid ${T.ink}`, background:T.ink, color:'#fff',
          fontFamily:'var(--sans)', fontSize:12.5, fontWeight:600, cursor:'pointer' }}>Ask a follow-up</button>
    </div>
  </div>;
}

function Factors({ factors }){
  const [open, setOpen] = pUS(false);
  if (!factors || !factors.length) return null;
  return <div style={{ marginTop:14 }}>
    <button onClick={()=>setOpen(v=>!v)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--sans)', fontSize:13, fontWeight:620, color:T.ink2 }}>
      <Icon name={open?'x':'sparkle'} size={13} color={T.ink2}/>{open ? 'Hide what I weighed' : 'What I weighed'}
    </button>
    {open && <div style={{ marginTop:9, display:'flex', flexWrap:'wrap', gap:6 }}>
      {factors.map((f,i)=><span key={i} style={{ padding:'5px 10px', borderRadius:99, background:T.canvas, border:`1px solid ${T.line}`, fontSize:12, color:T.ink2 }}>{f}</span>)}
    </div>}
  </div>;
}

function PairingSearch({ wines, userId, onClose, onOpen, initialQuery, onSavePairing }){
  const [q, setQ] = pUS('');
  const [phase, setPhase] = pUS('idle');   // idle | guide-taco | guide-meal | guide-mood | clarify | thinking | thinking-slow | pairing | answer | explanation | cellar
  const [data, setData] = pUS(null);
  const [asked, setAsked] = pUS('');
  const [guideMeal, setGuideMeal] = pUS(null);
  const [saved, setSaved] = pUS(false);
  const [showWhy, setShowWhy] = pUS(false);   // depth stays closed by default
  const [conv, setConv] = pUS(()=> readConversation(userId) || emptyConversation());
  const [pending, setPending] = pUS(null);    // the clarification being answered
  const [question, setQuestion] = pUS(null);  // the generic clarification on screen
  const didInit = React.useRef(false);
  const inputRef = React.useRef(null);
  // The latest conversation, readable from async completions without a stale
  // closure. Persisted on every change.
  const convRef = React.useRef(conv);
  const persist = (next)=>{ convRef.current = next; setConv(next); writeConversation(userId, next); };
  // Leaving the screen invalidates every pending screen update: late research
  // may still upgrade the stored conversation for its own question, but it must
  // never call state setters on an unmounted screen.
  const mounted = React.useRef(true);
  React.useEffect(()=>{ mounted.current = true; return ()=>{ mounted.current = false; }; }, []);

  // Recompute live cellar matches for a stored answer: bottles may have been
  // added, drunk or re-rated since, so the stored copy is never trusted.
  const hydrate = (d)=>{
    if (!d) return d;
    if (d.mode === 'pairing'){
      const opts = { guidedTonight:!!d.guidedTonight, mood:d.guidedMood, color:d.cellarColor||null, dislikeColors:d.cellarDislike||[] };
      return { ...d, owned: ownedMatches(d, wines, opts), pendingResearch:false };
    }
    if (d.mode === 'cellar'){
      return { ...d, picks: cellarPick(d.pairing, wines, d.options || {}) };
    }
    return d;
  };
  const phaseFor = (d)=> d.mode==='pairing' ? 'pairing' : d.mode==='cellar' ? 'cellar' : d.mode==='explanation' ? 'explanation' : 'answer';
  const showCurrent = (c)=>{
    if (!c || !c.current) return false;
    const d = hydrate(c.current.data);
    setData(d); setAsked(c.current.asked||''); setQ(c.current.asked||''); setPhase(phaseFor(d));
    return true;
  };

  // Restore the conversation. Someone standing in a shop whose phone locks, or
  // who walks into a dead spot between the door and the shelf, should not lose
  // the recommendation they came in with — nor the thread behind it.
  React.useEffect(()=>{
    if (didInit.current || initialQuery) return;
    if (showCurrent(convRef.current)) return;
    // Pre-conversation cache, still honoured for one restore — through the
    // same deep sanitiser as the conversation store.
    const saved = readLastAnswer(userId);
    const cleaned = saved ? sanitizeAnswer(saved.data) : null;
    if (!cleaned) return;
    const d = hydrate(cleaned);
    setData(d); setAsked(saved.asked||''); setQ(saved.asked||'');
    setPhase(phaseFor(d));
  // Mount-only by design: a restore happens once, before any question.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record an answer as the current one — in the conversation (with the
  // context it established) and, for pairing and written answers, in the
  // pre-conversation cache so nothing else that reads it goes stale.
  const commit = (Q, d, { intent, effectiveQuery, context, followUp } = {})=>{
    let next = convRef.current;
    const lastUser = next.turns[next.turns.length-1];
    if (!(lastUser && lastUser.role==='user' && lastUser.text===Q)) next = appendUserTurn(next, Q, intent);
    if (context) next = withContext(next, context);
    next = appendAnswer(next, { asked:Q, summary:summaryOf(d), data:persistable(d), intent, effectiveQuery, mode:d.mode, followUp });
    persist(next);
    if (d.mode==='pairing' || d.mode==='answer') writeLastAnswer(userId, Q, persistable(d));
  };

  // Background enrichment for an instant rule answer. Runs AFTER the useful
  // answer is already on screen; the user can leave, refine, or act on it.
  // Reconciliation (lib/answerflow.js) decides what a late response may
  // change; the guard decides whether it may touch the screen at all.
  const enrich = async (Q, initial, token, extra)=>{
    let rec = { accepted:false };
    try {
      if (!supabase) throw new Error('not configured');
      const r = await withTimeout(askSommelier(Q, wines, extra));
      rec = reconcileEnrichment(initial, r);
    } catch(e){
      // Timeout, network, or an unusable response: the rule answer stands and
      // its basis line already tells the truth (built-in guidance, no source).
      if (!(e && (e.timeout || e.blocked))) console.error('research enrichment failed', e);
    }
    const stored = readConversation(userId) || convRef.current;
    const where = enrichmentDisposition({
      isCurrentRun: guard.isCurrent(token),
      accepted: rec.accepted, asked: Q, cachedAsked: stored && stored.current ? stored.current.asked : null,
    });
    if (where === 'discard') return;
    const opts = { guidedTonight:!!initial.guidedTonight, mood:initial.guidedMood, color:initial.cellarColor||null, dislikeColors:initial.cellarDislike||[] };
    const final = rec.accepted
      ? (rec.data.mode === 'pairing'
          ? { ...rec.data, owned: ownedMatches(rec.data, wines, opts), leadWithCellar: initial.leadWithCellar, cellarColor: initial.cellarColor, cellarDislike: initial.cellarDislike }
          : rec.data)                              // mode correction → written answer
      : { ...initial, pendingResearch:false };
    // Replace the stored current answer for this same question.
    const base = stored;
    const nextConv = { ...base, current: { ...(base.current||{}), asked:Q, data:persistable(final) },
      turns: base.turns.map((t,i)=> (i===base.turns.length-1 && t.role==='sommelier') ? { ...t, text:summaryOf(final) } : t) };
    if (where === 'cache_only'){ if (rec.accepted){ writeConversation(userId, nextConv); if (final.mode==='pairing'||final.mode==='answer') writeLastAnswer(userId, Q, persistable(final)); } return; }
    persist(nextConv);
    if (final.mode==='pairing'||final.mode==='answer') writeLastAnswer(userId, Q, persistable(final));
    if (!mounted.current) return;                  // stored; screen is gone
    setData(final);
    if (final.mode === 'answer') setPhase('answer');
  };

  // Execute a research plan: the thinking screen behind a firm timeout, a
  // meaningful slow state, and honest fallbacks — a rule answer for a food
  // question, a plain message otherwise. Never an unrelated card.
  const runResearch = async (Q, plan, token)=>{
    setPhase('thinking');
    const slowTimer = setTimeout(()=>{
      if (guard.isCurrent(token) && mounted.current) setPhase('thinking-slow');
    }, 8_000);
    const extra = { intent: plan.intent, context: plan.contextText || researchContext(convRef.current, pairingOf(convRef.current.current?.data)), history: historyFor(convRef.current) };
    try {
      if (!supabase) throw new Error('not configured');
      const r = await withTimeout(askSommelier(plan.question, wines, extra), RESEARCH_FIRST_TIMEOUT_MS);   // model classifies pairing vs. answer
      clearTimeout(slowTimer);
      if (!guard.isCurrent(token) || !mounted.current) return; // superseded, cancelled, or the screen is gone
      if (r && r.kind==='pairing' && r.primary && plan.expects !== 'answer'){
        const out = { dish:r.dish||Q, primary:r.primary, others:r.others||[], avoid:[], avoidNote:r.avoidNote||'',
          sources:r.sources||[], researchStatus:r.researchStatus||'no_evidence', limit:priceLimit(plan.effectiveQuery||Q) };
        const opts = { color: plan.context?.color||null, dislikeColors: plan.context?.dislikeColors||[], limit: plan.context?.budget ?? out.limit };
        const d = { mode:'pairing', ...out, owned:ownedMatches(out, wines, opts), leadWithCellar: plan.intent==='cellar', cellarColor: opts.color, cellarDislike: opts.dislikeColors };
        setData(d); commit(Q, d, { intent:plan.intent, effectiveQuery:plan.effectiveQuery, context:{ ...(plan.context||{}), dishQuery: plan.context?.dishQuery || (isPairingQuery(Q) ? Q : undefined), dishLabel: out.dish }, followUp:plan.followUp });
        setPhase('pairing');
      } else if (r && ((r.kind==='answer' && (r.text||'').trim()) || (r.kind==='pairing' && r.primary))){
        // A reasoning follow-up answered as a pairing card is still prose to
        // the user: the lead grape and its why, then the alternatives.
        const text = r.kind==='answer' ? r.text.trim()
          : [`${r.primary.grape}: ${r.primary.why||''}`.trim(), ...((r.others||[]).map(o=>`- ${o.grape}: ${o.why||''}`.trim()))].join('\n');
        const d = { mode: plan.followUp ? 'explanation' : 'answer', text, sources:r.sources||[],
          basis:(r.sources||[]).length ? 'researched' : (r.researchStatus||'no_evidence') };
        setData(d); commit(Q, d, { intent:plan.intent, effectiveQuery:plan.effectiveQuery, context:plan.context, followUp:plan.followUp });
        setPhase(d.mode);
      } else {
        const err = new Error('empty sommelier result'); err.unusable = true; throw err;
      }
    } catch(e){
      clearTimeout(slowTimer);
      if (!guard.isCurrent(token) || !mounted.current) return; // superseded, cancelled, or the screen is gone
      console.error('sommelier failed', e);
      // Graceful fallback: food questions still get a useful rule answer. Track
      // WHY we fell back so the disclosure tells the truth — "unavailable" and
      // "answered, but unusably" are different things and the line says which.
      if (plan.fallback === 'pairing' && isPairingQuery(plan.effectiveQuery||Q)){
        const h = heuristicPairing(plan.effectiveQuery||Q);
        const d = { mode:'pairing', ...h, owned:ownedMatches(h, wines),
          offline:true, offlineReason: e && e.unusable ? 'unusable' : 'unreachable' };
        setData(d); commit(Q, d, { intent:plan.intent, effectiveQuery:plan.effectiveQuery, context:{ ...(plan.context||{}), dishQuery:Q, dishLabel:h.dish, ruleId:h.ruleId } });
        setPhase('pairing');
      } else {
        // Exact-bottle, price, rating and vintage questions fail honestly. The
        // message is transient: it does not become the conversation's answer.
        const unverified = plan.requiresEvidence
          ? ' I won’t guess at a bottle, price, rating or vintage without verified evidence.' : '';
        setData({ mode:'answer', text: sommelierFailureMessage(e) + unverified, transient:true });
        setPhase('answer');
      }
    }
  };

  const run = async (query, options = {})=>{
    let Q = (query!=null?query:q).trim(); if(!Q) return;
    const token = guard.next();
    // A typed reply to an open clarification answers it. The engine composes
    // the full question so the plan sees the original intent plus the answer.
    let opts = { ...options };
    if (pending && !opts.clarified && !opts.guidedTaco && !opts.guidedTonight){
      Q = composeClarified(pending, null, Q);
      opts = { ...opts, clarified: pending };
    }
    setPending(null); setQuestion(null);
    setAsked(Q); setQ(Q); track('sommelier_question');

    const plan = planTurn(Q, convRef.current, opts);
    if (!plan) return;
    if (plan.followUp) track('sommelier_followup', { kind: plan.followUp });

    if (plan.kind === 'clarify'){
      setData(null);
      const pend = { ...plan.pending, intent: plan.intent };
      if (plan.question.id === 'taco-filling' && needsTacoGuidance(Q)){ setPending(pend); setPhase('guide-taco'); return; }
      if (plan.question.id === 'tonight-meal'){ setPending(pend); setGuideMeal(null); setPhase('guide-meal'); return; }
      setPending(pend); setQuestion(plan.question); setPhase('clarify');
      return;
    }

    if (plan.kind === 'explanation'){
      // Rule-grounded, local, instant: why / why not / compare / what else /
      // sources / challenge — built only from the answer's own rule and the
      // sources it actually carried.
      const d = { ...plan.answer, mode:'explanation' };
      setData(d); commit(Q, d, { intent:'followup', effectiveQuery:plan.effectiveQuery, followUp:plan.followUp });
      setPhase('explanation');
      return;
    }

    if (plan.kind === 'cellar'){
      // Only the real, non-sample cellar; identical bottles once, with quantity;
      // one lead and at most two alternatives, each explained.
      const picks = cellarPick(plan.pairing, wines, plan.options);
      const d = { mode:'cellar', pairing: plan.pairing, options: plan.options, picks, note: picks.note,
        lead: picks.lead ? { producer:picks.lead.wine.producer, name:picks.lead.wine.name, vintage:picks.lead.wine.vintage } : null };
      setData(d); commit(Q, d, { intent:'followup', context:plan.context, followUp:'cellar' });
      setPhase('cellar');
      return;
    }

    if (plan.kind === 'instant'){
      // EVERY food-pairing question renders useful guidance immediately — the
      // matched dish rule, adjusted for heat or colour where the follow-up
      // asked for it — with research enriching in the background. Only
      // questions that are not pairing questions at all keep research-first
      // waiting: exact bottles, vintages, critics, prices and explainers.
      const h = plan.result;
      const g = plan.guided || {};
      const owned = ownedMatches(h, wines, plan.cellarOptions);
      const initial = { ...instantPairing(h), owned,
        guidedTonight:!!g.guidedTonight, guidedMood:g.mood||null,
        tonightMeal:g.mealLabel||'', leadWithCellar:!!plan.leadWithCellar,
        cellarColor: plan.cellarOptions.color||null, cellarDislike: plan.cellarOptions.dislikeColors||[],
        tonightReason: g.guidedTonight && owned.length
          ? `${tonightReason(g.mealLabel||'your evening', g.mood, !!g.hasMeal)}${h.matched ? ` ${h.primary.why}` : ''}` : '' };
      setData(initial); commit(Q, initial, { intent:plan.intent, effectiveQuery:plan.effectiveQuery, context:plan.context, followUp:plan.followUp });
      setPhase('pairing');
      // With no meal there is no pairing claim to research. The answer is a
      // ranked decision among owned bottles, not a web-generated substitute.
      if (!g.guidedTonight || h.matched){
        const extra = { intent: plan.intent, context: researchContext({ ...convRef.current, context: plan.context }, null), history: historyFor(convRef.current) };
        enrich(plan.effectiveQuery, initial, token, extra);
      } else { const settled={ ...initial, pendingResearch:false }; setData(settled); commit(Q, settled, { intent:plan.intent, effectiveQuery:plan.effectiveQuery, context:plan.context }); }
      return;
    }

    if (plan.kind === 'research'){
      await runResearch(Q, plan, token);
    }
  };

  // Discard the old context and start over. The stored thread is removed for
  // this user; a late response for anything earlier can no longer land.
  const startNew = ()=>{
    guard.invalidate();
    clearConversation(userId);
    persist(emptyConversation());
    setData(null); setPending(null); setQuestion(null); setAsked(''); setQ(''); setGuideMeal(null);
    setPhase('idle');
    setTimeout(()=>inputRef.current && inputRef.current.focus(), 0);
  };

  // Cancel a research round-trip: its response is stale from this moment and
  // the previous answer, if any, comes back untouched.
  const cancel = ()=>{
    guard.invalidate();
    if (!showCurrent(convRef.current)){ setData(null); setAsked(''); setQ(''); setPhase('idle'); }
  };

  const answerClarification = (choice)=>{
    const p = pending;
    if (!p) return;
    if (choice.value === '__research'){ setPending(null); setQuestion(null); return checkSources(); }
    const composed = composeClarified(p, choice.value, null);
    setPending(null); setQuestion(null);
    run(composed, { clarified: p });
  };
  // "Check public sources" from a sources/challenge explanation: research the
  // current question with its full context, expecting evidence.
  const checkSources = ()=>{
    const c = convRef.current;
    const pairing = pairingOf(c.current?.data);
    const base = c.current?.effectiveQuery || c.current?.asked || asked;
    if (!base) return;
    const token = guard.next();
    track('sommelier_followup', { kind:'research' });
    const plan = { kind:'research', intent: c.current?.intent || 'pairing', followUp:'sources',
      question: researchQuestion(`Check public sources for this recommendation: ${base}`, c, pairing),
      effectiveQuery: base, context: c.context, expects: pairing ? 'pairing' : 'answer', fallback:'message', requiresEvidence:false,
      contextText: researchContext(c, pairing) };
    setAsked(`Check public sources: ${base}`);
    runResearch(`Check public sources: ${base}`, plan, token);
  };

  const chooseMeal = (meal)=>{
    if (meal.query === null){
      setGuideMeal(null); setAsked(''); setQ('What should I open tonight with '); setPhase('idle');
      setTimeout(()=>inputRef.current && inputRef.current.focus(), 0);
      return;
    }
    setGuideMeal(meal); setPhase('guide-mood');
  };
  const chooseTaco = (filling)=> run(`Best wine for ${filling.query} tacos`, { guidedTaco:true });
  const chooseMood = (mood)=>{
    const withMeal = guideMeal?.query ? ` with ${guideMeal.query}` : '';
    setPending(null);
    run(`What should I open tonight${withMeal}? I want ${mood.query}.`, {
      guidedTonight:true, mood:mood.id, mealLabel:guideMeal?.label||'No food', hasMeal:!!guideMeal?.query,
    });
  };
  pUE(()=>{ setSaved(false); setShowWhy(false); }, [asked]);
  // A question seeded from Home or the drawer is a deliberate new topic.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useEffect(()=>{ if(initialQuery && !didInit.current){ didInit.current=true; run(initialQuery, { newTopic:true }); } }, [initialQuery]);

  const savePairing = ()=>{
    if (!data || data.mode!=='pairing' || !onSavePairing) return;
    const top = data.owned && data.owned[0];
    onSavePairing({ dish:data.dish, style:(data.primary.deeperTitle||data.primary.grape), why:data.primary.why,
      related_saved_wine_id: top?top.id:null, type: top?top.type:'Red' });
    setSaved(true);
  };

  const focusInput = ()=>{ setQ(''); setTimeout(()=>inputRef.current && inputRef.current.focus(), 0); };
  const insightGrape = data && data.mode==='pairing' ? relevantBuyAgainGrape(wines, data) : null;
  const inConversation = !!(conv && conv.current);
  // Turns before the current exchange, for the thread.
  const priorTurns = (()=>{
    const t = conv?.turns || [];
    if (!inConversation) return [];
    // Drop the trailing exchange (the answer on screen and its question).
    let end = t.length;
    if (end && t[end-1].role==='sommelier') end -= 1;
    if (end && t[end-1].role==='user') end -= 1;
    return t.slice(0, end);
  })();
  const cellarLead = data && data.mode==='pairing' && (data.guidedTonight || data.leadWithCellar) && data.owned && data.owned.length>0;
  const showingAnswer = ['pairing','answer','explanation','cellar'].includes(phase) && data;

  return (
    <div style={{ position:'absolute', inset:0, zIndex:75, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ paddingTop:V_STATUS, borderBottom:`1px solid ${T.line}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px 12px' }}>
          <div style={{ flex:1, display:'flex', alignItems:'center', gap:9, background:T.raised, border:`1.5px solid ${q?T.ink:T.line}`, borderRadius:12, padding:'0 12px', height:46 }}>
            <Icon name="sparkle" size={17} color={T.maybe}/>
            <input ref={inputRef} autoFocus value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') run(); }}
              placeholder={pending ? 'Type your answer…' : inConversation ? 'Ask a follow-up, or something new…' : 'Ask your sommelier…'}
              style={{ flex:1, border:'none', outline:'none', background:'transparent', fontFamily:'var(--sans)', fontSize:15.5, color:T.ink }}/>
            {q && <button onClick={()=>{ setQ(''); if(!showingAnswer && phase!=='clarify' && !phase.startsWith('guide')) setPhase('idle'); }} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex' }}><Icon name="x" size={16} color={T.ink3}/></button>}
          </div>
          {q.trim() && q.trim() !== asked
            ? <button onClick={()=>run()} style={{ background:'none', border:'none', cursor:'pointer', color:T.ink, fontFamily:'var(--sans)', fontSize:15, fontWeight:700 }}>Ask</button>
            : <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:T.ink, fontFamily:'var(--sans)', fontSize:15, fontWeight:600 }}>Done</button>}
        </div>
      </div>

      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'16px 16px 40px' }}>
        {phase==='idle' && <>
          {inConversation && <div style={{ marginBottom:16, padding:'12px 14px', border:`1px solid ${T.line}`, borderRadius:12, background:T.canvas, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.ink3, letterSpacing:'.13em', textTransform:'uppercase' }}>Continuing</div>
              <div style={{ fontSize:13, color:T.ink2, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>“{conv.current.asked}”</div>
            </div>
            <button onClick={()=>showCurrent(convRef.current)} style={{ background:'none', border:`1px solid ${T.line2}`, borderRadius:99, padding:'6px 11px', cursor:'pointer', fontFamily:'var(--sans)', fontSize:12, fontWeight:600, color:T.ink2 }}>Back to it</button>
            <button onClick={startNew} style={{ background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:'var(--sans)', fontSize:12, fontWeight:600, color:T.ink3 }}>New</button>
          </div>}
          <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, marginBottom:12, textTransform:'uppercase' }}>Ask your sommelier</div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {EXAMPLES.map(ex=>(
              <button key={ex} onClick={()=>run(ex, { newTopic:true })} style={{ display:'flex', alignItems:'center', gap:11, textAlign:'left', padding:'13px 14px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:12, cursor:'pointer' }}>
                <Icon name="glass" size={17} color={T.maybe}/>
                <span style={{ flex:1, fontSize:14.5, color:T.ink, fontWeight:540 }}>{ex}</span>
                <Icon name="arrow" size={16} color={T.ink3}/>
              </button>
            ))}
          </div>
          <div style={{ marginTop:18, fontSize:12.5, color:T.ink4, lineHeight:1.5, display:'flex', gap:8 }}><Icon name="sparkle" size={14} color={T.ink4}/> Each answer explains the style and region, then shows the bottles you already own that fit. Ask follow-ups — the sommelier remembers the meal.</div>
        </>}

        {phase==='guide-taco' && <TacoChoices onChoose={chooseTaco}/>}
        {phase==='guide-meal' && <TonightChoices step="meal" meal={guideMeal} onMeal={chooseMeal} onMood={chooseMood}/>}
        {phase==='guide-mood' && <TonightChoices step="mood" meal={guideMeal} onMeal={chooseMeal} onMood={chooseMood}/>}
        {phase==='clarify' && question && <>
          {priorTurns.length>0 && <Thread turns={priorTurns} onNew={startNew}/>}
          <div style={{ fontSize:12.5, color:T.ink3, marginBottom:4 }}>You asked <span style={{ color:T.ink2, fontWeight:600 }}>“{asked}”</span></div>
          <ChoiceQuestion question={question} onChoose={answerClarification}/>
        </>}

        {(phase==='thinking' || phase==='thinking-slow') && <div style={{ paddingTop:60, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <Spinner size={40} stroke={3}/>
          <div style={{ fontSize:15.5, fontWeight:680, marginTop:18 }}>{phase==='thinking-slow'?'Still checking sources…':'Thinking it through…'}</div>
          <div style={{ fontSize:13, color:T.ink3, marginTop:5, textAlign:'center', maxWidth:'30ch' }}>{phase==='thinking-slow'?'Public wine research is taking a little longer than usual.':'Finding the best answer for “'+asked+'”.'}</div>
          <button onClick={cancel} style={{ marginTop:22, padding:'9px 16px', borderRadius:99, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13, fontWeight:600, cursor:'pointer' }}>Cancel</button>
        </div>}

        {phase==='answer' && data && <>
          {priorTurns.length>0 && !data.transient && <Thread turns={priorTurns} onNew={startNew}/>}
          <div style={{ fontSize:13, color:T.ink3, marginBottom:14 }}>You asked <span style={{ color:T.ink, fontWeight:620 }}>“{asked}”</span></div>
          <SommelierMark/>
          <AnswerText text={data.text}/>
          {!data.transient && <BasisLine basis={data.basis} sources={data.sources}/>}
          {!data.transient && <FollowUpBar data={data} onAsk={(v)=>run(v)} onFocusInput={focusInput}/>}
          {data.transient && inConversation && <button onClick={()=>showCurrent(convRef.current)} style={{ width:'100%', marginTop:22, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>Back to the previous answer</button>}
          <button onClick={startNew} style={{ width:'100%', marginTop:10, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>New question</button>
        </>}

        {phase==='explanation' && data && <>
          {priorTurns.length>0 && <Thread turns={priorTurns} onNew={startNew}/>}
          <div style={{ fontSize:13, color:T.ink3, marginBottom:14 }}>You asked <span style={{ color:T.ink, fontWeight:620 }}>“{asked}”</span></div>
          <SommelierMark/>
          <AnswerText text={data.text}/>
          {(data.sources||[]).length>0 && <div style={{ marginTop:14, padding:'12px 14px', background:T.canvas, border:`1px solid ${T.line}`, borderRadius:12 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.13em', textTransform:'uppercase', color:T.ink3, marginBottom:7 }}>Sources used</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {data.sources.map((s,i)=><a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:13, color:T.ink2, lineHeight:1.4 }}>{s.title}</a>)}
            </div>
          </div>}
          <Factors factors={data.factors}/>
          {data.offerResearch && <button onClick={checkSources} style={{ marginTop:14, padding:'10px 14px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:640, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}><Icon name="search" size={14} color={T.ink}/>Check public sources</button>}
          {(data.choices||[]).length>0 && <div style={{ marginTop:16, display:'flex', flexWrap:'wrap', gap:7 }}>
            {data.choices.map((c)=><button key={c.label} onClick={()=> c.value==='__research' ? checkSources() : run(c.value)}
              style={{ padding:'7px 12px', borderRadius:99, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:560, cursor:'pointer' }}>{c.label}</button>)}
          </div>}
          <BasisLine basis={data.basis} sources={[]}/>
          <FollowUpBar data={data} onAsk={(v)=>run(v)} onFocusInput={focusInput}/>
          {pairingOf(conv.current?.data) && <button onClick={()=>{ const p = hydrate(pairingOf(convRef.current.current.data)); setData(p); setPhase('pairing'); }} style={{ width:'100%', marginTop:18, padding:'12px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, cursor:'pointer' }}>Back to the recommendation</button>}
          <button onClick={startNew} style={{ width:'100%', marginTop:10, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>New question</button>
        </>}

        {phase==='cellar' && data && data.picks && <>
          {priorTurns.length>0 && <Thread turns={priorTurns} onNew={startNew}/>}
          <div style={{ fontSize:12.5, color:T.ink3, marginBottom:12 }}>You asked <span style={{ color:T.ink2, fontWeight:600 }}>“{asked}”</span></div>
          <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase', marginBottom:9 }}>From your cellar{data.pairing?.dish ? ` · ${data.pairing.dish}` : ''}</div>
          {data.picks.lead ? <>
            <OwnedRow w={data.picks.lead.wine} onOpen={onOpen}/>
            <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5, marginTop:5 }}>{data.picks.lead.reason}</div>
            {data.picks.alternatives.length>0 && <div style={{ marginTop:20 }}>
              <div style={{ fontSize:15.5, fontWeight:720, letterSpacing:-0.3, marginBottom:9 }}>{data.picks.alternatives.length>1 ? 'Two other good choices' : 'Another good choice'}</div>
              {data.picks.alternatives.map((a)=><div key={a.wine.id} style={{ marginBottom:12 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.maybe, letterSpacing:'.11em', textTransform:'uppercase', marginBottom:5 }}>{a.direction}</div>
                <OwnedRow w={a.wine} onOpen={onOpen}/>
                <div style={{ fontSize:13, color:T.ink2, lineHeight:1.45, marginTop:-3 }}>{a.reason}</div>
              </div>)}
            </div>}
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, marginTop:6 }}>{data.picks.count} fitting wine{data.picks.count>1?'s':''} in your cellar · samples excluded</div>
          </> : <div style={{ padding:'14px', border:`1px dashed ${T.line2}`, borderRadius:12, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>{data.picks.note}</div>}
          <button onClick={()=>{ const p = hydrate({ ...data.pairing, cellarColor:data.options?.color||null, cellarDislike:data.options?.dislikeColors||[] }); setData(p); setPhase('pairing'); }} style={{ width:'100%', marginTop:18, padding:'12px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, cursor:'pointer' }}>{data.picks.lead ? 'Show what to look for if you buy' : 'Show what to look for'}</button>
          <BasisLine basis="cellar" sources={[]}/>
          <FollowUpBar data={data} onAsk={(v)=>run(v)} onFocusInput={focusInput}/>
          <button onClick={startNew} style={{ width:'100%', marginTop:10, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>New question</button>
        </>}

        {phase==='pairing' && data && <>
          {priorTurns.length>0 && <Thread turns={priorTurns} onNew={startNew}/>}
          {/* The question stays visible — someone refining in an aisle needs to
              see what was actually asked. */}
          <div style={{ fontSize:12.5, color:T.ink3, marginBottom:12 }}>You asked <span style={{ color:T.ink2, fontWeight:600 }}>“{asked}”</span></div>

          {data.adjusted==='color' && <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.ink3, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:10 }}>Switched to a {({red:'red',white:'white',rose:'rosé',sparkling:'sparkling',fortified:'fortified'})[data.swappedTo]||data.swappedTo} for {data.dish}</div>}
          {data.adjusted==='heat' && <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.ink3, letterSpacing:'.12em', textTransform:'uppercase', marginBottom:10 }}>Adjusted for the heat</div>}

          {cellarLead && <>
            <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:'.13em', textTransform:'uppercase', marginBottom:9 }}>{data.guidedTonight ? 'Tonight’s bottle' : 'Open this one'}</div>
            <OwnedRow w={data.owned[0]} onOpen={onOpen}/>
            <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5, marginTop:5 }}>{data.tonightReason || bottleReason(data.owned[0], data)}</div>
            {data.owned.length>1 && <div style={{ marginTop:20 }}>
              <div style={{ fontSize:15.5, fontWeight:720, letterSpacing:-0.3, marginBottom:9 }}>{data.owned.length>2 ? 'Two other good choices' : 'Another good choice'}</div>
              {data.owned.slice(1,3).map(w=><div key={w.id} style={{ marginBottom:12 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.maybe, letterSpacing:'.11em', textTransform:'uppercase', marginBottom:5 }}>{alternativeDirection(data.owned[0],w)}</div>
                <OwnedRow w={w} onOpen={onOpen}/>
              </div>)}
            </div>}
          </>}
          {(data.guidedTonight || data.leadWithCellar) && !data.owned.length && <div style={{ marginBottom:16, padding:'13px 14px', border:`1px dashed ${T.line2}`, borderRadius:12, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>
            Nothing you currently own fits closely enough. Here is the style to look for instead.
          </div>}

          {/* ── The ten-second block ──────────────────────────────────
              Recommendation before explanation. Everything a hurried shopper
              needs to locate a bottle sits above this fold; depth is behind
              "Why this?". */}
          {(!data.guidedTonight || !data.owned.length) && <>
          {data.leadWithCellar && data.owned.length>0 && <div style={{ fontSize:15.5, fontWeight:740, letterSpacing:-0.35, marginTop:22, marginBottom:6, paddingTop:18, borderTop:`2px solid ${T.line2}` }}>If you buy instead</div>}
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
          {!data.guidedTonight && !cellarLead && <div style={{ marginTop:20, paddingTop:18, borderTop:`2px solid ${T.line2}` }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:9, marginBottom:11 }}>
              <span style={{ fontSize:16.5, fontWeight:740, letterSpacing:-0.35 }}>In your cellar</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3 }}>{data.owned.length ? `${data.owned.length} match${data.owned.length>1?'es':''}` : 'nothing matching'}</span>
            </div>
            {data.owned.length
              ? data.owned.map(w=> <OwnedRow key={w.id} w={w} onOpen={onOpen}/>)
              : <div style={{ padding:'14px', border:`1px dashed ${T.line2}`, borderRadius:12, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Nothing here fits this one — the shelf guidance above is what to buy.</div>}
          </div>}

          {/* Follow up without starting over: taps and typed challenges take the same path */}
          {!data.guidedTonight && <FollowUpBar data={data} onAsk={(v)=>run(v)} onFocusInput={focusInput}/>}

          {data.guidedTonight && <button onClick={()=>{ setGuideMeal(null); setPending({ id:'tonight-meal', original:asked, intent:'cellar' }); setPhase('guide-meal'); }} style={{ width:'100%', marginTop:18, padding:'12px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, cursor:'pointer' }}>Change the meal or mood</button>}

          {/* Depth, behind one control */}
          {!data.guidedTonight && <button onClick={()=>setShowWhy(v=>!v)} style={{ marginTop:20, background:'none', border:'none', padding:0, cursor:'pointer',
            display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, color:T.ink2 }}>
            <Icon name={showWhy?'x':'sparkle'} size={14} color={T.ink2}/>{showWhy ? 'Hide the detail' : 'The detail'}
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

          <button onClick={startNew} style={{ width:'100%', marginTop:10, padding:'13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>New question</button>
        </>}
      </div>
    </div>
  );
}

export { PairingSearch, DISH_RULES, DEFAULT_RULE, heuristicPairing };
