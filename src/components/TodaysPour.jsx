// TodaysPour.jsx — "Learn something in 30 seconds." A small daily lesson card on
// Home and the full-screen reader it opens. The value lives in the benefit
// ("learn something in 30 seconds") and the irresistible title — not a cute
// feature name. The "tomorrow" teaser is the return hook.
import React from 'react';
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { track } from '../lib/analytics.js';
import { lessonForToday } from '../lib/lessons.js';

const WINE_RED = '#9b2f3a';
const TP_STATUS = 50;

// Home card — eyebrow promises the benefit; the title does the selling.
function LearnCard({ onOpen }){
  const { lesson } = lessonForToday();
  return (
    <button onClick={onOpen} style={{ width:'100%', textAlign:'left', background:T.surface, border:'none', borderRadius:16, padding:'16px',
      cursor:'pointer', boxShadow:'0 6px 18px rgba(22,20,15,0.09), 0 1px 2px rgba(22,20,15,0.05)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:9.5, fontWeight:600, letterSpacing:'.16em', textTransform:'uppercase', color:WINE_RED }}>
          <Icon name="sparkle" size={12} color={WINE_RED}/> Learn something in 30 seconds</span>
        <Icon name="arrow" size={15} color={WINE_RED}/>
      </div>
      <div style={{ fontFamily:'var(--serif)', fontSize:21, color:T.ink, lineHeight:1.12, marginTop:8 }}>{lesson.title}</div>
    </button>
  );
}

// Full-screen reader.
function LearnReader({ onClose, onExplore }){
  const { lesson, next } = lessonForToday();
  React.useEffect(()=>{ track('learn_opened', { title: lesson.title }); }, []);
  return (
    <div style={{ position:'absolute', inset:0, zIndex:88, background:T.bg, display:'flex', flexDirection:'column' }}>
      <div style={{ paddingTop:TP_STATUS, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'6px 16px 10px' }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--mono)', fontSize:10, fontWeight:600, letterSpacing:'.18em', textTransform:'uppercase', color:WINE_RED }}>
            <Icon name="sparkle" size={12} color={WINE_RED}/> 30 seconds</span>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:6, display:'flex' }}><Icon name="x" size={22} color={T.ink2}/></button>
        </div>
      </div>
      <div style={{ flex:1, overflowX:'hidden', overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'8px 26px 40px' }}>
        <h1 style={{ margin:0, fontFamily:'var(--serif)', fontSize:30, fontWeight:500, lineHeight:1.12, color:T.ink, letterSpacing:0.2 }}>{lesson.title}</h1>
        <p style={{ margin:'18px 0 0', fontFamily:'var(--serif)', fontSize:17, lineHeight:1.62, color:T.ink }}>{lesson.body}</p>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:24 }}>
          {lesson.chips.map((c,i)=>(
            <span key={i} style={{ padding:'6px 13px', borderRadius:99, background:'#fff', border:`1px solid ${T.line2}`, fontFamily:'var(--sans)', fontSize:12, fontWeight:500, color:T.ink2 }}>{c}</span>
          ))}
        </div>
      </div>
      <div style={{ flexShrink:0, borderTop:`1px solid ${T.line}`, background:T.bg, padding:'14px 26px calc(16px + env(safe-area-inset-bottom))', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
        <button onClick={()=>{ track('learn_explore'); onExplore(); }} style={{ background:'none', border:'none', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:620, color:T.ink, flexShrink:0 }}>
          Browse regions <Icon name="arrow" size={14} color={T.ink}/></button>
        <span style={{ fontFamily:'var(--mono)', fontSize:9, letterSpacing:'.05em', textTransform:'uppercase', color:T.ink4, textAlign:'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', minWidth:0 }}>Tomorrow · {next.title}</span>
      </div>
    </div>
  );
}

export { LearnCard, LearnReader };
