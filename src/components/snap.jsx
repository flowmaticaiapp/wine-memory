// snap.jsx — Snap a Label (V1): capture a real photo + AI-identify + confirm + save.
// The photo becomes the wine's actual image. Identification uses Claude from the
// label text you confirm (vision OCR is the future upgrade). Honest no-match fallback.
// Ported from app/snap.jsx.
import React from 'react';
import { T } from '../lib/data.js';
import { Icon, VerdictPicker, typeColor } from './ui.jsx';
import { Panel, Spinner } from './add.jsx';

const { useState: snUS, useRef: snUR } = React;
const snToday = ()=> new Date().toISOString().slice(0,10);
const WINE_TYPES = ['Red','White','Rosé','Sparkling'];

async function snapIdentify(text, vintage){
  if (window.claude && window.claude.complete){
    try {
      const prompt = `Identify this wine from the words written on its label. Give your best structured guess.\nLabel text: "${text}"${vintage?`\nVintage on label: ${vintage}`:''}\nRespond with ONLY JSON: {"found":true|false,"producer":"","name":"","vintage":<number or "NV">,"type":"Red|White|Rosé|Sparkling|Dessert|Fortified","grape":"","region":"","country":""}\nFill the fields you're reasonably confident about. If you cannot identify the specific wine, set "found":false and fill only what is certain (e.g. type).`;
      const j = JSON.parse((await window.claude.complete(prompt)).match(/\{[\s\S]*\}/)[0]);
      return j;
    } catch(e){ /* fall through */ }
  }
  const words = text.trim().split(/\s+/);
  return { found:false, producer:words.slice(0,2).join(' '), name:text.trim(), vintage:vintage||'NV', type:'Red', grape:'', region:'', country:'' };
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

function SnapLabel({ onClose, onSave, verdictVariant='expressive' }){
  const [step, setStep] = snUS('capture');   // capture | label | identifying | confirm
  const [photo, setPhoto] = snUS(null);
  const [labelText, setLabelText] = snUS('');
  const [vin, setVin] = snUS('');
  const [f, setF] = snUS(null);               // identified fields (editable)
  const [verdict, setVerdict] = snUS(null);
  const [note, setNote] = snUS('');
  const fileRef = snUR(null);

  const onFile = (e)=>{ const file=e.target.files&&e.target.files[0]; if(!file) return;
    const rd=new FileReader(); rd.onload=()=>{ setPhoto(rd.result); setStep('label'); }; rd.readAsDataURL(file); };

  const identify = async ()=>{
    setStep('identifying');
    const r = await snapIdentify(labelText, vin);
    setF({ found:!!r.found, producer:r.producer||'', name:r.name||labelText, vintage:r.vintage||(vin||'NV'),
      type:WINE_TYPES.includes(r.type)?r.type:'Red', grape:r.grape||'', region:r.region||'', country:r.country||'' });
    setStep('confirm');
  };

  const save = ()=>{
    onSave({ id:'w'+Date.now(), photo, producer:f.producer||'Unknown producer', name:f.name||'Unknown wine',
      vintage:f.vintage||'NV', type:f.type, grape:f.grape, region:f.region, country:f.country, loc:[2,46],
      verdict: verdict||'totry', tags:[], note, where:'home', source:'Snap a label', price:null, added:snToday(), sample:false });
  };

  // ── CAPTURE ──
  if (step==='capture') return (
    <Panel onClose={onClose} title="Snap a label">
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'24px 22px' }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display:'none' }}/>
        <button onClick={()=>fileRef.current && fileRef.current.click()} style={{ width:'100%', aspectRatio:'4/5', maxHeight:360, borderRadius:18, border:`2px dashed ${T.line2}`, background:T.canvas, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:14 }}>
          <span style={{ width:64, height:64, borderRadius:99, background:'#fff', border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(17,17,19,0.06)' }}><Icon name="camera" size={30} color={T.ink}/></span>
          <span style={{ fontSize:16, fontWeight:700, color:T.ink }}>Take a photo of the label</span>
          <span style={{ fontSize:13, color:T.ink3 }}>or choose one from your library</span>
        </button>
        <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5, display:'flex', gap:8 }}>
          <Icon name="sparkle" size={15} color={T.ink4}/> Your photo becomes the bottle’s image. Next, confirm a few words on the label so we can identify the wine.</div>
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

  // ── LABEL TEXT ──
  if (step==='label') return (
    <Panel onClose={onClose} title="Snap a label" onBack={()=>setStep('capture')} backLabel="Retake">
      <div style={{ flex:1, overflow:'auto', padding:'18px 20px 30px' }}>
        {photo && <div style={{ display:'flex', justifyContent:'center', marginBottom:18 }}><img src={photo} alt="label" style={{ maxHeight:200, maxWidth:'70%', borderRadius:14, border:`1px solid ${T.line2}`, objectFit:'cover' }}/></div>}
        <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase', marginBottom:9 }}>What does the label say?</div>
        <input autoFocus value={labelText} onChange={e=>setLabelText(e.target.value)} placeholder="e.g. Domaine Tempier Bandol"
          style={{ width:'100%', boxSizing:'border-box', height:48, border:`1.5px solid ${labelText?T.ink:T.line2}`, borderRadius:12, padding:'0 13px', fontFamily:'var(--sans)', fontSize:16, color:T.ink, outline:'none' }}/>
        <div style={{ marginTop:11, fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase', marginBottom:9 }}>Vintage <span style={{ textTransform:'none', letterSpacing:0, color:T.ink4 }}>· optional</span></div>
        <input value={vin} onChange={e=>setVin(e.target.value.replace(/[^0-9]/g,'').slice(0,4))} placeholder="2021" inputMode="numeric"
          style={{ width:120, boxSizing:'border-box', height:44, border:`1px solid ${T.line2}`, borderRadius:10, padding:'0 12px', fontFamily:'var(--mono)', fontSize:15, color:T.ink, outline:'none' }}/>
        <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5 }}>Auto-reading the label from the photo arrives with the camera/vision update. For now, a couple of words is all we need.</div>
      </div>
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
        <button onClick={identify} disabled={!labelText.trim()} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', cursor:labelText.trim()?'pointer':'default', background:labelText.trim()?T.ink:T.raised, color:labelText.trim()?'#fff':T.ink4, fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <Icon name="sparkle" size={18} color={labelText.trim()?'#fff':T.ink4}/> Identify wine</button>
      </div>
    </Panel>
  );

  // ── CONFIRM ──
  const tc = typeColor(f.type);
  return (
    <Panel onClose={onClose} title="Confirm & save" onBack={()=>setStep('label')} backLabel="Back">
      <div style={{ flex:1, overflow:'auto', padding:'18px 20px 30px' }}>
        {/* photo + status */}
        <div style={{ display:'flex', gap:14, alignItems:'center', marginBottom:16 }}>
          {photo && <img src={photo} alt="" style={{ width:64, height:80, borderRadius:11, objectFit:'cover', border:`1px solid ${T.line2}`, flexShrink:0 }}/>}
          <div style={{ display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:10.5, letterSpacing:0.3, padding:'5px 10px', borderRadius:7,
            background:f.found?T.buyBg:T.maybeBg, color:f.found?T.buy:T.maybe }}>
            <Icon name={f.found?'sparkle':'edit'} size={13} color={f.found?T.buy:T.maybe}/>{f.found?'AI IDENTIFIED — CONFIRM':'NOT SURE — ADD DETAILS'}</div>
        </div>

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

        {/* verdict */}
        <div style={{ height:12 }}/>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase', marginBottom:11 }}>Your verdict</div>
        <VerdictPicker value={verdict==='totry'?null:verdict} onChange={setVerdict} variant={verdictVariant}/>
        <button onClick={()=>setVerdict('totry')} style={{ width:'100%', marginTop:9, padding:'11px', borderRadius:11, cursor:'pointer', background:verdict==='totry'?T.totryBg:'#fff', border:`1px solid ${verdict==='totry'?T.totry:T.line2}`, color:verdict==='totry'?T.totry:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:7 }}>
          <Icon name="clock" size={15} color={verdict==='totry'?T.totry:T.ink3}/> Haven’t tried it yet — add to To Try</button>

        {/* note */}
        <div style={{ height:18 }}/>
        <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase', marginBottom:9 }}>Note <span style={{ textTransform:'none', letterSpacing:0, color:T.ink4 }}>· optional</span></div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="Where you were, who you were with…"
          style={{ width:'100%', boxSizing:'border-box', border:`1px solid ${T.line2}`, borderRadius:12, padding:'12px', fontFamily:'var(--sans)', fontSize:14.5, lineHeight:1.5, color:T.ink, resize:'none', outline:'none' }}/>
      </div>
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
        <button onClick={save} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700, cursor:'pointer' }}>Save to collection</button>
      </div>
    </Panel>
  );
}

export { SnapLabel };
