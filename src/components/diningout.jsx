// diningout.jsx — "What should I order at the restaurant?"
// Photo/text-first. Recommends STYLES + regions + wines FROM THE RESTAURANT LIST.
// Deliberately does NOT surface the user's home collection (separate intent).
// Reuses the pairing engine for style/why/region; reuses parseOrder for a pasted list.
// Ported from app/diningout.jsx.
import React from 'react';
import { T, EATING_EXAMPLES, parseOrder } from '../lib/data.js';
import { Icon, typeColor } from './ui.jsx';
import { Panel, Spinner } from './add.jsx';
import { heuristicPairing } from './pairing.jsx';
import { supabase } from '../lib/supabase.js';
import { invokeAI } from '../lib/ai.js';
import { fileToJpegDataUrl } from '../lib/image.js';

const { useState: dUS, useRef: dUR } = React;

// match parsed restaurant-list wines to a recommended style (by grape/type)
function matchListToStyle(list, matchGrapes, avoid){
  const mg = (matchGrapes||[]).map(g=>g.toLowerCase().split(' ')[0]).filter(Boolean);
  const av = (avoid||[]).map(a=>a.toLowerCase());
  const hay = w => ((w.grape||'')+' '+(w.name||'')).toLowerCase();
  const good = list.filter(w=> mg.some(g=>hay(w).includes(g)) && !av.some(a=>hay(w).includes(a)));
  return good;
}

async function diningRecommend(dish, list){
  // style guidance, collection-free — AI via the dining-recommend Edge Function,
  // with a local heuristic fallback if it's unavailable or errors.
  let out = null;
  try {
    if (supabase){
      const listForAI = (list||[]).map(w=>({ name:w.name, grape:w.grape||'', price:w.price }));
      const data = await invokeAI('dining-recommend', { dish, list:listForAI });
      if (data && data.primary){
        out = { dish:data.dish||dish, primary:data.primary, others:data.others||[], avoid:[],
          why:data.primary.why, listPickName:data.listPickName||null, listPickWhy:data.listPickWhy||'' };
      }
    }
  } catch(e){ console.error('dining-recommend failed', e); out = null; }
  if (!out){
    const h = heuristicPairing(dish);
    out = { dish:h.dish, primary:h.primary, others:h.others, avoid:h.avoid||[], listPickName:null, listPickWhy:'' };
  }
  // resolve list matches locally for reliability
  const matches = matchListToStyle(list||[], out.primary.matchGrapes||[out.primary.grape], out.avoid);
  out.listMatches = matches;
  return out;
}

function PhotoTile({ label, sub, filled, busy, onClick }){
  return (
    <button onClick={onClick} disabled={busy} style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:'18px 12px', borderRadius:14, cursor:busy?'default':'pointer',
      border:`1.5px dashed ${filled?T.buy:T.line2}`, background:filled?T.buyBg:T.canvas }}>
      {busy ? <Spinner size={22} stroke={2.4}/> : <Icon name={filled?'check':'camera'} size={22} color={filled?T.buy:T.ink3} stroke={filled?2.6:1.7}/>}
      <span style={{ fontSize:13, fontWeight:640, color:filled?T.buy:T.ink }}>{busy?'Reading…':(filled?'Photo added':label)}</span>
      {!filled && !busy && <span style={{ fontSize:11.5, color:T.ink3, textAlign:'center' }}>{sub}</span>}
    </button>
  );
}

