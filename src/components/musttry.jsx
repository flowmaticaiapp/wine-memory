// musttry.jsx — the dedicated Must Try screen.
//
// Exact, source-recommended bottles lead the page. A bottle renders only when
// one citation verifies its exact identity and another citation actually
// recommends the bottling. The user's real palate data shapes the first group;
// general benchmark bottles still work for a new user. Existing style, grape
// and region guidance remains under Explore next.
import React from 'react';
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { Spinner } from './add.jsx';
import { V_STATUS } from '../lib/constants.js';
import { mustTryGuidance, mustTryExperiences, tasteSummary, displayableCandidates, groupedCandidates, readDismissed, addDismissed, withoutDismissed, PERSONAL_MIN, MUST_TRY_RESEARCH_TIMEOUT_MS } from '../lib/musttry.js';
import { withTimeout } from '../lib/answerflow.js';
import * as wl from '../lib/wishlist.js';
import * as db from '../lib/db.js';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';
import { track } from '../lib/analytics.js';
import { PurchaseTypeSheet } from './wishlist.jsx';

function ExperienceCard({ experience, onFind, searching }){
  return (
    <div style={{ border:`1px solid ${T.line}`, borderRadius:14, background:'#fff', padding:'14px 15px', marginBottom:10 }}>
      <div style={{ fontSize:17, fontWeight:740, color:T.ink, letterSpacing:-0.35, lineHeight:1.2 }}>{experience.title}</div>
      <div style={{ fontSize:12.5, color:T.ink3, marginTop:3 }}>{experience.subtitle}</div>
      <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:9 }}>{experience.why}</div>
      <div style={{ marginTop:10, padding:'9px 10px', borderRadius:10, background:T.canvas }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.11em', textTransform:'uppercase', color:T.maybe }}>Try one of these</div>
        <div style={{ fontSize:12.5, color:T.ink2, lineHeight:1.45, marginTop:3 }}>{experience.lookFor}</div>
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:9 }}>
        {experience.sources.map((source)=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11.5, color:T.ink3 }}>{source.title}</a>)}
      </div>
      <button disabled={searching} onClick={()=>onFind(experience)} style={{ marginTop:11, width:'100%', padding:'11px 12px', borderRadius:11, border:`1px solid ${T.ink}`, background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:13.5, fontWeight:690, cursor:searching?'default':'pointer', opacity:searching?0.65:1 }}>{searching?'Finding a bottle…':'Find a bottle'}</button>
    </div>
  );
}

const EXPERIENCE_SECTION_COPY = {
  palate:{ title:'For your palate', subtitle:'Wine experiences connected to styles and regions you already enjoy.' },
  essential:{ title:'Wine-lover essentials', subtitle:'Reference points that make the wider world of wine easier to understand.' },
  branch:{ title:'Worth branching out for', subtitle:'Distinctive styles that expand your range without being random.' },
};

function ExperienceSection({ kind, experiences, onFind, searchingId }){
  if (!experiences.length) return null;
  const copy = EXPERIENCE_SECTION_COPY[kind];
  return <section style={{ marginTop:kind==='palate'?8:24 }}>
    <div style={{ fontFamily:'var(--serif)', fontSize:22, color:T.ink }}>{copy.title}</div>
    <div style={{ fontSize:12.5, color:T.ink3, lineHeight:1.45, margin:'3px 0 11px' }}>{copy.subtitle}</div>
    {experiences.map((experience)=><ExperienceCard key={experience.id} experience={experience} onFind={onFind} searching={searchingId===experience.id}/>)}
  </section>;
}

