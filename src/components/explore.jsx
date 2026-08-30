// explore.jsx — Explore a Region: search a curated library first (lands straight on
// the region page); the sommelier is a quiet fallback only when a region is missing.
import React from 'react';
import { T, styleLabel } from '../lib/data.js';
import { Icon, VerdictBadge, typeColor } from './ui.jsx';
import { BottlePhoto } from './bottle.jsx';
import { V_STATUS, V_NAV } from '../lib/constants.js';
import { REGIONS, FEATURED } from '../lib/regions.js';
import { track } from '../lib/analytics.js';

const { useState: eUS, useEffect: eUE } = React;
const NAMES = Object.keys(REGIONS);

function ExploreScreen({ wines, onOpenWine, onAsk }){
  const [query, setQuery] = eUS('');
  const [sel, setSel] = eUS(FEATURED[0]);

  const q = query.trim().toLowerCase();
  const matches = !q ? FEATURED : NAMES.filter(nm=>{
    const reg = REGIONS[nm];
    return nm.toLowerCase().includes(q) || reg.country.toLowerCase().includes(q)
      || reg.grapes.some(g=>g.toLowerCase().includes(q))
      || (reg.keys||[]).some(k=>k.includes(q) || q.includes(k));
  });
  const noMatch = q.length>0 && matches.length===0;

  // Curated-first: while searching, land straight on the top matching region.
  eUE(()=>{ if(q && matches.length && !matches.includes(sel)) setSel(matches[0]); }, [query]); // eslint-disable-line react-hooks/exhaustive-deps
  eUE(()=>{ track('region_view', { name: sel }); }, [sel]); // eslint-disable-line
  eUE(()=>{ const s=query.trim(); if(!s) return; const t=setTimeout(()=>track('region_search', { q:s }), 700); return ()=>clearTimeout(t); }, [query]); // eslint-disable-line

  const name = REGIONS[sel] ? sel : FEATURED[0];
  const r = REGIONS[name];
  const owned = wines.filter(w=>{ const hay=((w.region||'')+' '+(w.country||'')).toLowerCase(); return r.keys.some(k=>hay.includes(k)) || (w.country===r.country && r.grapes.some(g=>(w.grape||'').toLowerCase().includes(g.toLowerCase().split(' ')[0]))); });
  const accent = typeColor(r.grapes[0].match(/blanc|chardonnay|gris|chenin|sauvignon|melon|riesling|gewürz|grillo|carricante|glera|garganega/i)?'White':'Red');

  return (
    <div style={{ height:'100%', overflowX:'hidden', overflowY:'auto', background:'#fff' }}>
      <div style={{ paddingTop:V_STATUS }}/>
      <div style={{ padding:'8px 20px 0' }}>
        <h1 style={{ margin:0, fontSize:27, fontWeight:780, letterSpacing:-0.9 }}>Explore</h1>
        <p style={{ margin:'6px 0 0', fontSize:14, color:T.ink3, lineHeight:1.5 }}>Regions, grapes, and what you own from each.</p>
      </div>
      <div style={{ padding:'16px 20px 0', paddingBottom:V_NAV+96 }}>

        {/* search */}
        <div style={{ position:'relative', marginBottom:18 }}>
          <span style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', display:'flex' }}><Icon name="search" size={17} color={T.ink3}/></span>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search regions, grapes, countries…"
            style={{ width:'100%', boxSizing:'border-box', height:46, border:`1px solid ${T.line2}`, borderRadius:12, padding:'0 13px 0 39px', fontFamily:'var(--sans)', fontSize:16, color:T.ink, outline:'none', background:T.raised }}/>
          {query && <button onClick={()=>setQuery('')} style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:4, display:'flex' }}><Icon name="x" size={16} color={T.ink3}/></button>}
        </div>

        {/* pills — featured when idle, matches while searching */}
        <Lbl3>{q ? `${matches.length} ${matches.length===1?'region':'regions'} found` : 'Featured regions'}</Lbl3>
        {!noMatch ? (
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {matches.map(nm=>{ const on=nm===name; return (
              <button key={nm} onClick={()=>setSel(nm)} style={{ padding:'7px 14px', borderRadius:99, cursor:'pointer', background:on?T.ink:'#fff', border:`1px solid ${on?T.ink:T.line2}`, color:on?'#fff':T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:on?660:540 }}>{nm}</button> ); })}
          </div>
        ) : (
          <div style={{ padding:'15px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas }}>
            <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginBottom:10 }}>Can’t find “{query.trim()}” in the library yet.</div>
            <button onClick={()=>onAsk(`Tell me about ${query.trim()} wine`)} style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'9px 14px', borderRadius:11, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, cursor:'pointer' }}><Icon name="sparkle" size={15} color={T.maybe}/> Ask Wine Memory AI</button>
          </div>
        )}

        {/* selected region */}
        <div style={{ borderTop:`1px solid ${T.line}`, marginTop:22, paddingTop:20 }}>
          <div style={{ fontFamily:'var(--mono)', fontSize:11.5, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase' }}>{r.country}</div>
          <h1 style={{ margin:'4px 0 0', fontSize:32, fontWeight:800, letterSpacing:-1 }}>{name}</h1>

          <div style={{ marginTop:18 }}>
            <Lbl3>What grows here</Lbl3>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {r.grapes.map(g=> <span key={g} style={{ display:'inline-flex', alignItems:'center', gap:7, padding:'8px 13px', borderRadius:10, background:T.canvas, border:`1px solid ${T.line}`, fontSize:13.5, fontWeight:600, color:T.ink }}><span style={{ width:8, height:8, borderRadius:99, background:accent }}/>{g}</span>)}
            </div>
          </div>

          <div style={{ marginTop:24 }}>
            <Lbl3>What it tastes like</Lbl3>
            <p style={{ margin:0, fontSize:15.5, color:T.ink, lineHeight:1.6 }}>{r.taste}</p>
          </div>

          {(r.prompts||[]).length>0 && <div style={{ marginTop:24 }}>
            <Lbl3>Curious? Ask Wine Memory AI</Lbl3>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {r.prompts.map(p=>(
                <button key={p} onClick={()=>onAsk(p)} style={{ display:'flex', alignItems:'center', gap:10, textAlign:'left', padding:'12px 13px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:13, cursor:'pointer' }}>
                  <Icon name="sparkle" size={16} color={T.maybe}/>
                  <span style={{ flex:1, fontSize:14, color:T.ink, fontWeight:540, lineHeight:1.35 }}>{p}</span>
                  <Icon name="arrow" size={15} color={T.ink3}/>
                </button>
              ))}
            </div>
          </div>}

          <div style={{ marginTop:26 }}>
            <Lbl3>What you own from here</Lbl3>
            {owned.length ? <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {owned.map(w=>(
                <button key={w.id} onClick={()=>onOpenWine(w.id)} style={{ width:'100%', textAlign:'left', display:'flex', gap:12, alignItems:'center', padding:'11px 12px', border:`1px solid ${T.line}`, background:'#fff', borderRadius:13, cursor:'pointer' }}>
                  <BottlePhoto wine={w} w={46} h={58} rounded={9}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:'var(--mono)', fontSize:10, color:T.maybe, letterSpacing:0.25, textTransform:'uppercase' }}>{styleLabel(w)}</div>
                    <div style={{ fontSize:14.5, fontWeight:670, color:T.ink, letterSpacing:-0.2, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.name} <span style={{ color:T.ink3, fontWeight:500 }}>{w.vintage}</span></div>
                    <div style={{ fontSize:12, color:T.ink3, marginTop:1 }}>{w.region}</div>
                  </div>
                  <VerdictBadge id={w.verdict} variant="expressive" size="sm"/>
                </button>
              ))}
            </div> : <div style={{ padding:'16px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Nothing from {name} yet. Now you know the grapes to look for — try a {r.grapes[0]} next time you’re shopping.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
function Lbl3({ children }){ return <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.5, textTransform:'uppercase', marginBottom:12 }}>{children}</div>; }

export { ExploreScreen, REGIONS };
