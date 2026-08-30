// home.jsx — editorial front door. Progressive by cellar size, but curiosity
// (Learn + Explore) is available from the very first visit; personalization
// (the taste-portrait thread, the cellar rail) is what grows in.
import { T } from '../lib/data.js';
import { personalWines } from '../lib/palate.js';
import { Icon } from './ui.jsx';
import { BottlePhoto } from './bottle.jsx';
import { LearnCard } from './TodaysPour.jsx';
import { V_STATUS, V_NAV } from '../lib/constants.js';

const WINE_RED = '#9b2f3a';
const SOMMELIER_PROMPTS = ['What should I drink tonight?','Should I buy this bottle?','Explain Beaujolais'];
const DEST = [
  ['Shopping','Should I buy this bottle?','shopping'],
  ['At Home','What should I open tonight?','home'],
  ['Dining Out','Order with confidence.','dining'],
  ['Explore','Regions, grapes & pairings.','learn'],
];

// First-run: start the cellar (the one primary action at 0 wines).
function StartCard({ onShopping }){
  return (
    <div style={{ marginTop:22, border:`1px solid ${T.line}`, borderRadius:18, padding:'22px 20px', background:T.surface }}>
      <div style={{ fontFamily:'var(--serif)', fontSize:22, fontWeight:500, color:T.ink, letterSpacing:-0.3 }}>Start your cellar</div>
      <div style={{ fontSize:14.5, color:T.ink2, lineHeight:1.55, marginTop:8 }}>Snap a label or search a bottle you’re curious about. Wine Memory remembers it — and how it tasted once you’ve opened it.</div>
      <button onClick={onShopping} style={{ marginTop:16, width:'100%', padding:'14px', borderRadius:13, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:15, fontWeight:680, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
        <Icon name="plus" size={18} color="#fff"/> Add your first wine
      </button>
    </div>
  );
}

// Personalization thread (1+ wines): aspirational while developing, rewarding at 5+.
function PalateThread({ n, onPalate }){
  const ready = n >= 5;
  return (
    <button onClick={onPalate} style={{ width:'100%', display:'flex', alignItems:'center', gap:13, marginTop:14, padding:'15px 16px', background:T.surface, border:`1px solid ${T.line}`, borderRadius:16, cursor:'pointer', textAlign:'left', boxShadow:'0 4px 14px rgba(22,20,15,0.06)' }}>
      <span style={{ width:38, height:38, borderRadius:10, flexShrink:0, background:T.canvas, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="sparkle" size={18} color={WINE_RED}/></span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:'var(--mono)', fontSize:9.5, fontWeight:600, letterSpacing:'.18em', textTransform:'uppercase', color:WINE_RED }}>Your taste portrait</div>
        <div style={{ fontFamily:'var(--serif)', fontSize:18, color:T.ink, marginTop:2, lineHeight:1.1 }}>{ready ? 'Ready — see what you love' : 'Developing'}</div>
      </div>
      {!ready && <span style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, flexShrink:0 }}>{n} of 5</span>}
      <Icon name="arrow" size={18} color={T.ink}/>
    </button>
  );
}

