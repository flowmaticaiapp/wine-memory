// scan.jsx — Scan Multiple Bottles (V1): one photo → detect bottles → review → batch add.
// Detection from a group photo needs vision (future); V1 demonstrates the review-before-save
// flow with confidence tiers. Never silently invents — every bottle is confirmed.
// Ported from app/scan.jsx.
import React from 'react';
import { T, DETECTED_BOTTLES } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { BottlePhoto } from './bottle.jsx';
import { Panel, Spinner } from './add.jsx';

const { useState: scUS, useRef: scUR } = React;
const scToday = ()=> new Date().toISOString().slice(0,10);
const CONF = { high:{label:'Confident',color:T.buy,bg:T.buyBg}, medium:{label:'Likely',color:T.maybe,bg:T.maybeBg}, low:{label:'Check this',color:T.no,bg:T.noBg} };

function Legend({ color, label }){ return (
  <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontSize:11.5, color:T.ink2, fontWeight:540 }}>
    <span style={{ width:9, height:9, borderRadius:99, background:color }}/>{label}</span>
); }

function ConfBadge({ level }){ const c=CONF[level]||CONF.medium; return (
  <span style={{ display:'inline-flex', alignItems:'center', gap:5, fontFamily:'var(--mono)', fontSize:10, fontWeight:600, letterSpacing:0.2, padding:'3px 8px', borderRadius:6, background:c.bg, color:c.color, textTransform:'uppercase' }}>
    <Icon name={level==='low'?'edit':'check'} size={11} color={c.color} stroke={2.4}/>{c.label}</span>
); }

