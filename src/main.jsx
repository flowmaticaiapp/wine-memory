// main.jsx — app shell. Home · Cellar · Palate · Explore + floating Add. Mounts to #root.
// Ported from app/visualapp.jsx.
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

import { T, autoEnrich, newDiningExperience } from './lib/data.js';
import { Icon } from './components/ui.jsx';
import { IOSDevice } from './components/IOSFrame.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakButton } from './components/TweaksPanel.jsx';
import { HomeScreen } from './components/home.jsx';
import { Collection, VisualDetail } from './components/visual.jsx';
import { PalateScreen } from './components/palate.jsx';
import { ExploreScreen } from './components/explore.jsx';
import { AddHub, SearchAdd, OrderImport } from './components/add.jsx';
import { SnapLabel } from './components/snap.jsx';
import { PairingSearch } from './components/pairing.jsx';
import { DiningOut } from './components/diningout.jsx';
import { supabase, supabaseConfigured } from './lib/supabase.js';
import * as db from './lib/db.js';
import { AuthScreen, FullScreenLoader, signOut } from './components/Auth.jsx';

const VTWEAKS = {
  columns: '2',
  verdictStyle: 'expressive',
};

function VNav({ tab, setTab }){
  const item=(id,icon,label)=>{ const on=tab===id; return (
    <button onClick={()=>setTab(id)} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3, padding:'9px 0 4px', background:'none', border:'none', cursor:'pointer' }}>
      <Icon name={icon} size={22} color={on?T.ink:T.ink4} stroke={on?2:1.7}/>
      <span style={{ fontFamily:'var(--sans)', fontSize:10, fontWeight:on?680:540, color:on?T.ink:T.ink4 }}>{label}</span>
    </button> ); };
  return (
    <div style={{ position:'absolute', left:0, right:0, bottom:0, zIndex:40, paddingBottom:'calc(8px + env(safe-area-inset-bottom))', background:'rgba(255,255,255,0.92)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', borderTop:`1px solid ${T.line}`, display:'flex', paddingLeft:6, paddingRight:6 }}>
      {item('home','home','Home')}
      {item('collection','collection','Cellar')}
      <div style={{ width:62, flexShrink:0 }}/>
      {item('palate','heart','Palate')}
      {item('account','user','Account')}
    </div>
  );
}
function VFAB({ onClick }){
  return <button onClick={onClick} aria-label="Add wine" style={{ position:'absolute', bottom:'calc(18px + env(safe-area-inset-bottom))', left:'50%', transform:'translateX(-50%)', zIndex:50, width:56, height:56, borderRadius:99, background:T.ink, border:'3px solid #fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 18px rgba(17,17,19,0.34)' }}><Icon name="plus" size={26} color="#fff" stroke={2.4}/></button>;
}
function VToast({ toast }){
  if(!toast) return null;
  return <div style={{ position:'absolute', bottom:'calc(92px + env(safe-area-inset-bottom))', left:'50%', transform:'translateX(-50%)', zIndex:95, display:'flex', alignItems:'center', gap:9, background:T.ink, color:'#fff', padding:'12px 18px', borderRadius:99, boxShadow:'0 8px 24px rgba(17,17,19,0.3)', whiteSpace:'nowrap', animation:'wmToast .3s cubic-bezier(.2,.8,.2,1)' }}>
    <span style={{ width:20, height:20, borderRadius:99, background:T.buy, display:'flex', alignItems:'center', justifyContent:'center' }}><Icon name="check" size={13} color="#fff" stroke={3}/></span>
    <span style={{ fontFamily:'var(--sans)', fontSize:14, fontWeight:600 }}>{toast}</span></div>;
}