function CandidateCard({ c, onSave, onBuy, onDismiss, savedState }){
  const busy = savedState==='buying';
  const bought = savedState==='bought';
  return (
    <div style={{ border:`1px solid ${T.buy}`, background:T.buyBg, borderRadius:14, padding:'13px 15px', marginBottom:10 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.13em', textTransform:'uppercase', color:T.buy }}>Recommended bottle</div>
      <div style={{ fontSize:16, fontWeight:730, color:T.ink, letterSpacing:-0.3, marginTop:5, lineHeight:1.25 }}>{c.producer} {c.name} {c.vintage && <span style={{ color:T.ink2, fontWeight:520 }}>{c.vintage}</span>}</div>
      {!c.vintage && <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.08em', textTransform:'uppercase', color:T.ink3, marginTop:4 }}>Bottling recommendation · vintage not specified</div>}
      {(c.grape || c.region) && <div style={{ fontSize:12.5, color:T.ink2, marginTop:3 }}>{[c.grape, c.region].filter(Boolean).join(' · ')}</div>}
      {c.why && <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:7 }}>{c.why}</div>}
      {c.price && <div style={{ fontSize:12.5, color:T.ink2, marginTop:7 }}>Listed at <b>${c.price.amount}</b> at {c.price.merchant}</div>}
      <div style={{ fontSize:11.5, color:T.ink3, marginTop:8 }}>Recommended by</div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:3 }}>
        {c.recommendationSources.map((s,i)=>(
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11.5, color:T.ink3 }}>{s.title}</a>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:9, marginTop:12 }}>
        <button disabled={busy || bought || savedState==='saved'} onClick={()=>onSave(c)} style={{ padding:'11px 8px', borderRadius:11, border:`1px solid ${savedState==='saved'?T.buy:T.ink}`, background:savedState==='saved'?'#fff':T.ink, color:savedState==='saved'?T.buy:'#fff', fontFamily:'var(--sans)', fontSize:13, fontWeight:680, cursor:(busy||bought||savedState==='saved')?'default':'pointer', opacity:(busy||bought)?0.55:1 }}>
          {savedState==='saved' ? 'On your Wishlist' : 'Save to Wishlist'}</button>
        <button disabled={busy || bought} onClick={()=>onBuy(c)} style={{ padding:'11px 8px', borderRadius:11, border:`1px solid ${T.buy}`, background:bought?T.buyBg:'#fff', color:T.buy, fontFamily:'var(--sans)', fontSize:13, fontWeight:700, cursor:(busy||bought)?'default':'pointer', opacity:busy?0.55:1 }}>
          {busy?'Adding…':bought?'In your cellar':'I bought this'}</button>
      </div>
      {!bought && <button disabled={busy} onClick={()=>onDismiss(c)} style={{ marginTop:8, width:'100%', padding:'8px 10px', border:'none', background:'transparent', color:T.ink3, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:600, cursor:busy?'default':'pointer' }}>Not for me</button>}
    </div>
  );
}

const SECTION_COPY = {
  palate: { title:'For your palate', subtitle:'Verified bottles aligned with the wines you genuinely enjoy.' },
  essential: { title:'Wine-lover essentials', subtitle:'Benchmark bottles recommended by credible sommeliers, educators and wine publications.' },
  branch: { title:'Worth branching out for', subtitle:'Purposeful ways to expand your experience — never random picks.' },
};

function BottleSection({ kind, candidates, onSave, onBuy, onDismiss, saved }){
  if (!candidates.length) return null;
  const copy = SECTION_COPY[kind];
  return <section style={{ marginTop:20 }}>
    <div style={{ fontFamily:'var(--serif)', fontSize:21, color:T.ink }}>{copy.title}</div>
    <div style={{ fontSize:12.5, color:T.ink3, lineHeight:1.45, margin:'3px 0 10px' }}>{copy.subtitle}</div>
    {candidates.map((c)=> <CandidateCard key={wl.bottleKey(c)} c={c} onSave={onSave} onBuy={onBuy} onDismiss={onDismiss} savedState={saved[wl.bottleKey(c)]}/>)}
  </section>;
}