function ScanBottles({ onClose, onAddMany, sampleSrc }){
  const [step, setStep] = scUS('capture');   // capture | detecting | review
  const [photo, setPhoto] = scUS(null);
  const [items, setItems] = scUS([]);
  const [editIdx, setEditIdx] = scUS(-1);
  const fileRef = scUR(null); const timer = scUR(null);

  const detect = (src)=>{ setPhoto(src); setStep('detecting');
    const isSample = src===sampleSrc;
    timer.current = setTimeout(()=>{
      setItems(DETECTED_BOTTLES.map((b,i)=>({ ...b, include:true, photo: isSample ? ('app/scan/b'+(i+1)+'.jpg') : src })));
      setStep('review');
    }, 1400);
  };
  const onFile = (e)=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; const rd=new FileReader(); rd.onload=()=>detect(rd.result); rd.readAsDataURL(f); };
  const setItem = (i,patch)=> setItems(arr=>arr.map((it,j)=>j===i?{...it,...patch}:it));

  const chosen = items.filter(i=>i.include);
  const lowOpen = items.some(i=>i.include && i.confidence==='low');

  const confirm = ()=>{
    const wines = chosen.map((it,i)=>({ id:'w'+Date.now()+i, producer:it.producer, name:it.name, vintage:it.vintage, type:it.type,
      grape:it.grape, region:(it.region||'').split(',')[0], country:(it.region||'').split(',').slice(-1)[0].trim(), loc:it.loc,
      photo:it.photo, verdict:'totry', tags:[], note:'', where:'home', source:'Scanned bottles', price:null, added:scToday(), sample:false }));
    onAddMany(wines);
  };

  // ── CAPTURE ──
  if (step==='capture') return (
    <Panel onClose={onClose} title="Scan multiple bottles">
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'24px 22px' }}>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display:'none' }}/>
        <button onClick={()=>fileRef.current&&fileRef.current.click()} style={{ width:'100%', aspectRatio:'4/3', maxHeight:300, borderRadius:18, border:`2px dashed ${T.line2}`, background:T.canvas, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:13 }}>
          <span style={{ width:62, height:62, borderRadius:99, background:'#fff', border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(17,17,19,0.06)' }}><Icon name="camera" size={28} color={T.ink}/></span>
          <span style={{ fontSize:16, fontWeight:700, color:T.ink }}>Photograph your bottles</span>
          <span style={{ fontSize:13, color:T.ink3, textAlign:'center', maxWidth:'26ch' }}>Line them up on a counter and fit them all in one shot.</span>
        </button>
        {sampleSrc && <button onClick={()=>detect(sampleSrc)} style={{ marginTop:12, display:'inline-flex', alignSelf:'center', alignItems:'center', gap:8, padding:'10px 16px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:600, cursor:'pointer' }}><Icon name="sparkle" size={15} color={T.maybe}/> Try the sample photo</button>}
        <div style={{ marginTop:16, fontSize:12.5, color:T.ink4, lineHeight:1.5, display:'flex', gap:8 }}><Icon name="sparkle" size={15} color={T.ink4}/> We detect each bottle and identify it — you confirm everything before it’s saved. Bottle detection uses vision in the full app.</div>
      </div>
    </Panel>
  );

  // ── DETECTING ──
  if (step==='detecting') return (
    <Panel onClose={onClose} title="Scan multiple bottles">
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:36 }}>
        {photo && <img src={photo} alt="" style={{ width:'100%', maxHeight:180, objectFit:'cover', borderRadius:14, border:`1px solid ${T.line2}`, marginBottom:22 }}/>}
        <div style={{ position:'relative', width:46, height:46, marginBottom:16 }}><Spinner size={46} stroke={3}/><div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkle" size={19} color={T.maybe}/></div></div>
        <div style={{ fontSize:16.5, fontWeight:720 }}>Detecting bottles…</div>
        <div style={{ fontSize:13, color:T.ink3, marginTop:6 }}>Reading each label and identifying the wine</div>
      </div>
    </Panel>
  );

  // ── REVIEW ──
  return (
    <Panel onClose={onClose} title="Review bottles" onBack={()=>setStep('capture')} backLabel="Rescan">
      <div style={{ flex:1, overflow:'auto', padding:'14px 16px 20px' }}>
        {photo && <img src={photo} alt="" style={{ width:'100%', height:96, objectFit:'cover', borderRadius:12, border:`1px solid ${T.line2}`, marginBottom:13 }}/>}
        <div style={{ padding:'13px 14px', background:T.canvas, border:`1px solid ${T.line}`, borderRadius:13, marginBottom:14 }}>
          <div style={{ fontSize:13.5, color:T.ink, fontWeight:680, lineHeight:1.4 }}>We identified {items.length} bottles from your photo.</div>
          <div style={{ fontSize:12.5, color:T.ink2, lineHeight:1.45, marginTop:4 }}>Check the details below and fix anything wrong, then save. The colour tag shows how sure we are each one is right:</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:'7px 14px', marginTop:10 }}>
            <Legend color={T.buy} label="Confident — looks right"/>
            <Legend color={T.maybe} label="Likely — worth a glance"/>
            <Legend color={T.no} label="Check this — tap Edit"/>
          </div>
        </div>

        {items.map((it,idx)=>{ const editing=editIdx===idx; const low=it.confidence==='low'; return (
          <div key={idx} style={{ border:`1px solid ${low&&it.include?CONF.low.color+'66':T.line}`, borderRadius:14, marginBottom:10, overflow:'hidden', opacity:it.include?1:0.5, transition:'opacity .15s' }}>
            <div style={{ display:'flex', gap:11, padding:'12px', alignItems:'flex-start' }}>
              <button onClick={()=>setItem(idx,{include:!it.include})} style={{ flexShrink:0, width:24, height:24, borderRadius:7, marginTop:2, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', background:it.include?T.ink:'#fff', border:`1.5px solid ${it.include?T.ink:T.line2}` }}>{it.include && <Icon name="check" size={15} color="#fff"/>}</button>
              <BottlePhoto wine={it} w={40} h={50} rounded={8}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14.5, fontWeight:660, color:T.ink, letterSpacing:-0.2, lineHeight:1.25 }}>{it.name} <span style={{ color:T.ink3, fontWeight:500 }}>{it.vintage}</span></div>
                <div style={{ fontSize:12, color:T.ink3, marginTop:2 }}>{[it.grape,it.region].filter(Boolean).join(' · ')}</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:7 }}>
                  <ConfBadge level={it.confidence}/>
                  <button onClick={()=>setEditIdx(editing?-1:idx)} style={{ background:'none', border:'none', color:T.ink2, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--sans)' }}>{editing?'Done':'Edit'}</button>
                  <button onClick={()=>setItem(idx,{include:false})} style={{ background:'none', border:'none', color:T.ink3, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--sans)' }}>Remove</button>
                </div>
              </div>
            </div>
            {editing && <div style={{ padding:'0 12px 13px', display:'flex', flexDirection:'column', gap:8 }}>
              {[['producer','Producer'],['name','Wine name'],['vintage','Vintage'],['grape','Grape'],['region','Region']].map(([k,l])=>(
                <input key={k} value={it[k]} onChange={e=>setItem(idx,{[k]:e.target.value})} placeholder={l}
                  style={{ width:'100%', boxSizing:'border-box', height:38, border:`1px solid ${T.line2}`, borderRadius:9, padding:'0 11px', fontFamily:'var(--sans)', fontSize:13.5, color:T.ink, outline:'none' }}/>
              ))}
            </div>}
          </div>
        ); })}
      </div>
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
        {lowOpen && <div style={{ fontSize:11.5, color:T.no, marginBottom:8, display:'flex', alignItems:'center', gap:6 }}><Icon name="edit" size={13} color={T.no}/> One bottle needs a quick check — tap Edit to confirm it before saving.</div>}
        <button disabled={!chosen.length} onClick={confirm} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', cursor:chosen.length?'pointer':'default', background:chosen.length?T.ink:T.raised, color:chosen.length?'#fff':T.ink4, fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700 }}>
          {chosen.length? `Add ${chosen.length} ${chosen.length===1?'wine':'wines'} to collection` : 'Select at least one bottle'}</button>
      </div>
    </Panel>
  );
}

export { ScanBottles };