function DiningOut({ onClose, onSave, recent }){
  const [step, setStep] = dUS('input');     // input | reading | result
  const [place, setPlace] = dUS('');
  const [dish, setDish] = dUS('');
  const [menuPhoto, setMenuPhoto] = dUS(false);
  const [listPhoto, setListPhoto] = dUS(false);
  const [menuBusy, setMenuBusy] = dUS(false);
  const [listBusy, setListBusy] = dUS(false);
  const [photoErr, setPhotoErr] = dUS('');    // '' | 'menu' | 'winelist'
  const [dishes, setDishes] = dUS([]);        // dish names read from a menu photo
  const [listText, setListText] = dUS('');
  const [showPaste, setShowPaste] = dUS(false);
  const [list, setList] = dUS([]);            // parsed restaurant wine list
  const [rec, setRec] = dUS(null);
  const [saved, setSaved] = dUS(false);
  const timer = dUR(null);
  const menuInputRef = dUR(null);
  const listInputRef = dUR(null);

  const parsedFromText = ()=>{ const p = parseOrder(listText); setList(p); return p; };

  // Photo → downscaled JPEG → menu-vision Edge Function (Claude vision OCR) →
  // dish names (menu) or parsed wines (wine list), fed into the recommend flow.
  const onPhoto = async (e, kind)=>{
    const file = e.target.files && e.target.files[0];
    e.target.value = '';                       // allow re-picking the same file
    if (!file) return;
    const isWine = kind === 'winelist';
    setPhotoErr('');
    isWine ? setListBusy(true) : setMenuBusy(true);
    try {
      if (!supabase) throw new Error('not configured');
      const image = await fileToJpegDataUrl(file);
      const data = await invokeAI('menu-vision', { image, kind });
      if (isWine){
        const wines = (data?.wines || [])
          .map(w=>({ name:(w.name||'').trim(), grape:w.grape||'', vintage:w.vintage||'', price:(w.price!=null?w.price:null) }))
          .filter(w=>w.name);
        if (!wines.length) throw new Error('no wines read');
        // Additive: snapping another wine-list page accumulates (dedup by name).
        setList(prev=>{
          const seen = new Set(prev.map(w=>(w.name||'').toLowerCase()));
          const merged = [...prev];
          wines.forEach(w=>{ const k=w.name.toLowerCase(); if(!seen.has(k)){ seen.add(k); merged.push(w); } });
          return merged;
        });
        setListPhoto(true); setShowPaste(false);
      } else {
        const names = (data?.dishes || []).map(d=>(d.name||'').trim()).filter(Boolean);
        if (!names.length) throw new Error('no dishes read');
        // Additive: snapping another menu page accumulates dishes (dedup, case-insensitive).
        setDishes(prev=>{
          const seen = new Set(prev.map(s=>s.toLowerCase()));
          const merged = [...prev];
          names.forEach(n=>{ if(!seen.has(n.toLowerCase())){ seen.add(n.toLowerCase()); merged.push(n); } });
          return merged;
        });
        setMenuPhoto(true);
        if (!dish.trim() && names[0]) setDish(names[0]);
      }
    } catch(err){
      console.error('menu-vision failed', err);
      setPhotoErr(kind);
      isWine ? setListPhoto(false) : setMenuPhoto(false);
    } finally {
      isWine ? setListBusy(false) : setMenuBusy(false);
    }
  };

  const go = async ()=>{
    const wl = listText.trim()? parsedFromText() : list;
    setStep('reading');
    // small delay to feel like it's "reading the table"
    const r = await diningRecommend(dish.trim()||'dinner', wl);
    timer.current = setTimeout(()=>{ setRec(r); setStep('result'); }, 500);
  };

  const doSave = ()=>{
    if (!rec || !onSave) return;
    const pick = rec.listMatches && rec.listMatches[0];
    onSave({
      experience:{
        dish: rec.dish,
        place: place.trim(),
        dishes: dishes,
        wines: (list||[]).map(w=>({ name:w.name, grape:w.grape||'', vintage:w.vintage||'', price:(w.price ?? null) })),
        recommendation: { grape:rec.primary.grape, why:rec.primary.why, deeperTitle:rec.primary.deeperTitle, deeper:rec.primary.deeper, others:rec.others||[] },
        pick_name: pick ? pick.name : null,
        pick_price: pick ? (pick.price ?? null) : null,
      },
      pairing:{ dish:rec.dish, style:(rec.primary.deeperTitle||rec.primary.grape), why:rec.primary.why, related_saved_wine_id:null, type:rec.primary.grape.match(/blanc|chard|gris|riesling|chenin|sauv/i)?'White':'Red' },
    });
    setSaved(true);
  };

  // ── READING ──
  if (step==='reading') return (
    <Panel onClose={onClose} title="Dining Out">
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:40 }}>
        <Spinner size={46} stroke={3}/>
        <div style={{ fontSize:16.5, fontWeight:720, marginTop:20 }}>Reading the table…</div>
        <div style={{ fontSize:13, color:T.ink3, marginTop:6, textAlign:'center', maxWidth:'30ch' }}>Matching “{dish||'your dish'}” to the best styles{list.length?` and ${list.length} wines on the list`:''}.</div>
      </div>
    </Panel>
  );

  // ── RESULT ──
  if (step==='result' && rec){
    const tc = typeColor(rec.primary.grape.match(/blanc|chard|gris|riesling|chenin|sauv|vermentino/i)?'White':'Red');
    return (
      <Panel onClose={onClose} title="What to order" onBack={()=>{ setStep('input'); setSaved(false); }} backLabel="Edit">
        <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'16px 18px 30px' }}>
          {place && <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase', marginBottom:4 }}>{place}</div>}
          <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase' }}>For {rec.dish}</div>
          <div style={{ fontSize:26, fontWeight:780, letterSpacing:-0.7, marginTop:7 }}>{rec.primary.grape}</div>
          <div style={{ fontSize:15, color:T.ink2, lineHeight:1.55, marginTop:7 }}>{rec.primary.why}</div>
          {rec.primary.deeper && <div style={{ marginTop:14, padding:'14px 16px', background:T.canvas, border:`1px solid ${T.line}`, borderRadius:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--mono)', fontSize:10.5, color:T.maybe, letterSpacing:0.4, textTransform:'uppercase' }}><Icon name="globe" size={13} color={T.maybe}/> Region to look for</div>
            <div style={{ fontSize:16, fontWeight:720, marginTop:7 }}>{rec.primary.deeperTitle}</div>
            <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5, marginTop:4 }}>{rec.primary.deeper}</div>
          </div>}

          {/* from the restaurant list */}
          <div style={{ marginTop:24 }}>
            <DLbl>On this restaurant’s list</DLbl>
            {list.length===0 ? <div style={{ padding:'15px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>No wine list added. Ask your server for a <b>{rec.primary.grape}</b>{rec.primary.deeperTitle?` — ideally ${rec.primary.deeperTitle}`:''}.</div>
              : rec.listMatches.length ? <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
                {rec.listMatches.slice(0,3).map((w,i)=>(
                  <div key={i} style={{ display:'flex', gap:12, alignItems:'center', padding:'12px 13px', border:`1px solid ${i===0?tc:T.line}`, background:i===0?`${tc}0d`:'#fff', borderRadius:13 }}>
                    <span style={{ width:30, height:38, borderRadius:6, background:'#fbfbfc', border:`1px solid ${T.line2}`, position:'relative', flexShrink:0 }}><span style={{ position:'absolute', left:0, top:0, bottom:0, width:4, borderRadius:'6px 0 0 6px', background:tc }}/></span>
                    <div style={{ flex:1, minWidth:0 }}>
                      {i===0 && <div style={{ fontFamily:'var(--mono)', fontSize:9.5, color:tc, letterSpacing:0.3, textTransform:'uppercase', fontWeight:600 }}>Best match on the list</div>}
                      <div style={{ fontSize:14.5, fontWeight:660, color:T.ink, letterSpacing:-0.2 }}>{w.name} {w.vintage&&w.vintage!=='NV'?w.vintage:''}</div>
                      <div style={{ fontSize:12, color:T.ink3, marginTop:1 }}>{[w.grape, w.price!=null?'$'+w.price:''].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', gap:7, marginTop:2, fontFamily:'var(--mono)', fontSize:11, color:T.maybe }}><Icon name="sparkle" size={13} color={T.maybe}/> Closest matches from the menu data · medium confidence</div>
              </div>
              : <div style={{ padding:'15px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Nothing on the list is a clean match. Closest path: ask for the lightest, highest-acid {rec.primary.grape.match(/blanc|white|chard|riesling/i)?'white':'red'} they have.</div>}
          </div>

          {/* other styles */}
          {rec.others && rec.others.length>0 && <div style={{ marginTop:24 }}>
            <DLbl>Other styles that work</DLbl>
            {rec.others.map((o,i)=>(
              <div key={i} style={{ padding:'12px 0', borderTop:`1px solid ${T.line}` }}>
                <div style={{ fontSize:14.5, fontWeight:700 }}>{o.grape}</div>
                <div style={{ fontSize:13, color:T.ink2, lineHeight:1.45, marginTop:2 }}>{o.why}</div>
              </div>
            ))}
          </div>}
        </div>
        <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
          <button onClick={doSave} disabled={saved} style={{ width:'100%', padding:'15px', borderRadius:13, border:'none', cursor:saved?'default':'pointer', background:saved?T.buyBg:T.ink, color:saved?T.buy:'#fff', fontFamily:'var(--sans)', fontSize:15, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            <Icon name={saved?'check':'heart'} size={18} color={saved?T.buy:'#fff'} stroke={saved?3:1.8}/>{saved?'Saved to My Palate & Dining Experiences':'Save this pairing'}</button>
        </div>
      </Panel>
    );
  }

  // ── INPUT ──
  return (
    <Panel onClose={onClose} title="Dining Out">
      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'16px 18px 30px' }}>
        <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5, marginBottom:18 }}>Sat down at a restaurant? Snap the menu and wine list, or just type your dish — we’ll tell you what to order.</div>

        {/* photos */}
        <DLbl>Snap it</DLbl>
        <input ref={menuInputRef} type="file" accept="image/*" onChange={e=>onPhoto(e,'menu')} style={{ display:'none' }}/>
        <input ref={listInputRef} type="file" accept="image/*" onChange={e=>onPhoto(e,'winelist')} style={{ display:'none' }}/>
        <div style={{ display:'flex', gap:10 }}>
          <PhotoTile label="Menu photo" sub="To read the dish" filled={menuPhoto} busy={menuBusy} onClick={()=>menuInputRef.current&&menuInputRef.current.click()}/>
          <PhotoTile label="Wine list photo" sub="To read the options" filled={listPhoto} busy={listBusy} onClick={()=>listInputRef.current&&listInputRef.current.click()}/>
        </div>
        {photoErr
          ? <div style={{ fontSize:11.5, color:T.no, marginTop:8, lineHeight:1.4 }}>Couldn’t read that {photoErr==='winelist'?'wine list':'menu'} photo. Try a clearer, well-lit shot — or type the details below.</div>
          : (menuPhoto || listPhoto)
            ? <div style={{ fontSize:11.5, color:T.buy, marginTop:8, lineHeight:1.4 }}>{[menuPhoto?`${dishes.length} dish${dishes.length===1?'':'es'} read`:'', listPhoto?`${list.length} wine${list.length===1?'':'s'} read`:''].filter(Boolean).join(' · ')} — tap a card again to add another page.</div>
            : <div style={{ fontSize:11.5, color:T.ink4, marginTop:8, lineHeight:1.4 }}>Take a photo or pick from your library — we’ll read the dishes and wines for you.</div>}

        {/* dish */}
        <div style={{ height:22 }}/>
        <DLbl>What are you eating?</DLbl>
        <input value={dish} onChange={e=>setDish(e.target.value)} placeholder="e.g. Creamy shellfish pasta"
          style={{ width:'100%', boxSizing:'border-box', height:46, border:`1.5px solid ${dish?T.ink:T.line2}`, borderRadius:12, padding:'0 13px', fontFamily:'var(--sans)', fontSize:15.5, color:T.ink, outline:'none' }}/>
        <div style={{ display:'flex', flexWrap:'wrap', gap:7, marginTop:9 }}>
          {(dishes.length ? dishes.slice(0,6) : EATING_EXAMPLES.slice(0,4)).map(d=> <button key={d} onClick={()=>setDish(d)} style={{ padding:'6px 11px', borderRadius:99, border:`1px solid ${dish===d?T.ink:T.line2}`, background:dish===d?T.ink:'#fff', color:dish===d?'#fff':T.ink2, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:540, cursor:'pointer' }}>{d}</button>)}
        </div>

        {/* restaurant */}
        <div style={{ height:22 }}/>
        <DLbl>Where? <span style={{ textTransform:'none', letterSpacing:0, color:T.ink4 }}>· optional</span></DLbl>
        <input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Restaurant name"
          style={{ width:'100%', boxSizing:'border-box', height:46, border:`1px solid ${T.line2}`, borderRadius:12, padding:'0 13px', fontFamily:'var(--sans)', fontSize:15, color:T.ink, outline:'none' }}/>

        {/* wine list — the photo is the primary path; paste is a discreet fallback */}
        {!list.length && !showPaste && (
          <div style={{ marginTop:20, textAlign:'center' }}>
            <button onClick={()=>setShowPaste(true)} style={{ display:'inline-flex', alignItems:'center', gap:7, background:'none', border:'none', cursor:'pointer', color:T.ink3, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:560, padding:'4px 8px' }}>
              <Icon name="edit" size={15} color={T.ink3}/> No wine list photo? Type the wines instead
            </button>
          </div>
        )}
        {showPaste && (
          <div style={{ marginTop:18 }}>
            <DLbl>Type the wines from their list <span style={{ textTransform:'none', letterSpacing:0, color:T.ink4 }}>· one per line</span></DLbl>
            <textarea autoFocus value={listText} onChange={e=>setListText(e.target.value)} rows={4} placeholder="Type or paste a few wines from their list, one per line…"
              style={{ width:'100%', boxSizing:'border-box', border:`1px solid ${T.line2}`, borderRadius:12, padding:'12px', fontFamily:'var(--mono)', fontSize:12.5, lineHeight:1.5, color:T.ink, resize:'none', outline:'none', background:T.canvas }}/>
          </div>
        )}

        {/* recent saved dining recommendations (persisted) */}
        {recent && recent.length>0 && (
          <div style={{ marginTop:28 }}>
            <DLbl>Recent dining recommendations</DLbl>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {recent.slice(0,5).map(d=>(
                <div key={d.id} style={{ padding:'12px 13px', border:`1px solid ${T.line}`, borderRadius:13, background:'#fff' }}>
                  <div style={{ fontSize:14, fontWeight:660, color:T.ink, letterSpacing:-0.1 }}>{d.dish}</div>
                  <div style={{ fontSize:13, color:T.ink2, marginTop:2 }}>{d.pick_name || (d.recommendation && d.recommendation.grape) || ''}</div>
                  {(d.place || d.date) && <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.ink3, marginTop:5, letterSpacing:0.3 }}>{[d.place, d.date].filter(Boolean).join(' · ')}</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ flexShrink:0, padding:'12px 18px calc(14px + env(safe-area-inset-bottom))', borderTop:`1px solid ${T.line}`, background:'#fff' }}>
        <button onClick={go} disabled={!dish.trim()} style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', cursor:dish.trim()?'pointer':'default', background:dish.trim()?T.ink:T.raised, color:dish.trim()?'#fff':T.ink4, fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <Icon name="sparkle" size={18} color={dish.trim()?'#fff':T.ink4}/> Recommend a wine</button>
      </div>
    </Panel>
  );
}
function DLbl({ children }){ return <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.5, textTransform:'uppercase', marginBottom:11 }}>{children}</div>; }

export { DiningOut };