function AccountScreen({ email, provider }){
  const method = provider==='google' ? 'Google' : 'email magic link';
  return (
    <div style={{ height:'100%', overflowX:'hidden', overflowY:'auto', background:'#fff' }}>
      <div style={{ paddingTop:50 }}/>
      <div style={{ padding:'8px 18px', paddingBottom:160 }}>
        <h1 style={{ margin:0, fontSize:27, fontWeight:780, letterSpacing:-0.9 }}>Account</h1>
        <div style={{ marginTop:20, display:'flex', alignItems:'center', gap:14, padding:'16px', borderRadius:16, background:T.surface, border:`1px solid ${T.line}` }}>
          <span style={{ width:48, height:48, borderRadius:99, background:'#fff', border:`1px solid ${T.line2}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Icon name="user" size={24} color={T.ink2}/></span>
          <div style={{ minWidth:0 }}>
            <div style={{ fontSize:15.5, fontWeight:680, color:T.ink, wordBreak:'break-all' }}>{email}</div>
            <div style={{ fontSize:13, color:T.ink3, marginTop:2 }}>Signed in with {method}</div>
          </div>
        </div>
        <button onClick={signOut} style={{ width:'100%', marginTop:14, padding:'15px', borderRadius:13, border:`1px solid ${T.line2}`, background:'#fff', color:T.ink, fontFamily:'var(--sans)', fontSize:15, fontWeight:680, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
          <Icon name="lock" size={17} color={T.ink}/> Sign out
        </button>
        <div style={{ marginTop:20, fontFamily:'var(--mono)', fontSize:10.5, color:T.ink4, letterSpacing:0.3 }}>Wine Memory</div>
      </div>
    </div>
  );
}

// Scales the device to fit the viewport (replaces the prototype's wmFit script).
function useDeviceFit(){
  useEffect(()=>{
    const el = document.getElementById('wm-device');
    const fit = ()=>{ if(!el) return;
      const s = Math.min(1, (window.innerHeight - 28) / 852, (window.innerWidth - 28) / 393);
      el.style.transform = 'scale(' + s + ')';
    };
    fit();
    window.addEventListener('resize', fit);
    return ()=> window.removeEventListener('resize', fit);
  },[]);
}

function VApp({ session }){
  const userId = session.user.id;
  const [t,setTweak]=useTweaks(VTWEAKS);
  const [wines,setWines]=useState(null);   // null = loading
  const [pairings,setPairings]=useState([]);
  const [dining,setDining]=useState([]);
  const [tab,setTab]=useState('home');
  const [filter,setFilter]=useState('all');
  const [overlay,setOverlay]=useState(null); // addhub|searchadd|import|search|diningout|explore|{detail}
  const [exploreRegion,setExploreRegion]=useState('Oregon');
  const [seed,setSeed]=useState('');
  const [toast,setToast]=useState(null);
  useDeviceFit();
  // On a real phone the app should be full-screen; the simulated iPhone frame is
  // only a desktop showcase. Render full-bleed on narrow viewports.
  const [isMobile, setIsMobile] = useState(typeof window!=='undefined' && window.innerWidth < 600);
  useEffect(()=>{ const f=()=> setIsMobile(window.innerWidth < 600); window.addEventListener('resize', f); return ()=> window.removeEventListener('resize', f); },[]);
  const flash=(m)=>{ setToast(m); setTimeout(()=>setToast(null),2200); };

  // load this user's cellar + pairings
  useEffect(()=>{ let on=true;
    (async()=>{ try{
      const [ws,ps] = await Promise.all([db.fetchWines(), db.fetchPairings()]);
      if(on){ setWines(ws); setPairings(ps); }
    }catch(e){ console.error('Load failed', e); if(on){ setWines([]); flash('Could not load your cellar'); } } })();
    return ()=>{ on=false; };
  },[]);

  const cols = t.columns==='3'?3:2;
  const loading = wines===null;
  const updateWine=(id,patch)=>{ setWines(ws=>ws.map(w=>w.id===id?{...w,...patch}:w)); db.updateWine(id,patch).catch(e=>console.error('Update failed', e)); };
  const addWine=async(w)=>{ try{ const saved=await db.insertWine(userId, autoEnrich(w)); setWines(ws=>[saved,...ws]); setOverlay(null); flash('Added to your collection'); }catch(e){ console.error(e); flash('Could not save'); } };
  const addMany=async(arr)=>{ const saved=await db.insertWines(userId, arr.map(autoEnrich)); setWines(ws=>[...saved,...ws]); return saved; };
  const viewToTry=()=>{ setOverlay(null); setTab('collection'); setFilter('totry'); };
  const clearSamples=async()=>{ try{ await db.deleteSamples(); setWines(ws=>ws.filter(w=>!w.sample)); }catch(e){ console.error(e); } };
  const ask=(q)=>{ setSeed(q||''); setOverlay('search'); };
  const explore=(r)=>{ setExploreRegion(r); setOverlay('explore'); };
  const savePairing=async(p)=>{ try{ const sp=await db.insertPairing(userId,p); setPairings(ps=>[sp,...ps]); flash('Saved to My Palate'); }catch(e){ console.error(e); } };
  const addPhoto=async(id,dataUrl)=>{ try{ const url=await db.setWinePhoto(userId,id,dataUrl); setWines(ws=>ws.map(w=>w.id===id?{...w,photo:url}:w)); flash('Photo added'); }catch(e){ console.error('photo upload failed', e); flash('Could not upload photo'); } };
  const saveDining=async({experience,pairing})=>{ setDining(ds=>[newDiningExperience(experience),...ds]); if(pairing){ try{ const sp=await db.insertPairing(userId,pairing); setPairings(ps=>[sp,...ps]); }catch(e){ console.error(e); } } };

  const detail = (overlay&&overlay.detail&&wines)? wines.find(w=>w.id===overlay.detail):null;
  const fullPanel = ['searchadd','import','search','diningout','snap'].includes(overlay);
  const hasSamples = wines? wines.some(w=>w.sample) : false;

  const screen = (
    <div style={{ position:'relative', height:'100%', width:'100%', background:'#fff', overflow:'hidden' }}>
      {loading && <div style={{ height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}><svg width={30} height={30} viewBox="0 0 24 24" style={{ animation:'wmSpin .8s linear infinite' }}><circle cx="12" cy="12" r="9" fill="none" stroke={T.line2} strokeWidth="2.6"/><path d="M21 12a9 9 0 00-9-9" fill="none" stroke={T.ink} strokeWidth="2.6" strokeLinecap="round"/></svg></div>}
      {!loading && <>
      {tab==='home' && <HomeScreen wines={wines} onAsk={ask} onShopping={()=>setOverlay('addhub')} onHome={()=>ask('')} onDiningOut={()=>setOverlay('diningout')} onExplore={()=>setTab('learn')} onOpenWine={(id)=>setOverlay({detail:id})} onCollection={()=>setTab('collection')}/>}
      {tab==='collection' && <Collection wines={wines} cols={cols} filter={filter} setFilter={setFilter} hasSamples={hasSamples} onClearSamples={clearSamples} onOpen={(id)=>setOverlay({detail:id})} onSearch={()=>ask('')}/>}
      {tab==='palate' && <PalateScreen wines={wines} pairings={pairings} onOpenWine={(id)=>setOverlay({detail:id})} onAsk={ask}/>}
      {tab==='learn' && <ExploreScreen region={exploreRegion} wines={wines} onPick={setExploreRegion} onOpenWine={(id)=>setOverlay({detail:id})}/>}
      {tab==='account' && <AccountScreen email={session.user.email} provider={session.user.app_metadata?.provider}/>}

      {!detail && !fullPanel && (<><VNav tab={tab} setTab={setTab}/><VFAB onClick={()=>setOverlay('addhub')}/></>)}

      {overlay==='addhub' && <AddHub onClose={()=>setOverlay(null)} onSearch={()=>setOverlay('searchadd')} onImport={()=>setOverlay('import')} onSnap={()=>setOverlay('snap')}/>}
      {overlay==='snap' && <SnapLabel onClose={()=>setOverlay(null)} onSave={addWine} onSearchInstead={()=>setOverlay('searchadd')} verdictVariant={t.verdictStyle}/>}
      {overlay==='searchadd' && <SearchAdd onClose={()=>setOverlay(null)} onSave={addWine} verdictVariant={t.verdictStyle}/>}
      {overlay==='import' && <OrderImport onClose={()=>setOverlay(null)} onAddMany={addMany} onViewToTry={viewToTry}/>}
      {overlay==='search' && <PairingSearch wines={wines} onClose={()=>setOverlay(null)} onOpen={(id)=>setOverlay({detail:id})} initialQuery={seed} onSavePairing={savePairing}/>}
      {overlay==='diningout' && <DiningOut onClose={()=>setOverlay(null)} onSave={saveDining}/>}
      {detail && <VisualDetail wine={detail} all={wines} onBack={()=>setOverlay(null)} onOpen={(id)=>setOverlay({detail:id})} onUpdate={updateWine} onAddPhoto={addPhoto} verdictVariant={t.verdictStyle}/>}
      </>}

      <VToast toast={toast}/>
    </div>
  );

  const tweaks = (
    <TweaksPanel>
      <TweakSection label="Grid density" />
      <TweakRadio label="Columns" value={t.columns} options={['2','3']} onChange={(v)=>setTweak('columns',v)} />
      <TweakSection label="Verdict style" />
      <TweakRadio label="Buy / Maybe / No UI" value={t.verdictStyle} options={['expressive','subtle','glyph']} onChange={(v)=>setTweak('verdictStyle',v)} />
      <TweakSection label="Account" />
      <div style={{ fontSize:11, color:'rgba(41,38,27,.6)', wordBreak:'break-all' }}>{session.user.email}</div>
      <TweakButton label="Sign out" secondary onClick={signOut} />
    </TweaksPanel>
  );

  // Mobile: the app IS the screen, full-bleed (no simulated device frame).
  // Screens already reserve V_STATUS(50) of top space; on taller notches we top up
  // the difference so content clears the status bar without double-counting.
  if (isMobile) return (
    <div style={{ position:'relative', width:'100%', height:'100dvh', background:'#fff', overflow:'hidden', boxSizing:'border-box', paddingTop:'max(0px, calc(env(safe-area-inset-top) - 50px))' }}>
      {screen}
      {tweaks}
    </div>
  );

  // Desktop: present the app inside the iPhone mockup, centered.
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:14, boxSizing:'border-box', background:T.canvas }}>
      <div id="wm-device">
      <IOSDevice width={393} height={852} dark={false}>
        {screen}
      </IOSDevice>
      </div>
      <TweaksToggle/>
      {tweaks}
    </div>
  );
}

// Standalone affordance: the design tool's host normally opens the Tweaks panel.
// Outside that host we surface a small toggle that fires the same message.
function TweaksToggle(){
  return (
    <button onClick={()=>window.postMessage({ type:'__activate_edit_mode' },'*')}
      title="Tweaks" aria-label="Open tweaks"
      style={{ position:'fixed', left:16, bottom:16, zIndex:2147483640, width:40, height:40, borderRadius:12,
        background:'rgba(250,249,247,0.85)', border:'0.5px solid rgba(0,0,0,0.12)', cursor:'pointer',
        boxShadow:'0 4px 16px rgba(0,0,0,0.16)', display:'flex', alignItems:'center', justifyContent:'center',
        backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)' }}>
      <Icon name="spark2" size={20} color="#29261b"/>
    </button>
  );
}

// Auth gate: checking → loader, no session → sign-in, session → the app.
function Root(){
  const [session,setSession]=useState(undefined); // undefined = checking
  useEffect(()=>{
    if(!supabaseConfigured){ setSession(null); return; }
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const { data:sub } = supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return ()=> sub.subscription.unsubscribe();
  },[]);
  if(session===undefined) return <FullScreenLoader/>;
  if(!session) return <AuthScreen/>;
  return <VApp key={session.user.id} session={session}/>;
}

// Reuse the root across HMR re-executions so dev hot-reload doesn't re-call createRoot.
const _container = document.getElementById('root');
const _root = (window.__wmRoot ||= createRoot(_container));
_root.render(<Root/>);
