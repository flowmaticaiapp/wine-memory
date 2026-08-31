// visual.jsx — Collection (verdict-filtered, image-led), browse shelves, detail.
// Ported from app/visual.jsx.
import React from 'react';
import { T, VERDICTS, FLAVOR_FAMILIES, PAIRING_GROUPS } from '../lib/data.js';
import { Icon, VerdictBadge, VerdictPicker, typeColor, WineBrief } from './ui.jsx';
import { BottlePhoto, FlavorBars } from './bottle.jsx';
import { V_STATUS, V_NAV, CONTENT_W, famOf, FAM_NEUTRAL_HUE, clamp } from '../lib/constants.js';
import { fileToJpegDataUrl } from '../lib/image.js';
import { isFavorite } from '../lib/favorites.js';

const { useState: vUS, useMemo: vUM, useEffect: vUE, useRef: vUR } = React;

function SampleTag(){
  return <span style={{ position:'absolute', top:8, right:8, fontFamily:'var(--mono)', fontSize:9, fontWeight:600, letterSpacing:0.4, color:'#fff', background:'rgba(17,17,19,0.62)', padding:'3px 7px', borderRadius:6, textTransform:'uppercase' }}>Sample</span>;
}

// ── image-led grid card ──
function WCard({ wine, onOpen, w }){
  return (
    <button onClick={onOpen} style={{ textAlign:'left', border:`1px solid ${T.line}`, background:'#fff', borderRadius:16, overflow:'hidden', cursor:'pointer', display:'flex', flexDirection:'column', padding:0 }}>
      <div style={{ position:'relative' }}>
        <BottlePhoto wine={wine} w={w} h={Math.round(w*1.06)} rounded={0} flat/>
        {wine.sample && <SampleTag/>}
      </div>
      <div style={{ padding:'11px 12px 13px' }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.ink3, letterSpacing:0.25, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{(wine.producer||'').toUpperCase()}</div>
        <div style={{ fontSize:14, fontWeight:680, color:T.ink, letterSpacing:-0.2, lineHeight:1.25, marginTop:2, ...clamp(2) }}>{wine.name}</div>
        <div style={{ fontSize:11.5, color:T.ink3, marginTop:4 }}>{wine.vintage} · {wine.grape||wine.type}</div>
        <div style={{ fontSize:11.5, color:T.ink3, marginTop:1, ...clamp(1) }}>{wine.region}{wine.country?', '+wine.country:''}</div>
        <div style={{ marginTop:9 }}><VerdictBadge id={wine.verdict} variant="expressive" size="sm"/></div>
      </div>
    </button>
  );
}

// ── horizontal shelf card ──
function ShelfCard({ wine, onOpen }){
  return (
    <button onClick={onOpen} style={{ width:150, flexShrink:0, border:`1px solid ${T.line}`, background:'#fff', borderRadius:14, overflow:'hidden', padding:0, cursor:'pointer', textAlign:'left', display:'flex', flexDirection:'column' }}>
      <div style={{ position:'relative' }}>
        <BottlePhoto wine={wine} w={150} h={150} rounded={0} flat/>
        {wine.sample && <SampleTag/>}
      </div>
      <div style={{ padding:'9px 11px 11px' }}>
        <div style={{ fontSize:13, fontWeight:670, color:T.ink, letterSpacing:-0.2, lineHeight:1.25, ...clamp(2) }}>{wine.name}</div>
        <div style={{ fontSize:11, color:T.ink3, marginTop:3 }}>{wine.vintage} · {wine.grape||wine.type}</div>
        <div style={{ marginTop:8 }}><VerdictBadge id={wine.verdict} variant="expressive" size="sm"/></div>
      </div>
    </button>
  );
}
function Shelf({ title, sub, accent, wines, onOpen }){
  if (!wines.length) return null;
  return (
    <div style={{ marginTop:24 }}>
      <div style={{ padding:'0 16px', display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
        {accent!=null && <span style={{ width:10, height:10, borderRadius:3, background:`hsl(${accent} 55% 52%)` }}/>}
        <div>
          <div style={{ fontSize:17, fontWeight:740, letterSpacing:-0.4, lineHeight:1.1 }}>{title}</div>
          {sub && <div style={{ fontSize:12, color:T.ink3, marginTop:1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display:'flex', gap:13, overflowX:'auto', padding:'0 16px 4px' }}>
        {wines.map(w=> <ShelfCard key={w.id} wine={w} onOpen={()=>onOpen(w.id)}/>)}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  COLLECTION
// ════════════════════════════════════════════════════════
const ORGANIZE = [['grid','Grid'],['flavor','Flavor'],['region','Region'],['pairing','Pairing']];
function Collection({ wines, cols, filter, setFilter, onOpen, onSearch, hasSamples, onClearSamples }){
  const [org, setOrg] = vUS('grid');
  const [query, setQuery] = vUS('');
  const counts = vUM(()=>{ const c={all:wines.length,totry:0,buy:0,maybe:0,no:0}; wines.forEach(w=>c[w.verdict]++); return c; },[wines]);
  const base = vUM(()=>{ let r = filter==='all'? wines : wines.filter(w=>w.verdict===filter);
    if (query.trim()){ const s=query.toLowerCase(); r = r.filter(w=>[w.producer,w.name,w.region,w.country,w.grape,w.note].join(' ').toLowerCase().includes(s)); }
    return r; },[wines,filter,query]);
  // Wines added since flavor families stopped being AI-invented have no family.
  // They get an explicit "Not yet described" group rather than silently
  // disappearing from this view — unknown is a state, not an absence.
  const byFamily = vUM(()=>{
    const known = FLAVOR_FAMILIES.map(f=>({ f, list:base.filter(w=>w.family===f.id) })).filter(x=>x.list.length);
    const rest = base.filter(w=>!FLAVOR_FAMILIES.some(f=>f.id===w.family));
    return rest.length
      ? [...known, { f:{ id:'unknown', label:'Not yet described', sub:'No verified flavor profile for these bottles', hue:0 }, list:rest }]
      : known;
  },[base]);
  const byRegion = vUM(()=>{ const m={}; base.forEach(w=>{ const k=(w.country||w.region.split(',').slice(-1)[0].trim()); (m[k]=m[k]||[]).push(w); }); return Object.entries(m).sort((a,b)=>b[1].length-a[1].length); },[base]);
  const byPairing = vUM(()=> PAIRING_GROUPS.map(g=>({ g, list:base.filter(w=>(w.pairings||[]).some(p=>g.match.includes(p))) })).filter(x=>x.list.length),[base]);
  const colW = Math.floor((CONTENT_W - 12*(cols-1))/cols);

  const chips = [['all','All',T.ink],['totry','Unopened',VERDICTS.totry.color],['buy','Buy Again',VERDICTS.buy.color],['maybe','Maybe',VERDICTS.maybe.color],['no','No',VERDICTS.no.color]];

  return (
    <div style={{ height:'100%', overflowX:'hidden', overflowY:'auto', background:'#fff' }}>
      <div style={{ position:'sticky', top:0, zIndex:30, background:'rgba(255,255,255,0.92)', backdropFilter:'blur(14px)', WebkitBackdropFilter:'blur(14px)', borderBottom:`1px solid ${T.line}` }}>
        <div style={{ paddingTop:V_STATUS }}/>
        <div style={{ padding:'6px 16px 0' }}>
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
            <h1 style={{ margin:0, fontSize:27, fontWeight:780, letterSpacing:-0.9 }}>My Cellar</h1>
            <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:T.ink3 }}>{counts.all} wines</div>
          </div>
          {/* search */}
          <div style={{ display:'flex', alignItems:'center', gap:9, marginTop:12, background:T.raised, border:`1px solid ${T.line}`, borderRadius:12, padding:'0 12px', height:44 }}>
            <Icon name="search" size={18} color={T.ink3}/>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your collection…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontFamily:'var(--sans)', fontSize:14.5, color:T.ink }}/>
            {query && <button onClick={()=>setQuery('')} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex' }}><Icon name="x" size={16} color={T.ink3}/></button>}
          </div>
          {/* primary verdict filters — all visible, wraps as needed */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:7, padding:'12px 0 11px' }}>
            {chips.map(([id,label,col])=>{ const on=filter===id; const n=counts[id]; return (
              <button key={id} onClick={()=>setFilter(id)} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px', borderRadius:99, cursor:'pointer', background:on?col:'#fff', border:`1px solid ${on?col:T.line2}`, color:on?'#fff':T.ink2, fontFamily:'var(--sans)', fontSize:13, fontWeight:on?660:540 }}>
                {id!=='all' && <span style={{ width:7, height:7, borderRadius:99, background:on?'#fff':col }}/>}{label}
                <span style={{ fontFamily:'var(--mono)', fontSize:11, opacity:on?0.85:0.55 }}>{n}</span>
              </button> ); })}
          </div>
          {/* organize (secondary) */}
          <div style={{ display:'flex', gap:7, padding:'0 0 11px' }}>
            <span style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.ink4, alignSelf:'center', letterSpacing:0.3, textTransform:'uppercase', marginRight:2 }}>View</span>
            {ORGANIZE.map(([id,label])=>{ const on=org===id; return (
              <button key={id} onClick={()=>setOrg(id)} style={{ padding:'5px 11px', borderRadius:8, cursor:'pointer', background:on?T.ink:'transparent', border:`1px solid ${on?T.ink:T.line2}`, color:on?'#fff':T.ink2, fontFamily:'var(--sans)', fontSize:12, fontWeight:on?620:520 }}>{label}</button> ); })}
          </div>
        </div>
      </div>

      <div style={{ paddingBottom:V_NAV+90 }}>
        {/* sample banner */}
        {hasSamples && <div style={{ margin:'14px 16px 2px', display:'flex', alignItems:'center', gap:11, padding:'11px 14px', background:T.canvas, border:`1px solid ${T.line}`, borderRadius:12 }}>
          <Icon name="sparkle" size={16} color={T.ink3}/>
          <span style={{ flex:1, fontSize:12.5, color:T.ink2, lineHeight:1.4 }}>Some bottles are <b>sample data</b> to show how Collection works.</span>
          <button onClick={onClearSamples} style={{ flexShrink:0, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:640, color:T.ink, background:'#fff', border:`1px solid ${T.line2}`, borderRadius:8, padding:'6px 11px', cursor:'pointer' }}>Clear samples</button>
        </div>}

        {base.length===0 ? <EmptyFilter filter={filter}/> :
          org==='grid' ? (
            <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:12, padding:'14px 16px 0' }}>
              {base.map(w=> <WCard key={w.id} wine={w} w={colW} onOpen={()=>onOpen(w.id)}/>)}
            </div>
          ) : org==='flavor' ? <div style={{ paddingTop:8 }}>{byFamily.map(({f,list})=> <Shelf key={f.id} title={f.label} sub={f.sub} accent={f.hue} wines={list} onOpen={onOpen}/>)}</div>
            : org==='region' ? <div style={{ paddingTop:8 }}>{byRegion.map(([r,list])=> <Shelf key={r} title={r} sub={`${list.length} ${list.length===1?'bottle':'bottles'}`} accent={null} wines={list} onOpen={onOpen}/>)}</div>
            : <div style={{ paddingTop:8 }}>{byPairing.map(({g,list})=> <Shelf key={g.id} title={g.label} sub={`${list.length} ${list.length===1?'match':'matches'}`} accent={null} wines={list} onOpen={onOpen}/>)}</div>}
      </div>
    </div>
  );
}
function EmptyFilter({ filter }){
  const v = VERDICTS[filter];
  return (
    <div style={{ textAlign:'center', padding:'72px 44px' }}>
      <div style={{ width:54, height:54, borderRadius:99, background:T.raised, display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Icon name={filter==='totry'?'clock':'bottle'} size={24} color={T.ink3}/></div>
      <div style={{ fontSize:16.5, fontWeight:700 }}>{filter==='totry'?'No unopened wines yet':`Nothing marked ${v?v.label:''}`}</div>
      <div style={{ fontSize:13.5, color:T.ink3, marginTop:6, lineHeight:1.5 }}>{filter==='totry'?'Add a bottle or paste an order with the + button.':'Tap a wine and set its verdict — it’ll appear here.'}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  DETAIL
// ════════════════════════════════════════════════════════
function VisualDetail({ wine, all, onBack, onOpen, onUpdate, onAddPhoto, onDelete, onFavorite, verdictVariant='expressive' }){
  const [editing, setEditing] = vUS(false);
  const [draft, setDraft] = vUS(wine.note||'');
  const [photoBusy, setPhotoBusy] = vUS(false);
  const [confirmDelete, setConfirmDelete] = vUS(false);
  const [deleteBusy, setDeleteBusy] = vUS(false);
  const [favoriteBusy, setFavoriteBusy] = vUS(false);
  const photoInputRef = vUR(null);
  vUE(()=>{ setDraft(wine.note||''); setEditing(false); },[wine.id]);
  const onPhotoFile = async (e)=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !onAddPhoto) return;
    setPhotoBusy(true);
    try { const dataUrl = await fileToJpegDataUrl(file); await onAddPhoto(wine.id, dataUrl); }
    catch(err){ console.error('add photo failed', err); }
    finally { setPhotoBusy(false); }
  };
  const triggerPhoto = ()=>{ if(!photoBusy && photoInputRef.current) photoInputRef.current.click(); };
  const removeBottle = async ()=>{
    if (!onDelete || deleteBusy) return;
    setDeleteBusy(true);
    try { await onDelete(wine); }
    finally { setDeleteBusy(false); }
  };
  const toggleFavorite = async ()=>{
    if (!onFavorite || favoriteBusy || wine.sample) return;
    setFavoriteBusy(true);
    try { await onFavorite(wine.id, !isFavorite(wine)); }
    finally { setFavoriteBusy(false); }
  };
  const fam = famOf(wine.family);
  const famHue = fam ? fam.hue : FAM_NEUTRAL_HUE;
  const accent = `hsl(${famHue} 55% 46%)`;
  const tc = typeColor(wine.type);
  // Only relate wines by a family they actually have — otherwise every
  // un-described wine would appear "similar" to every other one.
  const more = wine.family ? all.filter(w=>w.family===wine.family && w.id!==wine.id).slice(0,8) : [];

  return (
    <div style={{ position:'absolute', inset:0, zIndex:60, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto' }}>
        {/* hero */}
        <div style={{ position:'relative' }}>
          <input ref={photoInputRef} type="file" accept="image/*" onChange={onPhotoFile} style={{ display:'none' }}/>
          {wine.photo ? (<>
            <BottlePhoto wine={wine} w={'100%'} h={300} rounded={0} flat/>
            {/* Change-photo: always available, high-contrast on any image. */}
            <button onClick={triggerPhoto} disabled={photoBusy} style={{ position:'absolute', bottom:14, right:16, display:'flex', alignItems:'center', gap:7, background:'rgba(17,17,19,0.62)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', border:'none', borderRadius:99, padding:'9px 15px', cursor:photoBusy?'default':'pointer', boxShadow:'0 2px 8px rgba(0,0,0,0.18)', fontFamily:'var(--sans)', fontSize:13, fontWeight:640, color:'#fff' }}><Icon name="camera" size={16} color="#fff"/> {photoBusy?'Uploading…':'Change photo'}</button>
          </>) : (
            /* No photo: the whole hero is a first-class "Add a photo" call to action. */
            <button onClick={triggerPhoto} disabled={photoBusy} aria-label="Add a photo" style={{ width:'100%', height:300, border:'none', cursor:photoBusy?'default':'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:11, background:`hsl(${fam.hue} 32% 95%)`, padding:0 }}>
              <span style={{ width:66, height:66, borderRadius:99, background:'#fff', border:`1px solid hsl(${fam.hue} 40% 86%)`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 18px rgba(17,17,19,0.10)' }}><Icon name="camera" size={29} color={accent}/></span>
              <span style={{ fontSize:16.5, fontWeight:740, color:T.ink, letterSpacing:-0.2 }}>{photoBusy?'Uploading…':'Add a photo'}</span>
              <span style={{ fontSize:13, color:T.ink3 }}>Tap to add this bottle’s photo</span>
            </button>
          )}
          <div style={{ position:'absolute', top:V_STATUS, left:14 }}>
            <button onClick={onBack} style={{ width:40, height:40, borderRadius:99, border:'none', cursor:'pointer', background:'rgba(255,255,255,0.9)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}><Icon name="back" size={21} color={T.ink}/></button>
          </div>
          <div style={{ position:'absolute', top:V_STATUS+2, right:16, display:'flex', flexDirection:'column', alignItems:'flex-end', gap:8 }}>
            {!wine.sample && <button onClick={toggleFavorite} disabled={favoriteBusy} aria-label={isFavorite(wine)?'Remove from Favorites':'Add to Favorites'} style={{ width:40, height:40, borderRadius:99, border:'none', cursor:favoriteBusy?'default':'pointer', background:'rgba(255,255,255,0.92)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.1)', opacity:favoriteBusy?0.65:1 }}><Icon name={isFavorite(wine)?'starFill':'star'} size={20} color={isFavorite(wine)?'#a67c24':T.ink}/></button>}
            <VerdictBadge id={wine.verdict} variant="expressive"/>
            {wine.sample && <span style={{ fontFamily:'var(--mono)', fontSize:9.5, fontWeight:600, color:'#fff', background:'rgba(17,17,19,0.6)', padding:'3px 8px', borderRadius:6, letterSpacing:0.4, textTransform:'uppercase' }}>Sample</span>}
          </div>
        </div>

        <div style={{ padding:'20px 20px 0' }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:T.ink3, letterSpacing:0.3 }}>{(wine.producer||'').toUpperCase()}</div>
          <h1 style={{ margin:'4px 0 0', fontSize:25, fontWeight:760, letterSpacing:-0.7, lineHeight:1.1 }}>{wine.name}</h1>
          <div style={{ fontSize:15, color:T.ink2, marginTop:6, fontWeight:540 }}>{wine.vintage} · {wine.type}{wine.grape?' · '+wine.grape:''}</div>
          <div style={{ fontSize:13.5, color:T.ink3, marginTop:7, display:'flex', alignItems:'center', gap:5 }}><Icon name="pin" size={14} color={T.ink3}/> {wine.region}{wine.country?', '+wine.country:''}</div>

          {/* sommelier brief — what it is & why you'd enjoy it (saved at identification) */}
          <WineBrief wine={wine}/>

          {wine.flavor && fam && <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginTop:15, padding:'8px 14px', borderRadius:99, background:`hsl(${famHue} 60% 96%)`, border:`1px solid hsl(${famHue} 50% 84%)` }}>
            <span style={{ width:9, height:9, borderRadius:3, background:accent }}/>
            <span style={{ fontSize:13.5, fontWeight:680, color:`hsl(${famHue} 45% 32%)` }}>{fam.label}</span>
          </div>}

          {/* verdict */}
          <div style={{ height:24 }}/>
          <Lbl>{wine.verdict==='totry'?'Opened it? Add your verdict':'Your verdict'}</Lbl>
          <VerdictPicker value={wine.verdict==='totry'?null:wine.verdict} onChange={(v)=>onUpdate(wine.id,{verdict:v})} variant={verdictVariant}/>

          {/* flavor profile */}
          {wine.flavor && <>
            <div style={{ height:26 }}/>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:14 }}>
              <Lbl inline>Flavor Profile</Lbl>
              <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontFamily:'var(--mono)', fontSize:9.5, color:T.maybe, letterSpacing:0.3 }}><Icon name="sparkle" size={11} color={T.maybe}/> AI · UNVERIFIED</span>
            </div>
            <FlavorBars flavor={wine.flavor} color={accent}/>
          </>}

          {/* pairings — legacy section; the brief's "Pairs" chips cover this for newer wines */}
          {(wine.pairings||[]).length>0 && !wine.blurb && <>
            <div style={{ height:26 }}/>
            <Lbl>Pairings</Lbl>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {wine.pairings.map(p=>(
                <span key={p} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 13px', borderRadius:10, background:T.canvas, border:`1px solid ${T.line}`, fontSize:13.5, fontWeight:560, color:T.ink }}>
                  <Icon name="glass" size={14} color={tc}/>{p}</span>
              ))}
            </div>
          </>}

          {/* notes — single note per wine: clear add / saved / edit states */}
          <div style={{ height:26 }}/>
          {editing ? (
            <div>
              <Lbl>Your note</Lbl>
              <textarea autoFocus value={draft} onChange={e=>setDraft(e.target.value)} rows={3} placeholder="What you tasted, where you were, who you were with…"
                style={{ width:'100%', boxSizing:'border-box', border:`1.5px solid ${T.ink}`, borderRadius:12, padding:12, fontFamily:'var(--sans)', fontSize:14.5, lineHeight:1.5, color:T.ink, resize:'none', outline:'none' }}/>
              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                <button onClick={()=>{ onUpdate(wine.id,{note:draft.trim()}); setEditing(false); }} style={{ padding:'9px 16px', borderRadius:10, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:13.5, fontWeight:650, cursor:'pointer' }}>Save note</button>
                <button onClick={()=>{ setDraft(wine.note||''); setEditing(false); }} style={{ padding:'9px 16px', borderRadius:10, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:600, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          ) : wine.note ? (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                <Lbl inline>Your note</Lbl>
                <button onClick={()=>setEditing(true)} style={{ display:'inline-flex', alignItems:'center', gap:5, background:'none', border:'none', color:T.ink2, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'var(--sans)' }}><Icon name="edit" size={15} color={T.ink2}/> Edit</button>
              </div>
              <div onClick={()=>setEditing(true)} style={{ fontSize:15.5, color:T.ink, lineHeight:1.6, cursor:'text' }}>{wine.note}</div>
            </div>
          ) : (
            <button onClick={()=>setEditing(true)} style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:12, padding:16, borderRadius:14, border:`1.5px dashed ${T.line2}`, background:T.canvas, cursor:'pointer' }}>
              <Icon name="edit" size={20} color={T.ink2}/>
              <div>
                <div style={{ fontSize:14.5, fontWeight:680, color:T.ink }}>Add a tasting note</div>
                <div style={{ fontSize:12.5, color:T.ink3, marginTop:2 }}>What you tasted, where you were, who you were with.</div>
              </div>
            </button>
          )}

          {/* purchase provenance remains useful; drinking location belongs in Dining Out, not every bottle */}
          <div style={{ height:22 }}/>
          <div style={{ display:'flex', alignItems:'center', gap:14, fontSize:12.5, color:T.ink3, flexWrap:'wrap' }}>
            {wine.source && <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}><Icon name="pin" size={13} color={T.ink3}/> Found at {wine.source}</span>}
            {wine.price!=null && <><span>·</span><span style={{ fontFamily:'var(--mono)' }}>${Number(wine.price)%1===0?wine.price:Number(wine.price).toFixed(2)}</span></>}
          </div>

          <div style={{ marginTop:30, paddingTop:20, borderTop:`1px solid ${T.line}` }}>
            <button onClick={()=>setConfirmDelete(true)} style={{ width:'100%', padding:'13px', borderRadius:12, border:'1px solid #d9b8b8', background:'#fff', color:'#9b2f3a', fontFamily:'var(--sans)', fontSize:14, fontWeight:680, cursor:'pointer' }}>Remove from cellar</button>
          </div>
        </div>

        {more.length>0 && <div style={{ marginTop:6, paddingBottom:`calc(${V_NAV+30}px + env(safe-area-inset-bottom))` }}><Shelf title="More like this" sub={fam.label} accent={fam.hue} wines={more} onOpen={onOpen}/></div>}
        {more.length===0 && <div style={{ height:`calc(${V_NAV+30}px + env(safe-area-inset-bottom))` }}/>}
      </div>

      {confirmDelete && <div role="dialog" aria-modal="true" aria-label="Remove bottle from cellar?" style={{ position:'absolute', inset:0, zIndex:95, background:'rgba(23,21,15,.34)', display:'flex', alignItems:'flex-end' }} onClick={()=>{ if(!deleteBusy)setConfirmDelete(false); }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 18px calc(20px + env(safe-area-inset-bottom))', boxShadow:'0 -8px 30px rgba(23,21,15,.18)' }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:21, color:T.ink }}>Remove this bottle?</div>
          <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:7 }}>This removes <b>{wine.producer ? wine.producer+' ' : ''}{wine.name} {wine.vintage}</b> from your cellar. Other bottles of the same wine will remain.</div>
          <div style={{ display:'flex', gap:9, marginTop:18 }}>
            <button disabled={deleteBusy} onClick={removeBottle} style={{ flex:1, padding:'14px', borderRadius:12, border:'none', background:'#9b2f3a', color:'#fff', fontFamily:'var(--sans)', fontSize:14.5, fontWeight:700, cursor:deleteBusy?'default':'pointer', opacity:deleteBusy?0.65:1 }}>{deleteBusy?'Removing…':'Remove bottle'}</button>
            <button disabled={deleteBusy} onClick={()=>setConfirmDelete(false)} style={{ padding:'14px 18px', borderRadius:12, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:650, cursor:deleteBusy?'default':'pointer' }}>Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
function Lbl({ children, inline }){ return <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.5, textTransform:'uppercase', marginBottom:inline?0:12 }}>{children}</div>; }

export { Collection, VisualDetail, WCard, ShelfCard, Shelf };
