// snap.jsx — Snap a Label: capture a real photo, identify the wine with Claude
// vision (via the `label-identify` Edge Function), confirm/edit, then save. The
// photo becomes the bottle's image. Low confidence offers Search a Bottle instead.
// Ported from app/snap.jsx.
import React from 'react';
import { T } from '../lib/data.js';
import { Icon, VerdictPicker, typeColor, WineBrief } from './ui.jsx';
import { Panel, Spinner } from './add.jsx';
import { FoundAtFields, spotSource } from './savemode.jsx';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';
import { track } from '../lib/analytics.js';
import { fileToJpegDataUrl } from '../lib/image.js';

const { useState: snUS, useRef: snUR } = React;
const snToday = ()=> new Date().toISOString().slice(0,10);
const WINE_TYPES = ['Red','White','Rosé','Sparkling'];

// Claude-vision identification via the Edge Function. Throws on failure so the
// caller can fall back to manual entry / Search a Bottle.
async function identifyLabel(image){
  return await invokeAI('label-identify', { image });
}

function Field({ label, value, onChange, placeholder }){
  return (
    <div style={{ marginBottom:11 }}>
      <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase', marginBottom:5 }}>{label}</div>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        style={{ width:'100%', boxSizing:'border-box', height:42, border:`1px solid ${T.line2}`, borderRadius:10, padding:'0 12px', fontFamily:'var(--sans)', fontSize:14.5, color:T.ink, outline:'none' }}/>
    </div>
  );
}