function HomeScreen({ wines, onAsk, onShopping, onHome, onDiningOut, onExplore, onOpenWine, onCollection, onLearn, onPalate }){
  const recent = wines.slice().sort((a,b)=> new Date(b.added)-new Date(a.added)).slice(0,6);
  const n = wines.length;
  // The "n of 5" taste-portrait progress must count the same wines the palate
  // engine uses, or the thread reads "Ready" on demo bottles alone.
  const personalN = personalWines(wines).length;
  const route = { shopping:onShopping, home:onHome, dining:onDiningOut, learn:onExplore };
  // At 0 wines, lead with starting the cellar — so trim the destination tiles to
  // the two that work with an empty cellar AND keep curiosity immediate:
  // Explore (key 'learn') and Dining Out. Shopping/At Home return once there are wines.
  const dest = n === 0 ? DEST.filter(([,,k])=> k==='learn' || k==='dining') : DEST;

  return (
    <div style={{ height:'100%', overflowX:'hidden', overflowY:'auto', background:T.bg }}>
      <div style={{ paddingTop:V_STATUS }}/>
      <div style={{ padding:'10px 28px 0' }}>
        {/* wordmark */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontFamily:'var(--serif)', fontSize:23, fontWeight:500, color:T.ink, letterSpacing:0.2 }}>Wine Memory</div>
          <div style={{ fontFamily:'var(--sans)', fontSize:9.5, fontWeight:600, letterSpacing:'.28em', textTransform:'uppercase', color:T.ink3 }}>Sommelier</div>
        </div>

        {/* hero */}
        <h1 style={{ margin:'34px 0 0', fontSize:46, lineHeight:1.0, color:T.ink }}>What are we<br/><em style={{ fontStyle:'italic' }}>drinking?</em></h1>

        {/* sommelier */}
        <button onClick={()=>onAsk('')} style={{ width:'100%', display:'flex', alignItems:'center', gap:12, marginTop:26, background:'transparent', border:`1px solid ${T.line2}`, borderRadius:14, padding:'0 16px', height:54, cursor:'pointer', textAlign:'left' }}>
          <Icon name="sparkle" size={18} color={WINE_RED}/>
          <span style={{ flex:1, fontFamily:'var(--sans)', fontSize:15.5, color:T.ink3 }}>Ask your sommelier…</span>
          <Icon name="arrow" size={19} color={T.ink}/>
        </button>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:13 }}>
          {SOMMELIER_PROMPTS.map(p=>(
            <button key={p} onClick={()=>onAsk(p)} style={{ padding:'7px 13px', borderRadius:99, border:`1px solid ${T.line2}`, background:'transparent', color:T.ink2, fontFamily:'var(--sans)', fontSize:12.5, fontWeight:500, cursor:'pointer' }}>{p}</button>
          ))}
        </div>

        {/* 0 wines: starting the cellar is the one primary action */}
        {n === 0 && <StartCard onShopping={onShopping}/>}

        {/* Learn something in 30 seconds — curiosity, every stage */}
        {onLearn && <div style={{ marginTop:16 }}><LearnCard onOpen={onLearn}/></div>}

        {/* destinations */}
        <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:10 }}>
          {dest.map(([label,desc,key])=>(
            <button key={key} onClick={route[key]} style={{ width:'100%', display:'flex', alignItems:'center', gap:14, padding:'18px 18px', background:T.surface, border:'none', borderRadius:16, cursor:'pointer', textAlign:'left', boxShadow:'0 6px 18px rgba(22,20,15,0.09), 0 1px 2px rgba(22,20,15,0.05)' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontFamily:'var(--sans)', fontSize:10.5, fontWeight:600, letterSpacing:'.24em', textTransform:'uppercase', color:WINE_RED }}>{label}</div>
                <div style={{ fontFamily:'var(--serif)', fontSize:25, color:T.ink, marginTop:3, lineHeight:1.05 }}>{desc}</div>
              </div>
              <Icon name="arrow" size={19} color={T.ink}/>
            </button>
          ))}
        </div>

        {/* taste-portrait thread + cellar — only once there are wines */}
        {n > 0 ? (
          <div style={{ marginTop:24, borderTop:`1px solid ${T.line2}`, paddingTop:18, paddingBottom:V_NAV+96 }}>
            <PalateThread n={personalN} onPalate={onPalate}/>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', margin:'22px 0 14px' }}>
              <span style={{ fontFamily:'var(--sans)', fontSize:10.5, fontWeight:600, letterSpacing:'.24em', textTransform:'uppercase', color:T.ink3 }}>Your Cellar</span>
              <button onClick={onCollection} style={{ display:'inline-flex', alignItems:'center', gap:6, background:'none', border:'none', cursor:'pointer', fontFamily:'var(--sans)', fontSize:11, fontWeight:600, letterSpacing:'.16em', textTransform:'uppercase', color:T.ink2 }}>View all <Icon name="arrow" size={14} color={T.ink2}/></button>
            </div>
            <div style={{ display:'flex', gap:14, overflowX:'auto', margin:'0 -28px', padding:'0 28px 4px' }}>
              {recent.map(w=>(
                <button key={w.id} onClick={()=>onOpenWine(w.id)} style={{ flexShrink:0, width:110, border:'none', background:'none', padding:0, cursor:'pointer', textAlign:'left', display:'flex', flexDirection:'column' }}>
                  <BottlePhoto wine={w} w={110} h={142} rounded={4}/>
                  <div style={{ fontFamily:'var(--serif)', fontSize:14.5, color:T.ink, marginTop:10, lineHeight:1.18, height:33, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{w.name}</div>
                  <div style={{ fontFamily:'var(--sans)', fontSize:11, color:T.ink3, marginTop:5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%' }}>{(w.vintage&&w.vintage!=='NV'?w.vintage+' · ':'')}{w.region}{w.country?', '+w.country:''}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ height:`calc(${V_NAV+40}px + env(safe-area-inset-bottom))` }}/>
        )}
      </div>
    </div>
  );
}

export { HomeScreen };
