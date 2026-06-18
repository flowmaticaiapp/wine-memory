// add.jsx — Add hub (FAB sheet), Quick Search Add, Paste Order Import.
// Also home to the shared Panel / Spinner / Shimmer / Stepper used by the other overlays.
// Ported from app/add.jsx.
import React from 'react';
import { T, QUICK_TAGS, SAMPLE_ORDER, parseOrder } from '../lib/data.js';
import { Icon, LabelTile, VerdictPicker, Chip, typeColor, WineBrief } from './ui.jsx';
import { FoundAtFields, spotSource } from './savemode.jsx';
import { BottlePhoto } from './bottle.jsx';
import { IOSKeyboard } from './IOSFrame.jsx';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';

// Map an AI search candidate to the app's wine-draft shape.
function normalizeMatch(m){
  return {
    producer:m.producer, name:m.name, vintage:m.vintage, type:m.type, grape:m.grape||'',
    region:m.region||'', country:m.country||'', family:m.family, flavor:m.flavor,
    pairings:m.pairings||[], loc:(m.lng!=null&&m.lat!=null)?[m.lng,m.lat]:undefined,
    blurb:m.blurb||'', style:m.style||'', tastesLike:m.tastesLike||[], pairsWith:m.pairsWith||[],
  };
}

const { useState: aUS, useEffect: aUE, useRef: aUR } = React;
const A_STATUS_H = 50;

function todayISO(){ return new Date().toISOString().slice(0,10); }
function money2(n){ return n==null?'—':'$'+(Number(n)%1===0?n:Number(n).toFixed(2)); }

// ════════════════════════════════════════════════════════
//  ADD HUB — bottom sheet from the FAB
// ════════════════════════════════════════════════════════
function AddHub({ onClose, onSearch, onImport, onSnap }) {
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:90, background:'rgba(17,17,19,0.34)', display:'flex', alignItems:'flex-end' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:'100%', background:'#fff', borderRadius:'24px 24px 0 0', padding:'10px 18px calc(26px + env(safe-area-inset-bottom))', boxShadow:'0 -10px 44px rgba(0,0,0,0.2)' }}>
        <div style={{ width:38, height:5, borderRadius:99, background:T.line2, margin:'0 auto 18px' }}/>
        <div style={{ fontSize:20, fontWeight:740, letterSpacing:-0.4, marginBottom:4 }}>Remember a wine</div>
        <div style={{ fontSize:13.5, color:T.ink3, marginBottom:18 }}>Snap the label or search by name — we’ll fill in the details.</div>

        <HubOption icon="camera" title="Snap a label" sub="Photograph the bottle — we’ll identify it" primary onClick={onSnap}/>
        <HubOption icon="search" title="Search a bottle" sub="Find it, set your verdict, done in seconds" onClick={onSearch}/>

        {/* secondary: bulk import is a separate, post-purchase task — kept quiet so it
            doesn't compete with the single-bottle "remember / evaluate" intent. */}
        <div style={{ marginTop:6, paddingTop:14, borderTop:`1px solid ${T.line}` }}>
          <button onClick={onImport} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, background:'none', border:'none', cursor:'pointer', padding:'6px' }}>
            <Icon name="paste" size={16} color={T.ink3}/>
            <span style={{ fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, color:T.ink2 }}>Import an order</span>
            <span style={{ fontFamily:'var(--sans)', fontSize:12.5, color:T.ink4 }}>· from a receipt</span>
          </button>
        </div>
      </div>
    </div>
  );
}
function HubOption({ icon, title, sub, primary, onClick }){
  return (
    <button onClick={onClick} style={{ width:'100%', display:'flex', alignItems:'center', gap:14, textAlign:'left', cursor:'pointer', marginBottom:10,
      padding:'16px', borderRadius:16, background:primary?T.ink:'#fff', border:`1px solid ${primary?T.ink:T.line2}` }}>
      <span style={{ width:42, height:42, borderRadius:11, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', background:primary?'rgba(255,255,255,0.16)':T.canvas }}>
        <Icon name={icon} size={21} color={primary?'#fff':T.ink}/>
      </span>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:16, fontWeight:680, color:primary?'#fff':T.ink, letterSpacing:-0.2 }}>{title}</div>
        <div style={{ fontSize:12.5, color:primary?'rgba(255,255,255,0.62)':T.ink3, marginTop:2 }}>{sub}</div>
      </div>
      <Icon name="chevR" size={18} color={primary?'rgba(255,255,255,0.6)':T.ink3}/>
    </button>
  );
}

