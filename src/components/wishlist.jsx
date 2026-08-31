// wishlist.jsx — the dedicated Wishlist screen: bottles the user does NOT own.
//
// Distinct from Unopened (owned, not yet tasted — a Cellar filter). Items are
// hand-entered ("A wine to try") or saved from a verified Must Try
// recommendation. "I bought this" is the only path into the cellar: it inserts
// a REAL wine (Unopened, never a sample) through the normal insert path, then
// resolves the wishlist item. Every row is visibly labelled "Not owned" so the
// list can never read as a cellar.
import React from 'react';
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { Spinner } from './add.jsx';
import { V_STATUS } from '../lib/constants.js';
import * as wl from '../lib/wishlist.js';
import * as db from '../lib/db.js';
import { track } from '../lib/analytics.js';

const { useState: wUS, useEffect: wUE } = React;

const label = { fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:T.ink3, marginBottom:5 };
const inputStyle = { width:'100%', boxSizing:'border-box', height:44, border:`1px solid ${T.line2}`, borderRadius:11, background:'#fff', padding:'0 12px', fontFamily:'var(--sans)', fontSize:15, color:T.ink, outline:'none' };

function NotOwnedTag(){
  return <span style={{ fontFamily:'var(--mono)', fontSize:9, letterSpacing:'.1em', textTransform:'uppercase', color:T.totry, background:T.totryBg, borderRadius:6, padding:'3px 7px', flexShrink:0 }}>Wishlist · Not owned</span>;
}

function WishlistRow({ item, onBought, onRemove, busy }){
  return (
    <div style={{ border:`1px solid ${T.line}`, borderRadius:14, background:'#fff', padding:'13px 14px', marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:15.5, fontWeight:700, color:T.ink, letterSpacing:-0.2, lineHeight:1.25 }}>
            {item.producer ? item.producer+' ' : ''}{item.name} <span style={{ color:T.ink3, fontWeight:500 }}>{item.vintage}</span>
          </div>
          <div style={{ fontSize:12.5, color:T.ink3, marginTop:3 }}>
            {[item.grape, item.region, item.country].filter(Boolean).join(' · ')}
          </div>
        </div>
        <NotOwnedTag/>
      </div>
      {item.why && <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:8 }}>{item.why}</div>}
      <div style={{ display:'flex', flexWrap:'wrap', gap:'3px 12px', marginTop:7 }}>
        {item.priceExpected != null && <span style={{ fontSize:12, color:T.ink3 }}>Expect around ${item.priceExpected}</span>}
        {item.recommendedBy && <span style={{ fontSize:12, color:T.ink3 }}>Recommended by {item.recommendedBy}</span>}
        {item.source==='musttry' && <span style={{ fontSize:12, color:T.ink3 }}>Saved from Must Try</span>}
      </div>
      <div style={{ display:'flex', gap:9, marginTop:12 }}>
        <button disabled={busy} onClick={()=>onBought(item)} style={{ flex:1, padding:'11px', borderRadius:11, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:13.5, fontWeight:680, cursor:busy?'default':'pointer', opacity:busy?0.6:1 }}>I bought this</button>
        <button disabled={busy} aria-label={`Remove ${item.name} from wishlist`} onClick={()=>onRemove(item)} style={{ flexShrink:0, width:44, borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', cursor:busy?'default':'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="x" size={16} color={T.ink2}/></button>
      </div>
    </div>
  );
}

