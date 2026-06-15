// palate.jsx — My Palate: taste insights + My Favorite Pairings.
// Ported from app/palate.jsx.
import { T } from '../lib/data.js';
import { Icon, VerdictBadge, typeColor } from './ui.jsx';
import { V_STATUS, V_NAV } from '../lib/constants.js';

function computeInsights(wines){
  const withF = wines.filter(w=>w.flavor);
  const buys = wines.filter(w=>w.verdict==='buy');
  const out = [];
  // acidity lean
  if (withF.length){
    const hi = withF.filter(w=>w.flavor.acidity>=4).length;
    if (hi/withF.length >= 0.5) out.push({ icon:'sparkle', color:T.totry, title:'You lean high-acid', text:'Bright, refreshing wines show up more than any other style in your collection.' });
  }
  // go-to grape (among buys, else all)
  const pool = buys.length?buys:wines;
  const gt={}; pool.forEach(w=>{ if(w.grape) gt[w.grape]=(gt[w.grape]||0)+1; });
  const topG = Object.entries(gt).sort((a,b)=>b[1]-a[1])[0];
  if (topG && topG[1]>=2) out.push({ icon:'heart', color:T.no, title:`${topG[0]} is your go-to`, text:`You ${buys.length?'mark':'save'} ${topG[0]} ${buys.length?'“Buy Again”':'wines'} more than anything else.` });
  // country
  const ct={}; wines.forEach(w=>{ if(w.country) ct[w.country]=(ct[w.country]||0)+1; });
  const topC = Object.entries(ct).sort((a,b)=>b[1]-a[1])[0];
  if (topC && topC[1]>=2) out.push({ icon:'globe', color:T.buy, title:`Drawn to ${topC[0]}`, text:`Most of your wines come from ${topC[0]} — a clear regional pull.` });
  // oak
  if (buys.filter(w=>w.flavor).length>=2){
    const oak = buys.filter(w=>w.flavor); const avg = oak.reduce((s,w)=>s+w.flavor.oak,0)/oak.length;
    if (avg<=1.6) out.push({ icon:'fork', color:T.maybe, title:'Fresh over oaky', text:'Your favorites skip heavy oak — you like wines that taste alive, not woody.' });
  }
  return out.slice(0,4);
}

function PalateScreen({ wines, pairings, onOpenWine, onAsk }){
  const insights = computeInsights(wines);
  const buys = wines.filter(w=>w.verdict==='buy').length;

  return (
    <div style={{ height:'100%', overflow:'auto', background:'#fff' }}>
      <div style={{ paddingTop:V_STATUS }}/>
      <div style={{ padding:'8px 18px 0' }}>
        <h1 style={{ margin:0, fontSize:27, fontWeight:780, letterSpacing:-0.9 }}>My Palate</h1>
        <p style={{ margin:'6px 0 0', fontSize:14, color:T.ink3, lineHeight:1.5 }}>What your wines and pairings reveal about your taste.</p>
      </div>

      <div style={{ padding:'0 18px', paddingBottom:V_NAV+96 }}>
        {/* stat row */}
        <div style={{ display:'flex', gap:10, marginTop:18 }}>
          {[[wines.length,'wines'],[buys,'buy again'],[(pairings||[]).length,'pairings']].map(([n,l],i)=>(
            <div key={i} style={{ flex:1, padding:'14px 12px', borderRadius:13, border:`1px solid ${T.line}`, background:T.canvas, textAlign:'center' }}>
              <div style={{ fontSize:24, fontWeight:780, letterSpacing:-0.5 }}>{n}</div>
              <div style={{ fontSize:11.5, color:T.ink3, marginTop:1 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* insights */}
        <div style={{ marginTop:26 }}>
          <Lbl2>What we’re learning</Lbl2>
          {insights.length ? <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {insights.map((ins,i)=>(
              <div key={i} style={{ display:'flex', gap:13, padding:'15px', borderRadius:14, border:`1px solid ${T.line}`, background:'#fff' }}>
                <span style={{ width:38, height:38, borderRadius:10, background:`${ins.color}1a`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Icon name={ins.icon} size={19} color={ins.color}/></span>
                <div><div style={{ fontSize:15, fontWeight:700, letterSpacing:-0.2 }}>{ins.title}</div>
                <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.45, marginTop:2 }}>{ins.text}</div></div>
              </div>
            ))}
          </div> : <div style={{ padding:'16px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas, fontSize:13.5, color:T.ink2 }}>Rate and save a few more wines and your taste profile will start to take shape here.</div>}
        </div>

        {/* favorite pairings */}
        <div style={{ marginTop:28 }}>
          <Lbl2>My favorite pairings</Lbl2>
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
          </div> : <div style={{ padding:'20px 16px', border:`1px dashed ${T.line2}`, borderRadius:13, background:T.canvas, textAlign:'left' }}>
            <div style={{ fontSize:14, fontWeight:640, color:T.ink }}>No saved pairings yet</div>
            <div style={{ fontSize:13, color:T.ink3, marginTop:4, lineHeight:1.5 }}>Ask the sommelier what to drink, then tap <b style={{ color:T.ink }}>Save this pairing</b> — they’ll collect here and sharpen your palate over time.</div>
            <button onClick={()=>onAsk('')} style={{ marginTop:14, padding:'11px 16px', borderRadius:11, border:'none', background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:13.5, fontWeight:650, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7 }}><Icon name="fork" size={16} color="#fff"/> Pair a meal</button>
          </div>}
        </div>
      </div>
    </div>
  );
}
function Lbl2({ children }){ return <div style={{ fontFamily:'var(--mono)', fontSize:11, color:T.ink3, letterSpacing:0.5, textTransform:'uppercase', marginBottom:13 }}>{children}</div>; }

export { PalateScreen };
