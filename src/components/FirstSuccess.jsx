// FirstSuccess.jsx — one-time celebratory moment after a user saves their FIRST
// wine. Goal: "I've started something." Brief and elegant, in the app's visual
// language (verdict check glyph, sparkle, serif). The 1·1·1 tally seeds the idea
// of a future taste portrait. Not gamified, not a checklist. The gate + show-once
// flag live in main.jsx (keyed off the cellar going 0 -> 1).
import React from 'react';
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { track } from '../lib/analytics.js';

function Stat({ n, label }){
  return (
    <div style={{ flex:1, textAlign:'center', background:T.surface, border:`1px solid ${T.line}`, borderRadius:13, padding:'12px 4px' }}>
      <div style={{ fontFamily:'var(--serif)', fontSize:24, color:T.ink, lineHeight:1 }}>{n}</div>
      <div style={{ fontFamily:'var(--mono)', fontSize:8.5, letterSpacing:'.12em', textTransform:'uppercase', color:T.ink3, marginTop:5 }}>{label}</div>
    </div>
  );
}

function FirstSuccess({ wine, onAsk, onAddAnother }){
  React.useEffect(()=>{ track('first_success_shown'); }, []);
  const hasRegion = !!(wine.region && String(wine.region).trim());
  const hasGrape  = !!(wine.grape  && String(wine.grape).trim());
  const seed = hasRegion && hasGrape
    ? `Tell me about this ${wine.grape} from ${wine.region} — what should I know?`
    : `Tell me about ${[wine.producer, wine.name].filter(Boolean).join(' ') || 'this wine'} — what should I know?`;

  return (
    <div style={{ position:'absolute', inset:0, zIndex:97, background:T.bg, display:'flex', flexDirection:'column', textAlign:'center',
      padding:'calc(46px + env(safe-area-inset-top)) 30px calc(28px + env(safe-area-inset-bottom))', boxSizing:'border-box' }}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:58, height:58, borderRadius:99, background:T.buyBg, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:22, animation:'wmPop .42s cubic-bezier(.2,.9,.3,1.3)' }}>
          <Icon name="check" size={30} color={T.buy} stroke={2.6}/>
        </div>
        <h1 style={{ margin:0, fontFamily:'var(--serif)', fontSize:32, fontWeight:500, lineHeight:1.08, color:T.ink, letterSpacing:0.2 }}>
          Your cellar has <em style={{ fontStyle:'italic' }}>begun.</em></h1>
        <div style={{ marginTop:13, fontFamily:'var(--mono)', fontSize:10, letterSpacing:'.12em', textTransform:'uppercase', color:T.ink3 }}>{(wine.producer||'').toUpperCase()}</div>
        <div style={{ marginTop:3, fontFamily:'var(--sans)', fontSize:15, color:T.ink2 }}><span style={{ color:T.ink }}>{wine.name||'Your first wine'}</span> — saved.</div>
        <div style={{ display:'flex', gap:9, marginTop:24, width:'100%', maxWidth:320 }}>
          <Stat n={1} label="Wine"/>
          <Stat n={hasRegion?1:0} label="Region"/>
          <Stat n={hasGrape?1:0} label="Grape"/>
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <button onClick={()=>{ track('first_success_ask'); onAsk(seed); }} style={{ height:52, borderRadius:13, border:'none', cursor:'pointer', background:T.ink, color:'#fff',
          fontFamily:'var(--sans)', fontSize:15, fontWeight:680, display:'flex', alignItems:'center', justifyContent:'center', gap:9 }}>
          <Icon name="sparkle" size={18} color="#fff"/> Ask your sommelier about this wine</button>
        <button onClick={()=>{ track('first_success_add_another'); onAddAnother(); }} style={{ background:'none', border:'none', cursor:'pointer', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:600, padding:6 }}>Add another</button>
      </div>
    </div>
  );
}

export { FirstSuccess };