// ── "A wine to try" — the manual entry form ─────────────────────────
function WineToTryForm({ onSave, onCancel, duplicateOf, onSaveAnyway }){
  const [f, setF] = wUS({ name:'', producer:'', vintage:'', priceExpected:'', grape:'', region:'', type:'', why:'', recommendedBy:'' });
  const set = (k)=> (e)=> setF(v=>({ ...v, [k]: e.target.value }));
  const canSave = f.name.trim().length > 0;
  const build = ()=> ({
    name:f.name.trim(), producer:f.producer.trim(), vintage:f.vintage.trim(),
    priceExpected: f.priceExpected.trim()==='' ? null : (isFinite(parseFloat(f.priceExpected)) ? parseFloat(f.priceExpected) : null),
    grape:f.grape.trim(), region:f.region.trim(), type:f.type, why:f.why.trim(), recommendedBy:f.recommendedBy.trim(),
    source:'manual', evidence:[],
  });
  return (
    <div style={{ padding:'4px 2px 30px' }}>
      <div style={{ fontFamily:'var(--serif)', fontSize:22, color:T.ink, marginBottom:16 }}>A wine to try</div>
      <div style={{ display:'flex', flexDirection:'column', gap:13 }}>
        <div><div style={label}>Wine *</div><input value={f.name} onChange={set('name')} placeholder="e.g. Morgon Côte du Py" style={inputStyle}/></div>
        <div><div style={label}>Producer</div><input value={f.producer} onChange={set('producer')} placeholder="e.g. Jean Foillard" style={inputStyle}/></div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><div style={label}>Vintage</div><input value={f.vintage} onChange={set('vintage')} placeholder="2021 or NV" style={inputStyle}/></div>
          <div><div style={label}>Price to expect</div><input value={f.priceExpected} onChange={set('priceExpected')} inputMode="decimal" placeholder="$" style={inputStyle}/></div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><div style={label}>Grape</div><input value={f.grape} onChange={set('grape')} placeholder="e.g. Gamay" style={inputStyle}/></div>
          <div><div style={label}>Type</div>
            <select value={f.type} onChange={set('type')} style={{ ...inputStyle, appearance:'auto' }}>
              <option value="">Not sure yet</option>
              {['Red','White','Rosé','Sparkling','Dessert'].map(t=><option key={t} value={t}>{t}</option>)}
            </select></div>
        </div>
        <div><div style={label}>Region</div><input value={f.region} onChange={set('region')} placeholder="e.g. Beaujolais, France" style={inputStyle}/></div>
        <div><div style={label}>Why it’s worth it</div><input value={f.why} onChange={set('why')} placeholder="What made you want it?" style={inputStyle}/></div>
        <div><div style={label}>Who recommended it</div><input value={f.recommendedBy} onChange={set('recommendedBy')} placeholder="A friend, a shop, an article…" style={inputStyle}/></div>
      </div>
      {duplicateOf && <div style={{ marginTop:14, padding:'12px 14px', background:T.maybeBg, borderRadius:11, fontSize:13, color:T.maybe, lineHeight:1.45 }}>
        This looks like <b>{duplicateOf.producer ? duplicateOf.producer+' ' : ''}{duplicateOf.name} {duplicateOf.vintage}</b>, already on your wishlist.
      </div>}
      <div style={{ display:'flex', gap:9, marginTop:18 }}>
        {duplicateOf
          ? <button onClick={()=>onSaveAnyway(build())} style={{ flex:1, padding:'14px', borderRadius:12, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:14.5, fontWeight:700, cursor:'pointer' }}>Add anyway</button>
          : <button disabled={!canSave} onClick={()=>onSave(build())} style={{ flex:1, padding:'14px', borderRadius:12, border:'none', background:canSave?T.ink:T.line2, color:'#fff', fontFamily:'var(--sans)', fontSize:14.5, fontWeight:700, cursor:canSave?'pointer':'default' }}>Save to Wishlist</button>}
        <button onClick={onCancel} style={{ flexShrink:0, padding:'14px 16px', borderRadius:12, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancel</button>
      </div>
    </div>
  );
}

// ── The screen ──────────────────────────────────────────────────────
// status: loading | ready | unavailable (migration not applied) | error
function WishlistScreen({ onClose, onPurchased, onToast }){
  const [items, setItems] = wUS([]);
  const [status, setStatus] = wUS('loading');
  const [mode, setMode] = wUS('list');        // list | form
  const [dup, setDup] = wUS(null);            // duplicate found on save attempt
  const [busyId, setBusyId] = wUS(null);
  const [pendingBuy, setPendingBuy] = wUS(null); // item awaiting a type choice

  wUE(()=>{ let on = true;
    (async()=>{
      try { const list = await db.fetchWishlist(); if(on){ setItems(list); setStatus('ready'); } }
      catch(e){ if(on) setStatus(wl.isMissingTable(e) ? 'unavailable' : 'error'); if(!wl.isMissingTable(e)) console.error('wishlist load failed', e); }
    })();
    return ()=>{ on = false; };
  }, []);

  const save = async (item, force)=>{
    const existing = wl.findDuplicate(items, item);
    if (existing && !force){ setDup(existing); return; }
    try {
      const saved = await db.insertWishlistItem(item);
      setItems(list=>[saved, ...list]); setMode('list'); setDup(null);
      track('wishlist_added', { source:item.source });
    } catch(e){ console.error('wishlist save failed', e); onToast && onToast('Could not save to Wishlist'); }
  };

  const remove = async (item)=>{
    setBusyId(item.id);
    try { await db.removeWishlistItem(item.id); setItems(list=>list.filter(i=>i.id!==item.id)); }
    catch(e){ console.error('wishlist remove failed', e); onToast && onToast('Could not remove'); }
    finally { setBusyId(null); }
  };

  // "I bought this" — one atomic, idempotent database call (see the
  // buy_wishlist_item migration function): the cellar wine and the resolved
  // item succeed together, and a retry after a lost response returns the same
  // wine instead of creating a duplicate. A bottle with no known type asks
  // for one first — it is never defaulted to Red.
  const bought = (item)=>{
    if (wl.needsTypeSelection(item)){ setPendingBuy(item); return; }
    doBuy(item, null);
  };
  const doBuy = async (item, chosenType)=>{
    setPendingBuy(null); setBusyId(item.id);
    try {
      const wine = await db.buyWishlistItem(item.id, chosenType);
      setItems(list=>list.filter(i=>i.id!==item.id));
      if (wine && onPurchased) onPurchased(wine);
      track('wishlist_bought');
      onToast && onToast('Added to your cellar as Unopened');
    } catch(e){
      if (e && /type required/i.test(String(e.message||''))){ setPendingBuy(item); return; }
      console.error('wishlist bought failed', e); onToast && onToast('Could not add to your cellar');
    }
    finally { setBusyId(null); }
  };

  return (
    <div style={{ position:'absolute', inset:0, zIndex:75, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ paddingTop:V_STATUS, borderBottom:`1px solid ${T.line}`, flexShrink:0 }}>
        <div style={{ display:'grid', gridTemplateColumns:'46px 1fr 46px', alignItems:'center', padding:'4px 10px 10px' }}>
          <button aria-label="Back" onClick={onClose} style={{ border:0, background:'none', padding:8, cursor:'pointer' }}><Icon name="back" size={21} color={T.ink}/></button>
          <div style={{ fontFamily:'var(--serif)', fontSize:20, textAlign:'center', color:T.ink }}>Wishlist</div>
          {mode==='list' && status==='ready'
            ? <button aria-label="Add a wine to try" onClick={()=>{ setDup(null); setMode('form'); }} style={{ border:0, background:'none', padding:8, cursor:'pointer' }}><Icon name="plus" size={21} color={T.ink}/></button>
            : <div/>}
        </div>
      </div>

      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', padding:'16px 16px 40px' }}>
        {status==='loading' && <div style={{ paddingTop:60, display:'flex', justifyContent:'center' }}><Spinner size={32} stroke={2.6}/></div>}

        {status==='unavailable' && <div style={{ paddingTop:40, textAlign:'center', padding:'40px 20px 0' }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:21, color:T.ink }}>Wishlist isn’t set up yet</div>
          <div style={{ fontSize:14, color:T.ink2, lineHeight:1.55, marginTop:10, maxWidth:'34ch', margin:'10px auto 0' }}>This database doesn’t have the Wishlist table yet. Once it’s added, bottles you want to try will live here — separate from the wines you own.</div>
        </div>}

        {status==='error' && <div style={{ paddingTop:40, textAlign:'center' }}>
          <div style={{ fontSize:14.5, color:T.ink2 }}>Couldn’t load your wishlist just now. Please try again in a moment.</div>
        </div>}

        {status==='ready' && mode==='form' &&
          <WineToTryForm onSave={(i)=>save(i,false)} onSaveAnyway={(i)=>save(i,true)} duplicateOf={dup} onCancel={()=>{ setMode('list'); setDup(null); }}/>}

        {status==='ready' && mode==='list' && items.length===0 && <div style={{ paddingTop:34, textAlign:'center', padding:'34px 20px 0' }}>
          <Icon name="bottle" size={34} color={T.ink4}/>
          <div style={{ fontFamily:'var(--serif)', fontSize:22, color:T.ink, marginTop:14 }}>Nothing on your wishlist yet</div>
          <div style={{ fontSize:14, color:T.ink2, lineHeight:1.55, marginTop:9, maxWidth:'32ch', margin:'9px auto 0' }}>Bottles you want to try but don’t own yet live here — add one a friend mentioned, or save a verified Must Try.</div>
          <button onClick={()=>{ setDup(null); setMode('form'); }} style={{ marginTop:20, padding:'14px 22px', borderRadius:12, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:14.5, fontWeight:700, cursor:'pointer' }}>Add a wine to try</button>
        </div>}

        {status==='ready' && mode==='list' && items.length>0 && <>
          <div style={{ fontSize:12.5, color:T.ink3, marginBottom:12 }}>{items.length} bottle{items.length===1?'':'s'} you don’t own yet. “I bought this” moves one into your cellar as Unopened.</div>
          {items.map(i=> <WishlistRow key={i.id} item={i} busy={busyId===i.id} onBought={bought} onRemove={remove}/>)}
        </>}
      </div>

      {/* The type question, asked at the moment it matters: an unknown bottle
          is never silently filed as Red. */}
      {pendingBuy && <div role="dialog" aria-label="What kind of wine is it?" style={{ position:'absolute', inset:0, zIndex:90, background:'rgba(23,21,15,.3)', display:'flex', alignItems:'flex-end' }} onClick={()=>setPendingBuy(null)}>
        <div onClick={e=>e.stopPropagation()} style={{ width:'100%', background:'#fff', borderRadius:'20px 20px 0 0', padding:'20px 18px calc(20px + env(safe-area-inset-bottom))', boxShadow:'0 -8px 30px rgba(23,21,15,.18)' }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:20, color:T.ink }}>What kind of wine is it?</div>
          <div style={{ fontSize:13, color:T.ink2, lineHeight:1.5, marginTop:6 }}>{pendingBuy.producer ? pendingBuy.producer+' ' : ''}{pendingBuy.name} doesn’t have a type yet — pick one so it’s filed correctly.</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:15 }}>
            {['Red','White','Rosé','Sparkling','Dessert'].map(t=>(
              <button key={t} onClick={()=>doBuy(pendingBuy, t)} style={{ padding:'13px', borderRadius:12, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:14.5, fontWeight:650, cursor:'pointer' }}>{t}</button>
            ))}
            <button onClick={()=>setPendingBuy(null)} style={{ padding:'13px', borderRadius:12, border:'none', background:T.raised, color:T.ink2, fontFamily:'var(--sans)', fontSize:14, fontWeight:600, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      </div>}
    </div>
  );
}

export { WishlistScreen, NotOwnedTag };
