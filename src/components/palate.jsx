// palate.jsx — My Palate as a taste portrait:
// 1. Taste signature  2. Regions you love  3. Explore next  4. Taste atlas (map)
// + saved pairings. Leads with "this is what your taste looks like", not a bottle map.
import React, { useState, useRef } from 'react';
import { T } from '../lib/data.js';
import { Icon, VerdictBadge, typeColor } from './ui.jsx';
import { V_STATUS, V_NAV } from '../lib/constants.js';
import { tasteSignature, regionsYouLove, exploreNext, affinityLevel } from '../lib/palate.js';
import { TasteAtlas } from './TasteAtlas.jsx';

const AXES = [['body','Body'],['acidity','Acid'],['tannin','Tannin'],['fruit','Fruit'],['oak','Oak']];

function Fingerprint({ axes }){
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:14, height:48, marginTop:15 }}>
      {AXES.map(([k,label])=>(
        <div key={k} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
          <div style={{ width:16, height:Math.max(4,(axes[k]/5)*40), borderRadius:3, background: axes[k]>=3.3 ? T.ink : T.line2 }}/>
          <span style={{ fontFamily:'var(--mono)', fontSize:9.5, color:T.ink3 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function Dots({ level }){
  return <span style={{ letterSpacing:2, fontSize:12 }}>{[0,1,2,3].map(i=> <span key={i} style={{ color: i<level? T.ink : T.line2 }}>●</span>)}</span>;
}

function SectionLbl({ children }){ return <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase', margin:'24px 0 11px' }}>{children}</div>; }

// Shown until the user has saved 5 wines — a taste portrait *developing*, not an
// empty analytics page. Same "My Palate" header so the tab feels stable.
function PalatePlaceholder({ count, onAdd, onExplore, onLearn }){
  const pct = Math.min(100, Math.round((count/5)*100));
  const UNLOCKS = [['glass','Grapes you love'],['pin','Regions you return to'],['sparkle','What to try next']];
  return (
    <div style={{ height:'100%', overflowX:'hidden', overflowY:'auto', background:'#fff' }}>
      <div style={{ paddingTop:V_STATUS }}/>
      <div style={{ padding:'8px 18px', paddingBottom:V_NAV+96 }}>
        <h1 style={{ margin:0, fontSize:27, fontWeight:780, letterSpacing:-0.9 }}>My Palate</h1>

        {/* developing hero + progress */}
        <div style={{ marginTop:18, background:T.surface, borderRadius:18, padding:'22px 20px', boxShadow:'0 6px 18px rgba(22,20,15,0.06)' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:7, fontFamily:'var(--mono)', fontSize:9.5, fontWeight:600, letterSpacing:'.16em', textTransform:'uppercase', color:'#9b2f3a' }}>
            <Icon name="sparkle" size={12} color="#9b2f3a"/> Taste portrait</span>
          <div style={{ fontFamily:'var(--serif)', fontSize:25, color:T.ink, lineHeight:1.12, marginTop:9 }}>Your taste portrait is <em style={{ fontStyle:'italic' }}>developing.</em></div>
          <p style={{ margin:'9px 0 0', fontFamily:'var(--sans)', fontSize:14, lineHeight:1.5, color:T.ink2 }}>Save a few more wines and patterns will start to appear.</p>
          <div style={{ marginTop:20 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:7 }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink2, letterSpacing:0.2 }}>{count} of 5 wines saved</span>
              <span style={{ fontFamily:'var(--mono)', fontSize:11, color:'#9b2f3a' }}>{pct}%</span>
            </div>
            <div style={{ height:8, borderRadius:99, background:T.raised, overflow:'hidden' }}>
              <div style={{ width:pct+'%', height:'100%', borderRadius:99, background:'#9b2f3a', transition:'width .4s' }}/>
            </div>
          </div>
        </div>

        {/* what unlocks */}
        <div style={{ marginTop:16, fontFamily:'var(--mono)', fontSize:10.5, color:T.ink3, letterSpacing:'.16em', textTransform:'uppercase' }}>What unlocks at 5</div>
        <div style={{ marginTop:11, display:'flex', flexDirection:'column', gap:9 }}>
          {UNLOCKS.map(([ic,label])=>(
            <div key={label} style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 15px', background:'#fff', border:`1px solid ${T.line}`, borderRadius:14, opacity:0.72 }}>
              <span style={{ width:34, height:34, borderRadius:9, background:T.canvas, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Icon name={ic} size={17} color={T.ink3}/></span>
              <span style={{ flex:1, fontFamily:'var(--serif)', fontSize:16.5, color:T.ink2 }}>{label}</span>
              <Icon name="lock" size={15} color={T.ink4}/>
            </div>
          ))}
        </div>

        {/* CTAs */}
        <button onClick={onAdd} style={{ width:'100%', marginTop:20, padding:'15px', borderRadius:13, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:15, fontWeight:680, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <Icon name="plus" size={18} color="#fff"/> Add a wine</button>
        <div style={{ marginTop:12, display:'flex', gap:10 }}>
          <button onClick={onExplore} style={{ flex:1, padding:'13px 8px', borderRadius:12, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:13, fontWeight:620, cursor:'pointer' }}>Explore regions</button>
          <button onClick={onLearn} style={{ flex:1, padding:'13px 8px', borderRadius:12, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:13, fontWeight:620, cursor:'pointer' }}>Learn in 30 sec</button>
        </div>
      </div>
    </div>
  );
}

function PalateScreen({ wines, pairings, onOpenWine, onAsk }){
  const sig = tasteSignature(wines);
  const loved = regionsYouLove(wines);
  const next = exploreNext(wines, sig);
  const [selKey, setSelKey] = useState(null);
  const atlasRef = useRef(null);
  const focusRegion = (key)=>{ setSelKey(key); setTimeout(()=> atlasRef.current && atlasRef.current.scrollIntoView({ behavior:'smooth', block:'center' }), 40); };

  return (
    <div style={{ height:'100%', overflowX:'hidden', overflowY:'auto', background:'#fff' }}>
      <div style={{ paddingTop:V_STATUS }}/>
      <div style={{ padding:'8px 18px', paddingBottom:V_NAV+96 }}>

        {/* header */}
        <h1 style={{ margin:0, fontSize:27, fontWeight:780, letterSpacing:-0.9 }}>My Palate</h1>
        <p style={{ margin:'6px 0 0', fontSize:14, color:T.ink3, lineHeight:1.5 }}>A portrait of your taste, learned from your bottles.</p>

        {/* 1 · taste signature */}
        {sig ? (
          <div style={{ marginTop:20, background:T.surface, borderRadius:18, padding:'18px 18px 16px', boxShadow:'0 6px 18px rgba(22,20,15,0.06)' }}>
            <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase' }}>Your taste signature</div>
            <div style={{ fontFamily:'var(--serif)', fontSize:30, fontWeight:500, color:T.ink, letterSpacing:-0.4, lineHeight:1.05, marginTop:6 }}>{sig.phrase}</div>
            <Fingerprint axes={sig.axes}/>
            <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:14 }}>{sig.sub}</div>
          </div>
        ) : (
          <div style={{ marginTop:20, padding:'18px', border:`1px dashed ${T.line2}`, borderRadius:14, background:T.canvas, fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Rate a few wines “Buy Again” and your taste signature will take shape here.</div>
        )}

        {/* 2 · regions you love */}
        {loved.length>0 && <>
          <SectionLbl>Regions you love</SectionLbl>
          <div>
            {loved.map((r,i)=>(
              <button key={r.key} onClick={()=>focusRegion(r.key)} style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:12, padding:'12px 2px', background:'none', border:'none', borderBottom: i<loved.length-1?`1px solid ${T.line}`:'none', cursor:'pointer' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14.5, fontWeight:680, color:T.ink, letterSpacing:-0.2 }}>{r.label} <span style={{ color:T.ink3, fontWeight:500 }}>· {r.country}</span></div>
                  <div style={{ fontSize:12, color:T.ink3, marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.trait}{r.buy>0?` · ${r.buy} you'd buy again`:''}</div>
                </div>
                <Dots level={affinityLevel(r.score)}/>
                <Icon name="map" size={16} color={T.ink3}/>
              </button>
            ))}
          </div>
        </>}

        {/* 3 · explore next */}
        {next.length>0 && <>
          <div style={{ display:'flex', alignItems:'center', gap:6, margin:'24px 0 11px' }}>
            <Icon name="sparkle" size={14} color={T.maybe}/>
            <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase' }}>Explore next · from Wine Memory AI</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {next.map((c,i)=>(
              <div key={i} style={{ border:`1px solid ${T.line}`, borderRadius:14, padding:'13px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                  <div style={{ fontSize:14.5, fontWeight:680, color:T.ink }}>{c.label} <span style={{ color:T.ink3, fontWeight:500 }}>· {c.country}</span></div>
                  <span style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.ink4 }}>you own 0</span>
                </div>
                <div style={{ fontSize:12.5, color:T.ink2, lineHeight:1.45, marginTop:3 }}>{c.why}</div>
              </div>
            ))}
          </div>
        </>}

        {/* 4 · taste atlas */}
        <div ref={atlasRef} style={{ marginTop:26 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:11 }}>
            <Icon name="map" size={15} color={T.ink3}/>
            <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.4, textTransform:'uppercase' }}>Taste atlas · where your taste lives</span>
          </div>
          <TasteAtlas wines={wines} onOpenWine={onOpenWine} selKey={selKey} onSelect={setSelKey}/>
        </div>

        {/* saved pairings (kept) */}
        <div style={{ marginTop:28 }}>
          <SectionLbl>My favorite pairings</SectionLbl>
          {(pairings||[]).length ? <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {pairings.map((p,i)=>{ const w = p.related_saved_wine_id? wines.find(x=>x.id===p.related_saved_wine_id):null;
              return (
              <button key={p.id||i} onClick={w?()=>onOpenWine(w.id):undefined} style={{ width:'100%', textAlign:'left', display:'flex', alignItems:'center', gap:13, padding:'13px 15px', borderRadius:14, border:`1px solid ${T.line}`, background:'#fff', cursor:w?'pointer':'default' }}>
                <span style={{ width:38, height:38, borderRadius:10, background:`${typeColor(p.type)}16`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Icon name="fork" size={18} color={typeColor(p.type)}/></span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14.5, fontWeight:680, color:T.ink, letterSpacing:-0.2 }}>{p.dish}</div>
                  <div style={{ fontSize:13, color:T.ink2, marginTop:1, display:'flex', alignItems:'center', gap:6 }}><Icon name="arrow" size={13} color={T.ink3}/>{p.style}</div>
                </div>
                {w && <VerdictBadge id={w.verdict} variant="glyph" size="sm"/>}
              </button> ); })}
          </div> : <div style={{ padding:'18px 16px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas }}>
            <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5 }}>Ask Wine Memory AI what to drink, then tap <b style={{ color:T.ink }}>Save this pairing</b> — they collect here.</div>
            <button onClick={()=>onAsk('')} style={{ marginTop:12, padding:'10px 15px', borderRadius:11, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:13.5, fontWeight:650, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}><Icon name="fork" size={16} color="#fff"/> Pair a meal</button>
          </div>}
        </div>

      </div>
    </div>
  );
}

export { PalateScreen, PalatePlaceholder };
