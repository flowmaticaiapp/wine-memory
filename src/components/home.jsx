import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { BottlePhoto } from './bottle.jsx';
import { V_STATUS, V_NAV } from '../lib/constants.js';
import { consolidateCellarBottles } from '../lib/cellar-display.js';

const PROMPTS = [['What to open tonight','What should I open tonight?'],['Should I buy this?','Should I buy this bottle?'],['Wine for pasta','What wine should I drink with pasta?'],['Explain Beaujolais','Explain Beaujolais']];
function Hamburger({ onClick }){ return <button aria-label="Open menu" onClick={onClick} style={{width:40,height:40,border:0,background:'transparent',padding:8,cursor:'pointer',display:'flex',flexDirection:'column',justifyContent:'center',gap:5}}>{[0,1,2].map(i=><span key={i} style={{display:'block',width:24,height:2,background:T.ink,borderRadius:2}}/>)}</button>; }
function HomeScreen({ wines, onAsk, onMenu, onOpenWine, onCollection, onFavorites, onWishlist, onMustTry, onPairings }){
  const recent=consolidateCellarBottles(wines.slice().sort((a,b)=>new Date(b.added)-new Date(a.added))).slice(0,6);
  const cards=[['Favorites',onFavorites],['Wishlist',onWishlist],['Must Try',onMustTry],['Pairings',onPairings]];
  return <div style={{height:'100%',overflowX:'hidden',overflowY:'auto',background:'#fff'}}>
    {/* Sticky app bar (sticky placement per the Cellar header in visual.jsx):
        the status-bar space lives INSIDE the sticky element as paddingTop — a
        separate spacer would scroll away and let content slide under the
        status area. `paddingTop` is set AFTER the `padding` shorthand so the
        shorthand cannot overwrite it. The background is SOLID white, not the
        Cellar's translucent blur: the Home hero and dark prompt pills sit
        directly beneath this bar, and ghosting through a blur read as broken. */}
    <header style={{position:'sticky',top:0,zIndex:30,background:'#fff',height:56,display:'grid',gridTemplateColumns:'56px 1fr 56px',alignItems:'center',borderBottom:`1px solid ${T.line}`,padding:'0 18px',paddingTop:V_STATUS,boxSizing:'content-box'}}><Hamburger onClick={onMenu}/><div style={{fontFamily:'var(--serif)',fontSize:20,textAlign:'center',color:T.ink}}>Wine Memory</div><div/></header>
    <main style={{padding:'25px 28px',paddingBottom:V_NAV+68}}>
      <h1 style={{margin:0,fontFamily:'var(--sans)',fontSize:45,lineHeight:1.02,letterSpacing:'-2.2px',fontWeight:760,color:T.ink}}>What are we<br/><em style={{fontStyle:'italic'}}>drinking?</em></h1>
      <button onClick={()=>onAsk('')} style={{width:'100%',height:54,marginTop:27,border:`1px solid ${T.line2}`,borderRadius:14,background:'#fff',display:'flex',alignItems:'center',gap:12,padding:'0 16px',cursor:'pointer'}}><Icon name="sparkle" size={17} color={T.ink}/><span style={{flex:1,textAlign:'left',fontSize:15.5,color:T.ink3}}>Ask your sommelier…</span><Icon name="arrow" size={20} color={T.ink}/></button>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:13}}>{PROMPTS.map(([label,q])=><button key={label} onClick={()=>onAsk(q)} style={{height:49,border:0,borderRadius:13,background:T.ink,color:'#fff',fontSize:13.5,fontWeight:560,cursor:'pointer'}}>{label}</button>)}</div>
      <div style={{display:'flex',flexDirection:'column',gap:10,marginTop:25}}>{cards.map(([label,action])=><button key={label} onClick={action} style={{height:66,border:0,borderRadius:16,background:T.surface,boxShadow:'0 7px 20px rgba(22,20,15,.09)',padding:'0 19px',display:'flex',alignItems:'center',cursor:'pointer'}}><span style={{flex:1,textAlign:'left',fontFamily:'var(--serif)',fontSize:24,color:T.ink}}>{label}</span><Icon name="arrow" size={20} color={T.ink}/></button>)}</div>
      <div style={{borderTop:`1px solid ${T.line2}`,marginTop:28,paddingTop:18,display:'flex',alignItems:'center',justifyContent:'space-between'}}><span style={{fontSize:10.5,fontWeight:650,letterSpacing:'.25em',textTransform:'uppercase',color:T.ink3}}>Your Cellar</span><button onClick={onCollection} style={{border:0,background:'none',display:'flex',alignItems:'center',gap:6,fontSize:10.5,fontWeight:650,letterSpacing:'.18em',textTransform:'uppercase',color:T.ink2,cursor:'pointer'}}>View all <Icon name="arrow" size={14} color={T.ink2}/></button></div>
      {recent.length>0&&<div style={{display:'flex',gap:13,overflowX:'auto',margin:'14px -28px 0',padding:'0 28px 4px'}}>{recent.map(w=><button key={w.id} onClick={()=>onOpenWine(w.id)} style={{width:105,flexShrink:0,border:0,background:'none',padding:0,textAlign:'left',cursor:'pointer'}}><BottlePhoto wine={w} w={105} h={126} rounded={5}/><div style={{fontFamily:'var(--serif)',fontSize:14,marginTop:8,lineHeight:1.2,color:T.ink}}>{w.producer ? `${w.producer} ` : ''}{w.name}</div><div style={{fontSize:10.5,color:T.ink3,marginTop:3,lineHeight:1.25}}>{[w.vintage, w.quantity>1?`${w.quantity} bottles`:null].filter(Boolean).join(' · ')}</div></button>)}</div>}
    </main></div>;
}
export { HomeScreen, Hamburger };
