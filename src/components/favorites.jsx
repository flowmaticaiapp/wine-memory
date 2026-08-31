// favorites.jsx — bottles the user explicitly stars.
// Favorites is independent of "Buy Again": a verdict records the tasting;
// a star is a personal shortcut. Samples never appear because they are not
// the user's real wine history.
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { BottlePhoto } from './bottle.jsx';
import { V_STATUS } from '../lib/constants.js';
import { favoriteWines } from '../lib/favorites.js';

function FavoriteRow({ wine, onOpen, onRemove }){
  return <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px', border:`1px solid ${T.line}`, borderRadius:14, background:'#fff', marginBottom:10 }}>
    <button onClick={()=>onOpen(wine.id)} aria-label={`Open ${wine.name}`} style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:0, padding:0, border:0, background:'none', textAlign:'left', cursor:'pointer' }}>
      <BottlePhoto wine={wine} w={62} h={72} rounded={9}/>
      <span style={{ minWidth:0 }}>
        <span style={{ display:'block', fontSize:15.5, fontWeight:700, color:T.ink, lineHeight:1.25 }}>{wine.producer ? wine.producer+' ' : ''}{wine.name}</span>
        <span style={{ display:'block', fontSize:12.5, color:T.ink3, marginTop:4 }}>{[wine.vintage, wine.grape||wine.type, wine.region].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
    <button onClick={()=>onRemove(wine.id)} aria-label={`Remove ${wine.name} from Favorites`} style={{ width:42, height:42, flexShrink:0, borderRadius:99, border:`1px solid ${T.line2}`, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}><Icon name="starFill" size={21} color="#a67c24"/></button>
  </div>;
}

function FavoritesScreen({ wines, onClose, onOpen, onToggle }){
  const favorites = favoriteWines(wines);
  return (
    <div style={{ position:'absolute', inset:0, zIndex:75, background:'#fff', display:'flex', flexDirection:'column' }}>
      <div style={{ paddingTop:V_STATUS, borderBottom:`1px solid ${T.line}`, flexShrink:0 }}>
        <div style={{ display:'grid', gridTemplateColumns:'46px 1fr 46px', alignItems:'center', padding:'4px 10px 10px' }}>
          <button aria-label="Back" onClick={onClose} style={{ border:0, background:'none', padding:8, cursor:'pointer' }}><Icon name="back" size={21} color={T.ink}/></button>
          <div style={{ fontFamily:'var(--serif)', fontSize:20, textAlign:'center', color:T.ink }}>Favorites</div>
          <div/>
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 40px' }}>
        {favorites.length>0 ? <>
          <div style={{ fontSize:12.5, color:T.ink3, marginBottom:12 }}>{favorites.length} starred bottle{favorites.length===1?'':'s'} from your cellar.</div>
          {favorites.map(w=><FavoriteRow key={w.id} wine={w} onOpen={onOpen} onRemove={(id)=>onToggle(id,false)}/>)}
        </> : <div style={{ padding:'44px 24px 0', textAlign:'center' }}>
          <Icon name="star" size={36} color={T.ink4}/>
          <div style={{ fontFamily:'var(--serif)', fontSize:22, color:T.ink, marginTop:14 }}>No favorites yet</div>
          <div style={{ fontSize:14, color:T.ink2, lineHeight:1.55, marginTop:9, maxWidth:'32ch', margin:'9px auto 0' }}>Open any bottle in your cellar and tap the star. Favorites are separate from your Buy Again rating.</div>
        </div>}
      </div>
    </div>
  );
}

export { FavoritesScreen };
