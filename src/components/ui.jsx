// ui.jsx — shared atoms: icons, verdict UI (variants), label tile, chips.
// Ported from app/ui.jsx.
import { T, VERDICTS } from '../lib/data.js';

// ── Icons (clean stroke set) ─────────────────────────────
function Icon({ name, size = 20, color = 'currentColor', stroke = 1.7, style }) {
  const p = { fill:'none', stroke:color, strokeWidth:stroke, strokeLinecap:'round', strokeLinejoin:'round' };
  const paths = {
    search:   <><circle cx="11" cy="11" r="7" {...p}/><path d="M20 20l-3.2-3.2" {...p}/></>,
    plus:     <path d="M12 5v14M5 12h14" {...p}/>,
    collection:<><rect x="4" y="4.5" width="16" height="6" rx="1.8" {...p}/><rect x="4" y="13.5" width="16" height="6" rx="1.8" {...p}/></>,
    pin:      <><path d="M12 21s7-5.6 7-11a7 7 0 10-14 0c0 5.4 7 11 7 11z" {...p}/><circle cx="12" cy="10" r="2.4" {...p}/></>,
    back:     <path d="M15 5l-7 7 7 7" {...p}/>,
    fwd:      <path d="M9 5l7 7-7 7" {...p}/>,
    up:       <path d="M5 15l7-7 7 7" {...p}/>,
    down:     <path d="M5 9l7 7 7-7" {...p}/>,
    x:        <path d="M6 6l12 12M18 6L6 18" {...p}/>,
    check:    <path d="M5 12.5l4.5 4.5L19 6.5" {...p}/>,
    tilde:    <path d="M4 13c2-3 4-3 6 0s4 3 6 0" {...p}/>,
    cross:    <path d="M7 7l10 10M17 7L7 17" {...p}/>,
    clock:    <><circle cx="12" cy="12" r="8" {...p}/><path d="M12 8v4.4l3 1.8" {...p}/></>,
    sparkle:  <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z" fill={color} stroke="none"/>,
    paste:    <><rect x="6" y="5" width="12" height="16" rx="2.2" {...p}/><path d="M9 5V4a2 2 0 012-2h2a2 2 0 012 2v1" {...p}/><path d="M9 11h6M9 15h4" {...p}/></>,
    filter:   <path d="M4 6h16M7 12h10M10 18h4" {...p}/>,
    sort:     <path d="M7 4v16M7 20l-3-3M7 4l3 3M17 20V4M17 4l3 3M17 20l-3-3" {...p}/>,
    arrow:    <path d="M5 12h13M13 6l6 6-6 6" {...p}/>,
    edit:     <path d="M5 19h14M14.5 4.5l3 3L8 17l-4 1 1-4 9.5-9.5z" {...p}/>,
    camera:   <><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" {...p}/><circle cx="12" cy="13" r="3.2" {...p}/></>,
    grid:     <><rect x="4" y="4" width="7" height="7" rx="1.6" {...p}/><rect x="13" y="4" width="7" height="7" rx="1.6" {...p}/><rect x="4" y="13" width="7" height="7" rx="1.6" {...p}/><rect x="13" y="13" width="7" height="7" rx="1.6" {...p}/></>,
    rows:     <path d="M4 6h16M4 12h16M4 18h16" {...p}/>,
    cards:    <><rect x="4" y="5" width="16" height="6" rx="1.8" {...p}/><rect x="4" y="13" width="16" height="6" rx="1.8" {...p}/></>,
    lock:     <><rect x="5" y="11" width="14" height="9" rx="2.2" {...p}/><path d="M8 11V8a4 4 0 018 0v3" {...p}/></>,
    home:     <path d="M4 11l8-6 8 6M6 10v9h12v-9" {...p}/>,
    glass:    <><path d="M7 4h10l-1 6a4 4 0 01-8 0L7 4z" {...p}/><path d="M12 14v5M9 21h6" {...p}/></>,
    store:    <path d="M4 9l1-4h14l1 4M5 9h14v10H5zM9 19v-5h6v5" {...p}/>,
    bottle:   <><path d="M10 2.5h4M11 2.5v3.2c0 .9-.4 1.3-1 2-1 1.1-1.5 2-1.5 3.6V20a1.5 1.5 0 001.5 1.5h4A1.5 1.5 0 0019.5 20m-6-13.3c.6.7 1 1.1 1 2V20" {...p}/></>,
    chevR:    <path d="M9 6l6 6-6 6" {...p}/>,
    spark2:   <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18" {...p}/>,
    reset:    <path d="M4 12a8 8 0 108-8 8 8 0 00-6 2.7L4 9M4 4v3h3" {...p}/>,
    map:      <><path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4z" {...p}/><path d="M9 4v14M15 6v14" {...p}/></>,
    box:      <><path d="M4 8l8-4 8 4v8l-8 4-8-4z" {...p}/><path d="M4 8l8 4 8-4M12 12v8" {...p}/></>,
    globe:    <><circle cx="12" cy="12" r="8.5" {...p}/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17" {...p}/></>,
    heart:    <path d="M12 20.5s-7-4.6-7-9.7A3.6 3.6 0 0112 8a3.6 3.6 0 017 2.8c0 5.1-7 9.7-7 9.7z" {...p}/>,
    fork:     <><path d="M6 3v6a2 2 0 002 2 2 2 0 002-2V3M8 11v10" {...p}/><path d="M16 3c-1.4 1-2 3-2 5.5S14.6 12 16 12v9" {...p}/></>,
    bag:      <><path d="M6 8h12l-1 11.5a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 015 19.5L6 8z" {...p}/><path d="M9 8V6.5a3 3 0 016 0V8" {...p}/></>,
    spark3:   <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6z" fill={color} stroke="none"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" style={style}>{paths[name]}</svg>;
}

function VGlyph({ glyph, size = 14, color }) { return <Icon name={glyph} size={size} color={color} stroke={2.5} />; }

// ── Wine-type colour + first-class label tile ────────────
function typeColor(type) {
  return ({ 'Red':'#9b2f3a','White':'#b58a17','Rosé':'#d07a8a',
            'Sparkling':'#caa023','Dessert':'#a9772f','Fortified':'#7a3326' })[type] || '#9b2f3a';
}

// Label as first-class object — clean cropped-label placeholder with monogram.
function LabelTile({ wine, w = 56, h = 56, radius = 10, showType = false }) {
  const c = typeColor(wine.type);
  const initials = (wine.producer||'?').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  return (
    <div style={{ width:w, height:h, borderRadius:radius, flexShrink:0, position:'relative', overflow:'hidden',
      background:'#fbfbfc', border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
      {/* type colour band */}
      <div style={{ position:'absolute', left:0, top:0, bottom:0, width:Math.max(4,w*0.07), background:c }}/>
      <div style={{ position:'absolute', inset:0, opacity:0.06,
        backgroundImage:`repeating-linear-gradient(135deg, ${c} 0 1px, transparent 1px 8px)` }}/>
      <div style={{ position:'relative', textAlign:'center', lineHeight:1 }}>
        <div style={{ fontFamily:'var(--sans)', fontWeight:700, fontSize:Math.round(h*0.27), letterSpacing:0.4, color:T.ink }}>{initials}</div>
        {showType && <div style={{ fontFamily:'var(--mono)', fontSize:Math.max(8,h*0.11), color:c, marginTop:h*0.06, letterSpacing:0.4, textTransform:'uppercase' }}>{wine.type}</div>}
      </div>
    </div>
  );
}

// ── Verdict badge (read-only) — variant aware ────────────
function VerdictBadge({ id, variant = 'expressive', size = 'md' }) {
  const v = VERDICTS[id]; if (!v) return null;
  const sm = size==='sm';
  if (variant==='subtle') return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontFamily:'var(--sans)', fontSize:sm?12:12.5, fontWeight:600, color:v.color }}>
      <span style={{ width:7, height:7, borderRadius:99, background:v.color }}/>{v.label}
    </span>
  );
  if (variant==='glyph') return (
    <span title={v.label} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:sm?22:26, height:sm?22:26, borderRadius:99, background:v.bg, color:v.color }}>
      <VGlyph glyph={v.glyph} size={sm?12:14} color={v.color}/>
    </span>
  );
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:sm?'3px 8px':'5px 10px', borderRadius:7,
      background:v.bg, color:v.color, fontFamily:'var(--sans)', fontSize:sm?11.5:12.5, fontWeight:700, letterSpacing:0.1 }}>
      <VGlyph glyph={v.glyph} size={sm?11:13} color={v.color}/>{v.label}
    </span>
  );
}

