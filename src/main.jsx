// main.jsx — app shell. Home · Cellar · Palate · Explore + floating Add. Mounts to #root.
// Ported from app/visualapp.jsx.
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

import { T, SEED, autoEnrich, newSavedPairing, newDiningExperience } from './lib/data.js';
import { Icon } from './components/ui.jsx';
import { IOSDevice } from './components/IOSFrame.jsx';
import { useTweaks, TweaksPanel, TweakSection, TweakRadio } from './components/TweaksPanel.jsx';
import { HomeScreen } from './components/home.jsx';
import { Collection, VisualDetail } from './components/visual.jsx';
import { PalateScreen } from './components/palate.jsx';
import { ExploreScreen } from './components/explore.jsx';
import { AddHub, SearchAdd, OrderImport } from './components/add.jsx';
import { SnapLabel } from './components/snap.jsx';
import { ScanBottles } from './components/scan.jsx';
import { PairingSearch } from './components/pairing.jsx';
import { DiningOut } from './components/diningout.jsx';

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
      {item('learn','globe','Explore')}
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

function VApp(){
  const [t,setTweak]=useTweaks(VTWEAKS);
  const [wines,setWines]=useState(SEED);
  const [pairings,setPairings]=useState([]);
  const [dining,setDining]=useState([]);
  const [tab,setTab]=useState('home');
  const [filter,setFilter]=useState('all');
  const [overlay,setOverlay]=useState(null); // addhub|searchadd|import|search|diningout|explore|{detail}
  const [exploreRegion,setExploreRegion]=useState('Oregon');
  const [seed,setSeed]=useState('');
  const [toast,setToast]=useState(null);
  useDeviceFit();
  const flash=(m)=>{ setToast(m); setTimeout(()=>setToast(null),2200); };

  const cols = t.columns==='3'?3:2;
  const updateWine=(id,patch)=> setWines(ws=>ws.map(w=>w.id===id?{...w,...patch}:w));
  const addWine=(w)=>{ setWines(ws=>[autoEnrich(w),...ws]); setOverlay(null); flash('Added to your collection'); };
  const addMany=(arr)=>{ setWines(ws=>[...arr.map(autoEnrich),...ws]); };
  const scanAdd=(arr)=>{ addMany(arr); setOverlay(null); setTab('collection'); setFilter('totry'); flash(`${arr.length} ${arr.length===1?'wine':'wines'} added to To Try`); };
  const viewToTry=()=>{ setOverlay(null); setTab('collection'); setFilter('totry'); };
  const clearSamples=()=>{ setWines(ws=>ws.filter(w=>!w.sample)); };
  const ask=(q)=>{ setSeed(q||''); setOverlay('search'); };
  const explore=(r)=>{ setExploreRegion(r); setOverlay('explore'); };
  const savePairing=(p)=>{ setPairings(ps=>[newSavedPairing(p),...ps]); flash('Saved to My Palate'); };
  const saveDining=({experience,pairing})=>{ setDining(ds=>[newDiningExperience(experience),...ds]); if(pairing) setPairings(ps=>[newSavedPairing(pairing),...ps]); };

  const detail = (overlay&&overlay.detail)? wines.find(w=>w.id===overlay.detail):null;
  const fullPanel = ['searchadd','import','search','diningout','snap','scan'].includes(overlay);
  const hasSamples = wines.some(w=>w.sample);

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:14, boxSizing:'border-box', background:T.canvas }}>
      <div id="wm-device">
      <IOSDevice width={393} height={852} dark={false}>
        <div style={{ position:'relative', height:'100%', width:'100%', background:'#fff', overflow:'hidden' }}>
          {tab==='home' && <HomeScreen wines={wines} onAsk={ask} onShopping={()=>setOverlay('addhub')} onHome={()=>ask('')} onDiningOut={()=>setOverlay('diningout')} onExplore={()=>setTab('learn')} onOpenWine={(id)=>setOverlay({detail:id})} onCollection={()=>setTab('collection')}/>}
          {tab==='collection' && <Collection wines={wines} cols={cols} filter={filter} setFilter={setFilter} hasSamples={hasSamples} onClearSamples={clearSamples} onOpen={(id)=>setOverlay({detail:id})} onSearch={()=>ask('')}/>}
          {tab==='palate' && <PalateScreen wines={wines} pairings={pairings} onOpenWine={(id)=>setOverlay({detail:id})} onAsk={ask}/>}
          {tab==='learn' && <ExploreScreen region={exploreRegion} wines={wines} onPick={setExploreRegion} onOpenWine={(id)=>setOverlay({detail:id})}/>}

          {!detail && !fullPanel && (<><VNav tab={tab} setTab={setTab}/><VFAB onClick={()=>setOverlay('addhub')}/></>)}

          {overlay==='addhub' && <AddHub onClose={()=>setOverlay(null)} onSearch={()=>setOverlay('searchadd')} onImport={()=>setOverlay('import')} onSnap={()=>setOverlay('snap')} onScan={()=>setOverlay('scan')}/>}
          {overlay==='snap' && <SnapLabel onClose={()=>setOverlay(null)} onSave={addWine} verdictVariant={t.verdictStyle}/>}
          {overlay==='scan' && <ScanBottles onClose={()=>setOverlay(null)} onAddMany={scanAdd} sampleSrc="app/scan-demo.jpg"/>}
          {overlay==='searchadd' && <SearchAdd onClose={()=>setOverlay(null)} onSave={addWine} verdictVariant={t.verdictStyle}/>}
          {overlay==='import' && <OrderImport onClose={()=>setOverlay(null)} onAddMany={addMany} onViewToTry={viewToTry}/>}
          {overlay==='search' && <PairingSearch wines={wines} onClose={()=>setOverlay(null)} onOpen={(id)=>setOverlay({detail:id})} initialQuery={seed} onSavePairing={savePairing}/>}
          {overlay==='diningout' && <DiningOut onClose={()=>setOverlay(null)} onSave={saveDining}/>}
          {detail && <VisualDetail wine={detail} all={wines} onBack={()=>setOverlay(null)} onOpen={(id)=>setOverlay({detail:id})} onUpdate={updateWine} verdictVariant={t.verdictStyle}/>}

          <VToast toast={toast}/>
        </div>
      </IOSDevice>
      </div>

      <TweaksToggle/>
      <TweaksPanel>
        <TweakSection label="Grid density" />
        <TweakRadio label="Columns" value={t.columns} options={['2','3']} onChange={(v)=>setTweak('columns',v)} />
        <TweakSection label="Verdict style" />
        <TweakRadio label="Buy / Maybe / No UI" value={t.verdictStyle} options={['expressive','subtle','glyph']} onChange={(v)=>setTweak('verdictStyle',v)} />
      </TweaksPanel>
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

createRoot(document.getElementById('root')).render(<VApp/>);