// ════════════════════════════════════════════════════════
//  QUICK SEARCH ADD — the primary, most polished flow
// ════════════════════════════════════════════════════════
function SearchAdd({ onClose, onSave, verdictVariant }) {
  const [step, setStep] = aUS('search');   // 'search' | 'confirm'
  const [q, setQ] = aUS('');
  const [phase, setPhase] = aUS('idle');    // idle | loading | results | empty | error
  const [results, setResults] = aUS([]);
  const [picked, setPicked] = aUS(null);
  const timer = aUR(null);

  aUE(()=>{
    clearTimeout(timer.current);
    const s = q.trim();
    if (s.length < 2){ setPhase('idle'); return; }
    setPhase('loading');
    timer.current = setTimeout(async ()=>{
      try {
        const data = await invokeAI('wine-search', { query:s });
        const r = (data?.matches || []).map(normalizeMatch);
        setResults(r); setPhase(r.length?'results':'empty');
      } catch(e){ console.error('wine-search failed', e); setPhase('error'); }
    }, 550);
    return ()=>clearTimeout(timer.current);
  },[q]);

  if (step === 'confirm') return <ConfirmCard match={picked} onBack={()=>setStep('search')} onClose={onClose} onSave={onSave} verdictVariant={verdictVariant}/>;

  const pick = (m)=>{ setPicked(m); setStep('confirm'); };
  const manual = ()=> pick({ producer:q.trim().replace(/\b\w/g,c=>c.toUpperCase())||'New wine', name:'', vintage:new Date().getFullYear(), type:'Red', grape:'', region:'', country:'', loc:[2,46], manual:true });

  return (
    <Panel onClose={onClose} title="Search a bottle">
      <div style={{ padding:'14px 16px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, background:T.raised, border:`1.5px solid ${q?T.ink:T.line2}`, borderRadius:13, padding:'0 13px', height:48, transition:'border-color .15s' }}>
          <Icon name="search" size={19} color={T.ink2}/>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Producer, wine, or region…"
            style={{ flex:1, border:'none', outline:'none', background:'transparent', fontFamily:'var(--sans)', fontSize:16.5, color:T.ink }}/>
          {phase==='loading' ? <Spinner/> : q ? <button onClick={()=>setQ('')} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex' }}><Icon name="x" size={17} color={T.ink3}/></button> : null}
        </div>
      </div>

      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'4px 0 8px' }}>
        {phase==='idle' && <SearchIdle/>}
        {phase==='loading' && <SearchSkeleton/>}
        {phase==='error' && <SearchError onRetry={()=>setQ(q+' ')}/>}
        {phase==='empty' && <SearchEmpty q={q} onManual={manual}/>}
        {phase==='results' && (
          <div style={{ padding:'10px 16px 0' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
              <Icon name="sparkle" size={13} color={T.maybe}/> {results.length} MATCHES</div>
            {results.map((m,i)=>(
              <button key={i} onClick={()=>pick(m)} style={{ width:'100%', display:'flex', gap:12, alignItems:'center', padding:'12px 4px', background:'transparent', border:'none', borderBottom:`1px solid ${T.line}`, cursor:'pointer', textAlign:'left' }}>
                <LabelTile wine={m} w={44} h={50} radius={8}/>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.ink3, letterSpacing:0.2 }}>{m.producer.toUpperCase()}</div>
                  <div style={{ fontSize:15, fontWeight:640, color:T.ink, letterSpacing:-0.2 }}>{m.name} <span style={{ color:T.ink3, fontWeight:500 }}>{m.vintage}</span></div>
                  <div style={{ fontSize:12, color:T.ink3, marginTop:1 }}>{m.region} · {m.grape}</div>
                </div>
                <Icon name="plus" size={20} color={T.ink2}/>
              </button>
            ))}
            <button onClick={manual} style={{ width:'100%', textAlign:'center', padding:'15px', marginTop:6, background:'none', border:'none', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:600, cursor:'pointer' }}>Not here? Add it manually</button>
          </div>
        )}
      </div>
      <IOSKeyboard dark={false}/>
    </Panel>
  );
}

function SearchIdle(){
  return (
    <div style={{ padding:'30px 26px' }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, marginBottom:14 }}>TRY SEARCHING</div>
      {['Produttori Barbaresco','Bandol rosé','Beaujolais gamay'].map((s,i)=>(
        <div key={i} style={{ display:'flex', alignItems:'center', gap:11, padding:'12px 0', borderBottom:`1px solid ${T.line}` }}>
          <Icon name="search" size={16} color={T.ink4}/><span style={{ fontSize:14.5, color:T.ink2 }}>{s}</span>
        </div>
      ))}
      <div style={{ marginTop:22, fontSize:13, color:T.ink4, lineHeight:1.5, display:'flex', gap:8 }}>
        <Icon name="sparkle" size={15} color={T.ink4}/> We’ll fill in the region, grape, and vintage automatically — you just add the verdict.</div>
    </div>
  );
}
function SearchSkeleton(){
  return (
    <div style={{ padding:'14px 16px' }}>
      {[0,1,2].map(i=>(
        <div key={i} style={{ display:'flex', gap:12, alignItems:'center', padding:'12px 4px', borderBottom:`1px solid ${T.line}` }}>
          <Shimmer w={44} h={50} r={8}/>
          <div style={{ flex:1 }}><Shimmer w={90} h={9} r={4}/><div style={{ height:7 }}/><Shimmer w={150} h={13} r={4}/><div style={{ height:6 }}/><Shimmer w={110} h={9} r={4}/></div>
        </div>
      ))}
    </div>
  );
}
function SearchEmpty({ q, onManual }){
  return (
    <div style={{ textAlign:'center', padding:'56px 40px' }}>
      <div style={{ width:50, height:50, borderRadius:99, background:T.raised, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}><Icon name="search" size={22} color={T.ink3}/></div>
      <div style={{ fontSize:16, fontWeight:680 }}>No matches for “{q}”</div>
      <div style={{ fontSize:13.5, color:T.ink3, marginTop:6, lineHeight:1.5 }}>Check the spelling, or add this wine manually.</div>
      <button onClick={onManual} style={{ marginTop:18, padding:'12px 20px', borderRadius:11, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:14, fontWeight:650, cursor:'pointer' }}>Add manually</button>
    </div>
  );
}
function SearchError({ onRetry }){
  return (
    <div style={{ textAlign:'center', padding:'56px 40px' }}>
      <div style={{ width:50, height:50, borderRadius:99, background:T.noBg, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:14 }}><Icon name="x" size={22} color={T.no}/></div>
      <div style={{ fontSize:16, fontWeight:680 }}>Search is temporarily unavailable</div>
      <div style={{ fontSize:13.5, color:T.ink3, marginTop:6, lineHeight:1.5 }}>Try again.</div>
      <button onClick={onRetry} style={{ marginTop:18, padding:'12px 20px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:14, fontWeight:650, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}><Icon name="reset" size={16} color={T.ink}/> Retry</button>
    </div>
  );
}

// ── Confirm card (verdict REQUIRED) ──────────────────────
function ConfirmCard({ match, onBack, onClose, onSave, verdictVariant }) {
  // Searched/scanned wines save as To Try — verdict + drinking context come
  // later, on Wine Detail, once the bottle's actually been opened.
  const [note, setNote] = aUS('');
  const [spot, setSpot] = aUS(null);
  const [otherSpot, setOtherSpot] = aUS('');

  const save = ()=>{
    onSave({ ...match, id:'w'+Date.now(), note, tags:[], grape:match.grape||'', price:match.price??null, added:todayISO(), sample:false,
      verdict:'totry', where:null, source: spotSource(spot, otherSpot) || 'Quick add' });
  };

  return (
    <Panel onClose={onClose} title="Add to collection" onBack={onBack} backLabel="Search">
      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'18px 18px 40px' }}>
        {/* wine identity card */}
        <div style={{ display:'flex', gap:15, padding:'16px', background:T.canvas, borderRadius:16, border:`1px solid ${T.line}` }}>
          <BottlePhoto wine={match} w={64} h={80} rounded={11}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.ink3, letterSpacing:0.3 }}>{(match.producer||'').toUpperCase()}</div>
            <div style={{ fontSize:18, fontWeight:720, color:T.ink, letterSpacing:-0.4, lineHeight:1.15, marginTop:2 }}>{match.name||'Untitled wine'}</div>
            <div style={{ fontSize:13, color:T.ink2, marginTop:4 }}>{match.vintage} · {match.type}{match.grape?' · '+match.grape:''}</div>
            {match.region && <div style={{ fontSize:12.5, color:T.ink3, marginTop:4, display:'flex', alignItems:'center', gap:4 }}><Icon name="pin" size={13} color={T.ink3}/> {match.region}</div>}
            {!match.manual && <div style={{ marginTop:7, display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--mono)', fontSize:10, color:T.maybe, letterSpacing:0.3 }}><Icon name="sparkle" size={12} color={T.maybe}/> AI-FILLED</div>}
          </div>
        </div>

        {/* sommelier brief — what it is & why you'd enjoy it */}
        <WineBrief wine={match}/>

        {/* where you found it + optional note */}
        <div style={{ height:22 }}/>
        <FoundAtFields spot={spot} setSpot={setSpot} otherSpot={otherSpot} setOtherSpot={setOtherSpot} note={note} setNote={setNote}/>
      </div>

      {/* save bar */}
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
        <button onClick={save} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', cursor:'pointer',
          background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700 }}>Add to Cellar</button>
      </div>
    </Panel>
  );
}