// ── Verdict picker (signature capture interaction) ───────
function VerdictPicker({ value, onChange, variant = 'expressive' }) {
  const ids = ['buy','maybe','no'];
  if (variant==='subtle') return (
    <div style={{ display:'flex', gap:8 }}>
      {ids.map(id=>{ const v=VERDICTS[id]; const on=value===id; return (
        <button key={id} onClick={()=>onChange(id)} style={{ flex:1, padding:'13px 8px', borderRadius:11, cursor:'pointer',
          background:on?v.bg:'#fff', border:`1.5px solid ${on?v.color:T.line2}`, color:on?v.color:T.ink2,
          fontFamily:'var(--sans)', fontWeight:600, fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', gap:7, transition:'all .14s' }}>
          <span style={{ width:8, height:8, borderRadius:99, background:v.color, opacity:on?1:0.45 }}/>{v.label}
        </button> ); })}
    </div>
  );
  if (variant==='glyph') return (
    <div style={{ display:'flex', gap:18, justifyContent:'center' }}>
      {ids.map(id=>{ const v=VERDICTS[id]; const on=value===id; return (
        <button key={id} onClick={()=>onChange(id)} style={{ cursor:'pointer', background:'transparent', border:'none',
          display:'flex', flexDirection:'column', alignItems:'center', gap:9, padding:4, transition:'all .14s' }}>
          <span style={{ width:58, height:58, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center',
            background:on?v.bg:'#fff', border:`2px solid ${on?v.color:T.line2}`, transform:on?'scale(1.05)':'scale(1)', transition:'all .14s' }}>
            <VGlyph glyph={v.glyph} size={24} color={on?v.color:T.ink3}/>
          </span>
          <span style={{ fontFamily:'var(--sans)', fontSize:13, fontWeight:on?700:500, color:on?v.color:T.ink2 }}>{v.label}</span>
        </button> ); })}
    </div>
  );
  // expressive — large colour-filled segments
  return (
    <div style={{ display:'flex', gap:10 }}>
      {ids.map(id=>{ const v=VERDICTS[id]; const on=value===id; return (
        <button key={id} onClick={()=>onChange(id)} style={{ flex:1, padding:'15px 8px 13px', borderRadius:15, cursor:'pointer',
          background:on?v.color:'#fff', border:`1.5px solid ${on?v.color:T.line2}`,
          boxShadow:on?`0 7px 18px ${v.color}38`:'none', color:on?'#fff':v.color, transition:'all .15s',
          display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
          <span style={{ width:32, height:32, borderRadius:99, display:'flex', alignItems:'center', justifyContent:'center',
            background:on?'rgba(255,255,255,0.22)':v.bg }}>
            <VGlyph glyph={v.glyph} size={18} color={on?'#fff':v.color}/>
          </span>
          <span style={{ fontFamily:'var(--sans)', fontSize:14, fontWeight:700, letterSpacing:0.1 }}>{v.label}</span>
        </button> ); })}
    </div>
  );
}

// ── Chips ────────────────────────────────────────────────
function Chip({ label, on, onClick, color = T.ink, mini=false }) {
  return (
    <button onClick={onClick} style={{ padding:mini?'5px 11px':'7px 13px', borderRadius:99, cursor:onClick?'pointer':'default',
      background:on?T.ink:'#fff', border:`1px solid ${on?T.ink:T.line2}`, color:on?'#fff':T.ink2,
      fontFamily:'var(--sans)', fontSize:mini?12.5:13, fontWeight:on?600:500, whiteSpace:'nowrap', transition:'all .13s' }}>{label}</button>
  );
}

function WhereTag({ where, color = T.ink3 }) {
  const map = { home:['home','Home'], restaurant:['glass','Restaurant'], winery:['pin','Winery'] };
  const [ic,label] = map[where] || map.home;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, color, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:500 }}>
      <Icon name={ic} size={13} color={color} stroke={1.8}/>{label}
    </span>
  );
}

export { Icon, VGlyph, LabelTile, typeColor, VerdictBadge, VerdictPicker, Chip, WhereTag };
