// savemode.jsx — saving a wine happens in two moments, separated in time:
//   • At the shop (Search / Snap): you haven't tasted it. Capture only where you
//     found it + an optional note, and save as "To Try" (verdict 'totry').
//     -> FoundAtFields, used by ConfirmCard and SnapLabel.
// Values map onto existing wine columns (source / verdict / note), so
// there is no schema change.
import React from 'react';
import { T, WINE_SPOTS } from '../lib/data.js';
import { Chip } from './ui.jsx';

const textareaStyle = { width:'100%', boxSizing:'border-box', border:`1px solid ${T.line2}`, borderRadius:12, padding:'12px', fontFamily:'var(--sans)', fontSize:14.5, lineHeight:1.5, color:T.ink, resize:'none', outline:'none' };
function Lbl({ children }){ return <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.5, textTransform:'uppercase', marginBottom:11 }}>{children}</div>; }
function Opt(){ return <span style={{ textTransform:'none', letterSpacing:0, color:T.ink4 }}> · optional</span>; }

// Resolve the "Where did you find it?" chip into the string saved on `source`.
function spotSource(spot, otherSpot){
  if (!spot) return null;
  if (spot === 'Other') return (otherSpot||'').trim() || 'Other';
  return spot;
}

// Shop capture for the add flow (Search / Snap). Everything optional.
function FoundAtFields({ spot, setSpot, otherSpot, setOtherSpot, note, setNote }){
  return (
    <div>
      <Lbl>Where did you find it?<Opt/></Lbl>
      <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
        {WINE_SPOTS.map(s=> <Chip key={s} label={s} on={spot===s} onClick={()=>setSpot(spot===s?null:s)} mini/>)}
      </div>
      {spot === 'Other' && (
        <input value={otherSpot} onChange={e=>setOtherSpot(e.target.value)} placeholder="Name the shop…" autoFocus
          style={{ width:'100%', boxSizing:'border-box', height:44, marginTop:10, border:`1px solid ${T.line2}`, borderRadius:11, padding:'0 13px', fontFamily:'var(--sans)', fontSize:14.5, color:T.ink, outline:'none', background:'#fff' }}/>
      )}
      <div style={{ height:22 }}/>
      <Lbl>Note<Opt/></Lbl>
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
        placeholder="Why you're interested, price, what you might open it with…" style={textareaStyle}/>
    </div>
  );
}

export { FoundAtFields, spotSource };