// research: idle | searching | done | none  (none/failed render the same quiet line)
function MustTryScreen({ wines, userId, onClose, onToast, onPurchased }){
  const guidance = React.useMemo(()=> mustTryGuidance(wines), [wines]);
  const experiences = React.useMemo(()=> mustTryExperiences(wines), [wines]);
  const [candidates, setCandidates] = React.useState([]);
  const [research, setResearch] = React.useState('idle');
  const [researchMessage, setResearchMessage] = React.useState('');
  const [saved, setSaved] = React.useState({});          // candidateKey -> 'saved'
  const [dismissed, setDismissed] = React.useState(()=>readDismissed(userId));
  const [pendingBuy, setPendingBuy] = React.useState(null);
  const [selectedExperience, setSelectedExperience] = React.useState(null);
  const researchRun = React.useRef(0);
  const mounted = React.useRef(true);
  const resultsRef = React.useRef(null);

  React.useEffect(()=>{
    mounted.current = true;
    return ()=>{ mounted.current = false; };
  }, []);

  const findBottle = async (experience)=>{
    const token = ++researchRun.current;
    setSelectedExperience(experience);
    setCandidates([]);
    setResearchMessage('');
    track('musttry_find_bottle', { experience:experience.id });
    if (!supabase){ setResearch('unavailable'); return; }
    setResearch('searching');
    const slowTimer = setTimeout(()=>{
      if (token===researchRun.current && mounted.current) setResearch('searching-slow');
    }, 8_000);
    try {
      const r = await withTimeout(invokeAI('must-try', {
        taste:tasteSummary(wines), focus:experience.query,
      }), MUST_TRY_RESEARCH_TIMEOUT_MS);
      clearTimeout(slowTimer);
      if (token!==researchRun.current || !mounted.current) return;
      const ok = displayableCandidates(r);
      setCandidates(ok);
      setResearch(ok.length ? 'done' : (r?.researchStatus === 'unavailable' ? 'unavailable' : 'none'));
      setTimeout(()=>resultsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 0);
    } catch(e){
      clearTimeout(slowTimer);
      if (token!==researchRun.current || !mounted.current) return;
      if (!(e && (e.timeout || e.blocked))) console.error('must-try research failed', e);
      setResearchMessage(e?.message || '');
      setResearch(e?.blocked ? 'blocked' : (e?.timeout ? 'timeout' : 'unavailable'));
      setTimeout(()=>resultsRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 0);
    }
  };

  const visible = withoutDismissed(candidates, dismissed);
  const grouped = groupedCandidates(visible, guidance.personalized);
  const experienceGroups = {
    palate:guidance.personalized ? experiences.filter(e=>e.category==='palate') : [],
    essential:experiences.filter(e=>e.category==='essential'),
    branch:experiences.filter(e=>e.category==='branch'),
  };

  const dismiss = (c)=>{
    // An explicit user reaction — permanent per bottle+vintage (on this
    // device, until the reviewed reactions table exists).
    setDismissed(addDismissed(userId, c));
    track('musttry_not_for_me');
  };

  const ensureWishlistItem = async (c)=>{
    const key = wl.bottleKey(c);
    let existing;
    try { existing = await db.fetchWishlist(); }
    catch(e){
      if (wl.isMissingTable(e)){ onToast && onToast('Wishlist isn’t set up on this database yet'); return null; }
      throw e;
    }
    const duplicate = wl.findDuplicate(existing, c);
    if (duplicate){ setSaved(s=>({ ...s, [key]:'saved' })); return duplicate; }
    return db.insertWishlistItem(wl.mustTryCandidateToWishlistItem(c));
  };

  const save = async (c)=>{
    const key = wl.bottleKey(c);
    try {
      const item = await ensureWishlistItem(c);
      if (!item) return;
      setSaved(s=>({ ...s, [key]:'saved' }));
      track('wishlist_added', { source:'musttry' });
      onToast && onToast('Saved to your Wishlist');
    } catch(e){ console.error('save to wishlist failed', e); onToast && onToast('Could not save to Wishlist'); }
  };

  const doBuy = async (c, chosenType)=>{
    setPendingBuy(null);
    const key = wl.bottleKey(c);
    setSaved(s=>({ ...s, [key]:'buying' }));
    try {
      const item = await ensureWishlistItem(c);
      if (!item){ setSaved(s=>({ ...s, [key]:undefined })); return; }
      const wine = await db.buyWishlistItem(item.id, chosenType);
      setSaved(s=>({ ...s, [key]:'bought' }));
      if (wine && onPurchased) onPurchased(wine);
      track('wishlist_bought', { source:'musttry' });
      onToast && onToast('Added to your cellar as Unopened');
    } catch(e){
      console.error('Must Try purchase failed', e);
      setSaved(s=>({ ...s, [key]:undefined }));
      onToast && onToast('Could not add to your cellar');
    }
  };

  const buy = (c)=>{
    const item = wl.mustTryCandidateToWishlistItem(c);
    if (wl.needsTypeSelection(item)){ setPendingBuy(c); return; }
    doBuy(c, null);
  };

  return (
    <div style={{ position:'absolute', inset:0, zIndex:75, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ paddingTop:V_STATUS, borderBottom:`1px solid ${T.line}`, flexShrink:0 }}>
        <div style={{ display:'grid', gridTemplateColumns:'46px 1fr 46px', alignItems:'center', padding:'4px 10px 10px' }}>
          <button aria-label="Back" onClick={onClose} style={{ border:0, background:'none', padding:8, cursor:'pointer' }}><Icon name="back" size={21} color={T.ink}/></button>
          <div style={{ fontFamily:'var(--serif)', fontSize:20, textAlign:'center', color:T.ink }}>Must Try</div>
          <div/>
        </div>
      </div>

      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'16px 16px 40px' }}>
        {/* Durable, source-backed wine experiences lead. Exact bottles are optional enrichment. */}
        <div style={{ fontSize:12.5, color:T.ink3, lineHeight:1.5, marginBottom:14 }}>
          {guidance.personalized
            ? <>A source-backed roadmap shaped by the {guidance.count} wines you’ve genuinely rated. Choose an experience, then let your sommelier find a bottle.</>
            : <>A source-backed roadmap of regions and styles worth experiencing. Rate {PERSONAL_MIN} wines to add recommendations for your palate.</>}
        </div>

        <ExperienceSection kind="palate" experiences={experienceGroups.palate} onFind={findBottle} searchingId={research.startsWith('searching')?selectedExperience?.id:null}/>
        <ExperienceSection kind="essential" experiences={experienceGroups.essential} onFind={findBottle} searchingId={research.startsWith('searching')?selectedExperience?.id:null}/>
        <ExperienceSection kind="branch" experiences={experienceGroups.branch} onFind={findBottle} searchingId={research.startsWith('searching')?selectedExperience?.id:null}/>

        {selectedExperience && <div ref={resultsRef} style={{ scrollMarginTop:12 }}>
          <section style={{ marginTop:28, paddingTop:20, borderTop:`1px solid ${T.line}` }}>
            <div style={{ fontFamily:'var(--serif)', fontSize:21, color:T.ink }}>Bottle examples for {selectedExperience.title}</div>
            <div style={{ fontSize:12.5, color:T.ink3, lineHeight:1.45, marginTop:3 }}>Shown only when public evidence verifies the exact bottle.</div>
          </section>

        {/* The verified, actually-recommended bottle layer. */}
        {(research==='searching' || research==='searching-slow') && <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:8 }}>
          <Spinner size={13} stroke={2}/>
          <span style={{ fontSize:11.5, color:T.ink4 }}>{research==='searching-slow' ? 'Still checking several credible lists and verifying exact bottles…' : 'Checking credible wine lists and verifying exact bottles…'}</span>
        </div>}

        <BottleSection kind="palate" candidates={grouped.palate} onSave={save} onBuy={buy} onDismiss={dismiss} saved={saved}/>
        <BottleSection kind="essential" candidates={grouped.essential} onSave={save} onBuy={buy} onDismiss={dismiss} saved={saved}/>
        <BottleSection kind="branch" candidates={grouped.branch} onSave={save} onBuy={buy} onDismiss={dismiss} saved={saved}/>

        {research==='none' && <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>
          No list-backed bottles could be fully verified just now. Nothing unverified has been filled in.
        </div>}
        {research==='blocked' && <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>
          {researchMessage || 'Must Try research is temporarily unavailable.'}
        </div>}
        {research==='timeout' && <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>
          Bottle research took too long to finish. Close Must Try and open it again to retry.
        </div>}
        {research==='unavailable' && <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>
          The public bottle-research service is temporarily unavailable. The source-backed roadmap above remains available.
        </div>}
        {research==='done' && visible.length===0 && <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>
          You’ve passed on today’s verified bottle examples.
        </div>}
        </div>}

      </div>
      <PurchaseTypeSheet item={pendingBuy ? wl.mustTryCandidateToWishlistItem(pendingBuy) : null} onChoose={(type)=>doBuy(pendingBuy, type)} onCancel={()=>setPendingBuy(null)}/>
    </div>
  );
}

export { MustTryScreen };
