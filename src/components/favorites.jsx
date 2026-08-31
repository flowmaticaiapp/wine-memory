// favorites.jsx — an honest placeholder, deliberately NOT built from Buy Again.
//
// Favorites is a different concept from the "Buy Again" verdict: it will hold
// bottles the user STARS, which needs its own reviewed schema change. Until
// that exists, this screen says exactly what exists and what doesn't, instead
// of dressing the Buy Again filter up as a feature it isn't — and it still
// hands the user the nearest real thing, one tap away.
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { V_STATUS } from '../lib/constants.js';

function FavoritesComing({ onClose, onBuyAgain }){
  return (
    <div style={{ position:'absolute', inset:0, zIndex:75, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ paddingTop:V_STATUS, borderBottom:`1px solid ${T.line}`, flexShrink:0 }}>
        <div style={{ display:'grid', gridTemplateColumns:'46px 1fr 46px', alignItems:'center', padding:'4px 10px 10px' }}>
          <button aria-label="Back" onClick={onClose} style={{ border:0, background:'none', padding:8, cursor:'pointer' }}><Icon name="back" size={21} color={T.ink}/></button>
          <div style={{ fontFamily:'var(--serif)', fontSize:20, textAlign:'center', color:T.ink }}>Favorites</div>
          <div/>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'44px 24px 40px', textAlign:'center' }}>
        <Icon name="heart" size={34} color={T.ink4}/>
        <div style={{ fontFamily:'var(--serif)', fontSize:22, color:T.ink, marginTop:14 }}>Favorites is coming</div>
        <div style={{ fontSize:14, color:T.ink2, lineHeight:1.55, marginTop:9, maxWidth:'32ch', margin:'9px auto 0' }}>
          Soon you’ll star the bottles you love most and they’ll live here. Until then, the wines you’ve rated “Buy Again” are in your Cellar.
        </div>
        <button onClick={onBuyAgain} style={{ marginTop:20, padding:'14px 22px', borderRadius:12, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:14.5, fontWeight:680, cursor:'pointer' }}>See your Buy Again wines</button>
      </div>
    </div>
  );
}

export { FavoritesComing };