// ════════════════════════════════════════════════════════
//  PASTE ORDER IMPORT — major workflow
// ════════════════════════════════════════════════════════
function OrderImport({ onClose, onAddMany, onViewToTry }) {
  const [step, setStep] = aUS('paste');   // paste | parsing | review | done
  const [text, setText] = aUS('');
  const [error, setError] = aUS('');
  const [items, setItems] = aUS([]);
  const [savedWines, setSavedWines] = aUS([]);
  const timer = aUR(null);

  const parse = ()=>{
    const parsed = parseOrder(text);
    if (parsed.length === 0){ setError('We couldn’t find any wines in that text. Paste a full order confirmation or receipt.'); return; }
    setError(''); setStep('parsing');
    timer.current = setTimeout(()=>{ setItems(parsed.map(p=>({ ...p, include:true }))); setStep('review'); }, 1100);
  };
  aUE(()=>()=>clearTimeout(timer.current),[]);

  if (step === 'parsing') return <Panel onClose={onClose} title="Reading your order"><ParsingState/></Panel>;

  if (step === 'done') return (
    <Panel onClose={onClose} title="Added to To Try">
      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'28px 22px 0' }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center' }}>
          <div style={{ width:60, height:60, borderRadius:99, background:T.buyBg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Icon name="check" size={30} color={T.buy} stroke={2.6}/></div>
          <div style={{ fontSize:20, fontWeight:760, letterSpacing:-0.4 }}>{savedWines.length} {savedWines.length===1?'wine':'wines'} added to To Try</div>
          <div style={{ fontSize:13.5, color:T.ink3, marginTop:7, lineHeight:1.5, maxWidth:'32ch' }}>They’re in your Collection under the <b>To Try</b> filter. Rate each one after you open the bottle.</div>
        </div>
        <div style={{ marginTop:24, display:'flex', flexDirection:'column', gap:9 }}>
          {savedWines.slice(0,6).map((w,i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', border:`1px solid ${T.line}`, borderRadius:12 }}>
              <BottlePhoto wine={w} w={38} h={46} rounded={8}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13.5, fontWeight:640, color:T.ink, letterSpacing:-0.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.name} <span style={{ color:T.ink3, fontWeight:500 }}>{w.vintage}</span></div>
                <div style={{ fontSize:11.5, color:T.ink3 }}>{[w.grape,w.region].filter(Boolean).join(' · ')}</div>
              </div>
              <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, color:T.totry, fontWeight:640, background:T.totryBg, padding:'3px 9px', borderRadius:6 }}>To Try</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff', display:'flex', gap:10 }}>
        <button onClick={onClose} style={{ flexShrink:0, padding:'15px 18px', borderRadius:13, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14.5, fontWeight:620, cursor:'pointer' }}>Done</button>
        <button onClick={onViewToTry} style={{ flex:1, padding:'15px', borderRadius:13, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:15, fontWeight:700, cursor:'pointer' }}>View To Try</button>
      </div>
    </Panel>
  );

  if (step === 'review'){
    const chosen = items.filter(i=>i.include);
    const total = chosen.reduce((s,i)=>s+i.qty,0);
    const setItem = (idx,patch)=> setItems(arr=> arr.map((it,i)=> i===idx?{...it,...patch}:it));
    const confirm = ()=>{
      const wines = chosen.map((it,i)=>({ id:'w'+Date.now()+i, producer:it.producer, name:it.name, vintage:it.vintage, type:it.type,
        grape:it.grape||'', region:(it.region||'').split(',')[0], country:(it.region||'').split(',').slice(-1)[0].trim(), loc:it.loc,
        verdict:'totry', tags:[], note:'', where:'home', source:'Pasted order', price:it.price, added:todayISO(), sample:false }));
      onAddMany(wines); setSavedWines(wines); setStep('done');
    };
    return (
      <Panel onClose={onClose} title="Review order" onBack={()=>setStep('paste')} backLabel="Paste">
        <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'14px 16px 30px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 14px', background:T.totryBg, borderRadius:12, marginBottom:14 }}>
            <Icon name="sparkle" size={17} color={T.totry}/>
            <span style={{ fontSize:13.5, color:T.totry, fontWeight:560, lineHeight:1.4 }}>We found <b>{items.length} {items.length===1?'wine':'wines'}</b>. Each will be saved to <b>To Try</b> — rate it after you open the bottle.</span>
          </div>
          {items.map((it,idx)=>(
            <div key={idx} style={{ display:'flex', gap:12, padding:'13px 0', borderBottom:`1px solid ${T.line}`, opacity:it.include?1:0.45, transition:'opacity .15s' }}>
              <button onClick={()=>setItem(idx,{ include:!it.include })} style={{ flexShrink:0, width:24, height:24, borderRadius:7, marginTop:2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                background:it.include?T.ink:'#fff', border:`1.5px solid ${it.include?T.ink:T.line2}` }}>{it.include && <Icon name="check" size={15} color="#fff"/>}</button>
              <BottlePhoto wine={it} w={46} h={58} rounded={9}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.ink3, letterSpacing:0.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(it.producer||'').toUpperCase()}</div>
                <div style={{ fontSize:14.5, fontWeight:660, color:T.ink, letterSpacing:-0.2, lineHeight:1.25 }}>{it.name} <span style={{ color:T.ink3, fontWeight:500 }}>{it.vintage}</span></div>
                <div style={{ fontSize:12, color:T.ink3, marginTop:3 }}>{[it.grape, it.region].filter(Boolean).join(' · ')}</div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:6 }}>
                  <span style={{ fontFamily:'var(--mono)', fontSize:12, color:T.ink2 }}>{money2(it.price)}</span>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontSize:11, color:T.totry, fontWeight:640, background:T.totryBg, padding:'3px 9px', borderRadius:6 }}><span style={{ width:6, height:6, borderRadius:99, background:T.totry }}/>To Try</span>
                  {it.dup && <span style={{ fontSize:11, color:T.maybe, fontWeight:600 }}>· in collection</span>}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
                <Stepper value={it.qty} onChange={v=>setItem(idx,{ qty:v })}/>
              </div>
            </div>
          ))}
        </div>
        <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
          <button disabled={!total} onClick={confirm} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', cursor:total?'pointer':'default',
            background:total?T.ink:T.raised, color:total?'#fff':T.ink4, fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700 }}>
            {total? `Save ${chosen.length} ${chosen.length===1?'wine':'wines'} to To Try` : 'Select at least one wine'}</button>
        </div>
      </Panel>
    );
  }

  // step paste
  return (
    <Panel onClose={onClose} title="Paste an order">
      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'16px 16px 30px' }}>
        <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5, marginBottom:14 }}>Paste the confirmation email or receipt from Total Wine, a winery, or any retailer. We’ll pull out every bottle.</div>
        <textarea value={text} onChange={e=>{ setText(e.target.value); setError(''); }} placeholder="Paste your order text here…" rows={9}
          style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${error?T.no:T.line2}`, borderRadius:14, padding:'14px', fontFamily:'var(--mono)', fontSize:12.5, lineHeight:1.55, color:T.ink, resize:'none', outline:'none', background:T.canvas }}/>
        {error && <div style={{ marginTop:10, display:'flex', gap:8, alignItems:'flex-start', color:T.no, fontSize:13, lineHeight:1.45 }}><Icon name="x" size={16} color={T.no} style={{ flexShrink:0, marginTop:1 }}/> {error}</div>}
        {!text && <button onClick={()=>setText(SAMPLE_ORDER)} style={{ marginTop:12, display:'inline-flex', alignItems:'center', gap:7, padding:'9px 14px', borderRadius:10, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13, fontWeight:600, cursor:'pointer' }}><Icon name="paste" size={15} color={T.ink2}/> Paste a sample order</button>}
      </div>
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
        <button disabled={!text.trim()} onClick={parse} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', cursor:text.trim()?'pointer':'default',
          background:text.trim()?T.ink:T.raised, color:text.trim()?'#fff':T.ink4, fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <Icon name="sparkle" size={18} color={text.trim()?'#fff':T.ink4}/> Find wines</button>
      </div>
    </Panel>
  );
}

function ParsingState(){
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40 }}>
      <div style={{ position:'relative', width:56, height:56, marginBottom:22 }}>
        <Spinner size={56} stroke={3}/>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkle" size={22} color={T.maybe}/></div>
      </div>
      <div style={{ fontSize:17, fontWeight:700, letterSpacing:-0.3 }}>Reading your order…</div>
      <div style={{ fontSize:13.5, color:T.ink3, marginTop:6 }}>Finding producers, vintages, and regions</div>
      <div style={{ width:200, marginTop:24, display:'flex', flexDirection:'column', gap:9 }}>
        {[0,1,2].map(i=> <div key={i} style={{ display:'flex', gap:10, alignItems:'center' }}><Shimmer w={30} h={34} r={6}/><div style={{ flex:1 }}><Shimmer w={'80%'} h={9} r={4}/><div style={{ height:6 }}/><Shimmer w={'55%'} h={8} r={4}/></div></div>)}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  SHARED: Panel shell, Spinner, Shimmer, Stepper
// ════════════════════════════════════════════════════════
function Panel({ children, title, onClose, onBack, backLabel }){
  return (
    <div style={{ position:'absolute', inset:0, zIndex:85, background:'#fff', display:'flex', flexDirection:'column', animation:'wmSlideUp .26s cubic-bezier(.2,.8,.2,1)' }}>
      <div style={{ paddingTop:A_STATUS_H, flexShrink:0, borderBottom:`1px solid ${T.line}` }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 10px 10px' }}>
          {onBack
            ? <button onClick={onBack} style={{ display:'flex', alignItems:'center', gap:2, background:'none', border:'none', cursor:'pointer', color:T.ink, fontFamily:'var(--sans)', fontSize:15.5, fontWeight:560, padding:6 }}><Icon name="back" size={20} color={T.ink}/> {backLabel||'Back'}</button>
            : <div style={{ width:64 }}/>}
          <div style={{ fontSize:15.5, fontWeight:680, letterSpacing:-0.2 }}>{title}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:6, display:'flex' }}><Icon name="x" size={22} color={T.ink2}/></button>
        </div>
      </div>
      {children}
    </div>
  );
}
function Spinner({ size=20, stroke=2.4 }){
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation:'wmSpin .8s linear infinite' }}>
    <circle cx="12" cy="12" r="9" fill="none" stroke={T.line2} strokeWidth={stroke}/>
    <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={T.ink} strokeWidth={stroke} strokeLinecap="round"/></svg>;
}
function Shimmer({ w, h, r=6 }){ return <div style={{ width:w, height:h, borderRadius:r, background:`linear-gradient(90deg, ${T.raised} 25%, #eaeaec 50%, ${T.raised} 75%)`, backgroundSize:'200% 100%', animation:'wmShimmer 1.3s infinite' }}/>; }
function Stepper({ value, onChange }){
  return (
    <div style={{ display:'flex', alignItems:'center', gap:2, background:T.raised, borderRadius:9, padding:3 }}>
      <button onClick={()=>onChange(Math.max(1,value-1))} style={{ width:26, height:26, borderRadius:7, border:'none', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 2px rgba(0,0,0,0.06)' }}><Icon name="down" size={14} color={T.ink2}/></button>
      <span style={{ minWidth:20, textAlign:'center', fontFamily:'var(--mono)', fontSize:13.5, fontWeight:600 }}>{value}</span>
      <button onClick={()=>onChange(value+1)} style={{ width:26, height:26, borderRadius:7, border:'none', background:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 1px 2px rgba(0,0,0,0.06)' }}><Icon name="up" size={14} color={T.ink2}/></button>
    </div>
  );
}

export { AddHub, SearchAdd, OrderImport, Panel, Spinner, Shimmer, Stepper };
