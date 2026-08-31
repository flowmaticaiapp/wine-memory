// musttry.jsx — the dedicated Must Try screen.
//
// Opens INSTANTLY with personalized style, grape and region guidance built
// from the user's real palate data (samples excluded — same engine as the
// Palate screen). That guidance is the recommendation: the screen is complete
// and useful when research is slow, unavailable, or verifies nothing.
//
// Exact bottles are researched in the BACKGROUND through the must-try Edge
// Function's evidence registry. A bottle renders only when producer, cuvée and
// vintage came back verified with cited sources; a price renders only with a
// current merchant source, otherwise it is omitted. Verified bottles sit in
// their own clearly-labelled section — distinguished from guidance by design,
// not by warnings.
import React from 'react';
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { Spinner } from './add.jsx';
import { V_STATUS } from '../lib/constants.js';
import { mustTryGuidance, tasteSummary, displayableCandidates, readDismissed, addDismissed, withoutDismissed, PERSONAL_MIN } from '../lib/musttry.js';
import { withTimeout } from '../lib/answerflow.js';
import * as wl from '../lib/wishlist.js';
import * as db from '../lib/db.js';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';
import { track } from '../lib/analytics.js';

const { useState: mUS, useEffect: mUE, useRef: mUR, useMemo: mUM } = React;

const KIND_LABEL = { grape:'A grape you love', region:'A region you love', explore:'Expand your range' };

function GuidanceCard({ card }){
  return (
    <div style={{ border:`1px solid ${T.line}`, borderRadius:14, background:'#fff', padding:'13px 15px', marginBottom:9 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.13em', textTransform:'uppercase', color:T.maybe }}>{KIND_LABEL[card.kind] || 'Worth trying'}</div>
      <div style={{ fontSize:16.5, fontWeight:720, color:T.ink, letterSpacing:-0.3, marginTop:4 }}>{card.title}</div>
      <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:4 }}>{card.why}</div>
    </div>
  );
}

function CandidateCard({ c, onSave, onDismiss, savedState }){
  return (
    <div style={{ border:`1px solid ${T.buy}`, background:T.buyBg, borderRadius:14, padding:'13px 15px', marginBottom:10 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:'.13em', textTransform:'uppercase', color:T.buy }}>Source-verified bottle</div>
      <div style={{ fontSize:16, fontWeight:730, color:T.ink, letterSpacing:-0.3, marginTop:5, lineHeight:1.25 }}>{c.producer} {c.name} <span style={{ color:T.ink2, fontWeight:520 }}>{c.vintage}</span></div>
      {(c.grape || c.region) && <div style={{ fontSize:12.5, color:T.ink2, marginTop:3 }}>{[c.grape, c.region].filter(Boolean).join(' · ')}</div>}
      {c.why && <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:7 }}>{c.why}</div>}
      {c.price && <div style={{ fontSize:12.5, color:T.ink2, marginTop:7 }}>Listed at <b>${c.price.amount}</b> at {c.price.merchant}</div>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px', marginTop:8 }}>
        {c.sources.map((s,i)=>(
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11.5, color:T.ink3 }}>{s.title}</a>
        ))}
      </div>
      <div style={{ display:'flex', gap:9, marginTop:12 }}>
        <button disabled={!!savedState} onClick={()=>onSave(c)} style={{ flex:1, padding:'11px', borderRadius:11, border:'none', background:savedState==='saved'?'#fff':T.ink, color:savedState==='saved'?T.buy:'#fff', fontFamily:'var(--sans)', fontSize:13.5, fontWeight:680, cursor:savedState?'default':'pointer' }}>
          {savedState==='saved' ? 'On your Wishlist' : 'Save to Wishlist'}</button>
        <button onClick={()=>onDismiss(c)} style={{ flexShrink:0, padding:'11px 13px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13, fontWeight:600, cursor:'pointer' }}>Not for me</button>
      </div>
    </div>
  );
}

