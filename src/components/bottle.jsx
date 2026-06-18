// bottle.jsx — HONEST bottle imagery + flavor viz.
// Real photo when wine.photo is present; otherwise a clearly-labelled "Image needed"
// placeholder (never a fabricated label that implies a specific bottle).
// Ported from app/bottle.jsx.
import { T, FLAVOR_FAMILIES } from '../lib/data.js';
import { Icon, typeColor } from './ui.jsx';

function familyHue(wine){ const f=FLAVOR_FAMILIES.find(x=>x.id===wine.family); return f?f.hue:340; }
function typeHue(type){ return ({ 'Red':350,'White':46,'Rosé':338,'Sparkling':46,'Dessert':36,'Fortified':12 })[type] ?? 350; }

// BottleImage — the single image unit used everywhere.
function BottlePhoto({ wine, w, h, rounded=16, flat=false }){
  const small = Math.min(w,h) < 80;

  if (wine.photo){
    return <div style={{ width:w, height:h, borderRadius:rounded, overflow:'hidden', background:'#efece5', border:flat?'none':`1px solid ${T.line}` }}>
      <img src={wine.photo} alt={wine.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/></div>;
  }

  return (
    <div style={{ width:w, height:h, borderRadius:rounded, overflow:'hidden', position:'relative',
      background:T.raised, border:flat?'none':`1px solid ${T.line}`,
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:small?5:9 }}>
      <Icon name="bottle" size={small?Math.round(h*0.34):Math.min(w*0.34,52)} color={T.ink4} stroke={1.4}/>
      {!small && <div style={{ fontFamily:'var(--mono)', fontSize:Math.max(8.5,Math.min(10.5,w*0.07)), color:T.ink3, letterSpacing:0.4, textTransform:'uppercase' }}>Add label photo</div>}
    </div>
  );
}

// ── Flavor profile — labeled bars (AI-populated) ──
const AXES = [['body','Body'],['acidity','Acidity'],['tannin','Tannin'],['fruit','Fruit'],['oak','Oak']];
function FlavorBars({ flavor, color }){
  if (!flavor) return null;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:11 }}>
      {AXES.map(([k,label])=>(
        <div key={k} style={{ display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ width:58, fontFamily:'var(--sans)', fontSize:13, color:T.ink2, fontWeight:540 }}>{label}</div>
          <div style={{ flex:1, display:'flex', gap:4 }}>
            {[0,1,2,3,4].map(i=> <div key={i} style={{ flex:1, height:7, borderRadius:99, background: i < flavor[k] ? color : T.line2 }}/>)}
          </div>
        </div>
      ))}
    </div>
  );
}
function FlavorMini({ flavor, color, h=22 }){
  if (!flavor) return null;
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:h }}>
      {AXES.map(([k])=> <div key={k} style={{ width:4, height:Math.max(3,(flavor[k]/5)*h), borderRadius:2, background:color, opacity:0.9 }}/>)}
    </div>
  );
}

export { BottlePhoto, FlavorBars, FlavorMini, familyHue, typeHue };