function SnapLabel({ onClose, onSave, onSearchInstead, verdictVariant='expressive' }){
  const [step, setStep] = snUS('capture');   // capture | identifying | confirm
  const [photo, setPhoto] = snUS(null);
  const [f, setF] = snUS(null);               // identified fields (editable)
  const [spot, setSpot] = snUS(null);
  const [otherSpot, setOtherSpot] = snUS('');
  const [note, setNote] = snUS('');
  const fileRef = snUR(null);

  // Photo → downscaled JPEG → Claude-vision identify → confirm/edit. On failure,
  // still land on confirm with blank fields so the user can type or search instead.
  const onFile = async (e)=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setStep('identifying'); track('label_scan');
    try {
      const image = await fileToJpegDataUrl(file);
      setPhoto(image);
      const r = await identifyLabel(image);
      setF({ found:!!r.found, confidence:r.confidence||'low', producer:r.producer||'', name:r.name||'',
        vintage:r.vintage||'NV', type:WINE_TYPES.includes(r.type)?r.type:(r.type||'Red'), grape:r.grape||'',
        region:r.region||'', country:r.country||'', lat:r.lat, lng:r.lng,
        blurb:r.blurb||'', style:r.style||'', tastesLike:r.tastesLike||[], pairsWith:r.pairsWith||[] });
      setStep('confirm');
    } catch(err){
      console.error('label-identify failed', err);
      setF({ found:false, confidence:'low', producer:'', name:'', vintage:'NV', type:'Red', grape:'', region:'', country:'', error:true });
      setStep('confirm');
    }
  };

  const save = ()=>{
    const hasLoc = f && f.lng!=null && f.lat!=null;
    const base = { id:'w'+Date.now(), photo, producer:f.producer||'Unknown producer', name:f.name||'Unknown wine',
      vintage:f.vintage||'NV', type:f.type, grape:f.grape, region:f.region, country:f.country, ...(hasLoc?{loc:[f.lng,f.lat]}:{}),
      blurb:f.blurb||'', style:f.style||'', tastesLike:f.tastesLike||[], pairsWith:f.pairsWith||[],
      tags:[], note, price:null, added:snToday(), sample:false };
    onSave({ ...base, verdict:'totry', where:null, source: spotSource(spot, otherSpot) || 'Snap a label' });
  };
  const lowConfidence = f && (!f.found || f.confidence==='low' || f.error);

  // ── CAPTURE ──
  if (step==='capture') return (
    <Panel onClose={onClose} title="Snap a label">
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'24px 22px' }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display:'none' }}/>
        <button onClick={()=>fileRef.current && fileRef.current.click()} style={{ width:'100%', aspectRatio:'4/5', maxHeight:360, borderRadius:18, border:`2px dashed ${T.line2}`, background:T.canvas, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
          <span style={{ width:64, height:64, borderRadius:99, background:'#fff', border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(17,17,19,0.06)' }}><Icon name="camera" size={30} color={T.ink}/></span>
          <span style={{ fontSize:16, fontWeight:700, color:T.ink }}>Take a photo of the label</span>
          <span style={{ fontSize:13, color:T.ink3 }}>or choose one from your library</span>
        </button>
        <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5, display:'flex', gap:8 }}>
          <Icon name="sparkle" size={15} color={T.ink4}/> Your photo becomes the bottle’s image — we’ll read the label with AI to identify the wine. You can confirm the details next.</div>
      </div>
    </Panel>
  );

  // ── IDENTIFYING ──
  if (step==='identifying') return (
    <Panel onClose={onClose} title="Snap a label">
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40 }}>
        <div style={{ position:'relative', width:54, height:54, marginBottom:20 }}><Spinner size={54} stroke={3}/><div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkle" size={22} color={T.maybe}/></div></div>
        <div style={{ fontSize:16.5, fontWeight:720 }}>Reading the label…</div>
        <div style={{ fontSize:13, color:T.ink3, marginTop:6 }}>Identifying the wine and its region</div>
      </div>
    </Panel>
  );

  // ── CONFIRM ──
  const tc = typeColor(f.type);
  const status = (f.found && f.confidence==='high') ? { bg:T.buyBg, fg:T.buy, icon:'sparkle', label:'AI SUGGESTION — CONFIRM DETAILS' }
    : (f.found && f.confidence==='medium') ? { bg:T.maybeBg, fg:T.maybe, icon:'sparkle', label:'AI SUGGESTION — CHECK CAREFULLY' }
    : { bg:T.maybeBg, fg:T.maybe, icon:'edit', label: f.error ? 'COULDN’T READ — ADD DETAILS' : 'COULDN’T IDENTIFY — ADD DETAILS' };
  return (
    <Panel onClose={onClose} title="Confirm & save" onBack={()=>setStep('capture')} backLabel="Retake">
      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'18px 20px 30px' }}>
        {/* photo + status */}
        <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:16 }}>
          {photo && <img src={photo} alt="" style={{ width:64, height:80, borderRadius:11, objectFit:'cover', border:`1px solid ${T.line2}`, flexShrink:0 }}/>}
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:10.5, letterSpacing:0.3, padding:'5px 10px', borderRadius:7,
            background:status.bg, color:status.fg }}>
            <Icon name={status.icon} size={13} color={status.fg}/>{status.label}</div>
        </div>

        {/* low-confidence: offer Search a Bottle instead */}
        {lowConfidence && onSearchInstead && (
          <button onClick={onSearchInstead} style={{ width:'100%', marginBottom:16, padding:'12px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
            <Icon name="search" size={16} color={T.ink}/> Search by name instead</button>
        )}

        {/* sommelier brief — what it is & why you'd enjoy it */}
        <div style={{ marginBottom:16 }}><WineBrief wine={f}/></div>

        <Field label="Producer" value={f.producer} onChange={v=>setF({...f,producer:v})} placeholder="Producer"/>
        <Field label="Wine name" value={f.name} onChange={v=>setF({...f,name:v})} placeholder="Wine name"/>
        <div style={{ display:'flex', gap:11 }}>
          <div style={{ width:120 }}><Field label="Vintage" value={f.vintage} onChange={v=>setF({...f,vintage:v})} placeholder="NV"/></div>
          <div style={{ flex:1 }}><Field label="Grape" value={f.grape} onChange={v=>setF({...f,grape:v})} placeholder="Grape"/></div>
        </div>
        {/* type */}
        <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase', marginBottom:6 }}>Type</div>
        <div style={{ display:'flex', gap:7, marginBottom:11 }}>
          {WINE_TYPES.map(ty=>{ const on=f.type===ty; const c=typeColor(ty); return (
            <button key={ty} onClick={()=>setF({...f,type:ty})} style={{ flex:1, padding:'9px 4px', borderRadius:9, cursor:'pointer', background:on?c:'#fff', border:`1px solid ${on?c:T.line2}`, color:on?'#fff':T.ink2, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:on?660:540 }}>{ty}</button> ); })}
        </div>
        <div style={{ display:'flex', gap:11 }}>
          <div style={{ flex:1 }}><Field label="Region" value={f.region} onChange={v=>setF({...f,region:v})} placeholder="Region"/></div>
          <div style={{ flex:1 }}><Field label="Country" value={f.country} onChange={v=>setF({...f,country:v})} placeholder="Country"/></div>
        </div>

        {/* where you found it + optional note */}
        <div style={{ height:14 }}/>
        <FoundAtFields spot={spot} setSpot={setSpot} otherSpot={otherSpot} setOtherSpot={setOtherSpot} note={note} setNote={setNote}/>
      </div>
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
        <button onClick={save} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', cursor:'pointer',
          background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700 }}>Add to Cellar</button>
      </div>
    </Panel>
  );
}

export { SnapLabel };