// research: idle | searching | done | none  (none/failed render the same quiet line)
function MustTryScreen({ wines, userId, onClose, onToast }){
  const guidance = mUM(()=> mustTryGuidance(wines), [wines]);
  const [candidates, setCandidates] = mUS([]);
  const [research, setResearch] = mUS('idle');
  const [saved, setSaved] = mUS({});          // candidateKey -> 'saved'
  const [dismissed, setDismissed] = mUS(null); // loaded on mount (storage is not render-safe)
  const ran = mUR(false);

  mUE(()=>{
    if (ran.current) return; ran.current = true;
    setDismissed(readDismissed(userId));
    const taste = tasteSummary(wines);
    if (!taste || !supabase){ setResearch('none'); return; }
    let on = true;
    setResearch('searching');
    (async()=>{
      try {
        const r = await withTimeout(invokeAI('must-try', { taste }));
        const ok = displayableCandidates(r);
        if (!on) return;
        setCandidates(ok);
        setResearch(ok.length ? 'done' : 'none');
      } catch(e){
        if (!(e && (e.timeout || e.blocked))) console.error('must-try research failed', e);
        if (on) setResearch('none');
      }
    })();
    return ()=>{ on = false; };
  }, []);

  const visible = withoutDismissed(candidates, dismissed);

  const dismiss = (c)=>{
    // An explicit user reaction — permanent per bottle+vintage (on this
    // device, until the reviewed reactions table exists).
    setDismissed(addDismissed(userId, c));
    track('musttry_not_for_me');
  };

  const save = async (c)=>{
    const key = wl.bottleKey(c);
    try {
      let existing = [];
      try { existing = await db.fetchWishlist(); }
      catch(e){ if (wl.isMissingTable(e)) { onToast && onToast('Wishlist isn’t set up on this database yet'); return; } throw e; }
      if (wl.findDuplicate(existing, c)){ setSaved(s=>({ ...s, [key]:'saved' })); onToast && onToast('Already on your Wishlist'); return; }
      await db.insertWishlistItem({
        producer:c.producer, name:c.name, vintage:c.vintage, grape:c.grape, region:c.region,
        type:'', why:c.why, recommendedBy:'', priceExpected: c.price ? c.price.amount : null,
        source:'musttry', evidence:c.sources,
      });
      setSaved(s=>({ ...s, [key]:'saved' }));
      track('wishlist_added', { source:'musttry' });
      onToast && onToast('Saved to your Wishlist');
    } catch(e){ console.error('save to wishlist failed', e); onToast && onToast('Could not save to Wishlist'); }
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
        {/* The guidance layer — instant, personalized, complete on its own. */}
        <div style={{ fontSize:12.5, color:T.ink3, lineHeight:1.5, marginBottom:14 }}>
          {guidance.personalized
            ? <>Based on the {guidance.count} wines you’ve actually rated — samples never count.</>
            : <>General starting points for now — rate {PERSONAL_MIN} wines and this page becomes yours.</>}
        </div>
        {guidance.cards.map((card,i)=> <GuidanceCard key={i} card={card}/>)}

        {/* The verified-bottle layer — optional, additive, clearly its own. */}
        {research==='searching' && <div style={{ marginTop:16, display:'flex', alignItems:'center', gap:8 }}>
          <Spinner size={13} stroke={2}/>
          <span style={{ fontSize:11.5, color:T.ink4 }}>Researching exact bottles from public wine sources…</span>
        </div>}

        {visible.length>0 && <div style={{ marginTop:18 }}>
          <div style={{ fontSize:16, fontWeight:740, letterSpacing:-0.3, color:T.ink, marginBottom:10 }}>Verified bottles to look for</div>
          {visible.map((c)=> <CandidateCard key={wl.bottleKey(c)} c={c} onSave={save} onDismiss={dismiss} savedState={saved[wl.bottleKey(c)]}/>)}
        </div>}

        {research==='none' && guidance.personalized && <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>
          No exact bottles verified just now — the styles and regions above are the recommendation.
        </div>}
        {research==='done' && visible.length===0 && <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>
          You’ve passed on today’s verified bottles — the styles and regions above still stand.
        </div>}
      </div>
    </div>
  );
}

export { MustTryScreen };
