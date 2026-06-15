// TasteAtlas.jsx — a real, muted Leaflet map: one marker + affinity halo per region
// (not bottle pins). Tap a region → a detail card with all verdict counts (Buy Again
// emphasized), the wines you own there, and why it fits your palate.
import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { T, VERDICTS } from '../lib/data.js';
import { Icon, VerdictBadge } from './ui.jsx';
import { BottlePhoto } from './bottle.jsx';
import { groupByRegion, affinityLevel } from '../lib/palate.js';

const INK = '#17150f';

export function TasteAtlas({ wines, onOpenWine, selKey, onSelect }){
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const regions = useMemo(()=> groupByRegion(wines), [wines]);

  // init map once
  useEffect(()=>{
    if (mapRef.current || !elRef.current) return;
    const map = L.map(elRef.current, { zoomControl:false, scrollWheelZoom:false, attributionControl:true, worldCopyJump:true });
    mapRef.current = map;
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      subdomains:'abcd', maxZoom:11, attribution:'© OpenStreetMap, © CARTO',
    }).addTo(map);
    map.attributionControl.setPrefix('');
    map.setView([25, 0], 1);
    return ()=>{ map.remove(); mapRef.current = null; markersRef.current = {}; };
  }, []);

  // draw markers + halos + fit whenever regions change.
  // invalidateSize() before fitBounds so Leaflet has the real container size
  // (a stale/zero size makes fitBounds clamp to max zoom over open ocean).
  useEffect(()=>{
    const map = mapRef.current; if (!map) return;
    const raf = requestAnimationFrame(()=>{
      map.invalidateSize();
      Object.values(markersRef.current).forEach(o=>{ o.halo.remove(); o.core.remove(); });
      markersRef.current = {};
      const pts = [];
      regions.forEach(r=>{
        if (!r.center) return;
        const lvl = affinityLevel(r.score);
        const loved = r.score > 0;
        const halo = L.circleMarker(r.center, { radius: 9 + lvl*5, stroke:false, fillColor:INK, fillOpacity: loved ? 0.05 + lvl*0.05 : 0.04 });
        const core = L.circleMarker(r.center, { radius: 4 + (lvl-1), color:'#fff', weight:1.5, fillColor:INK, fillOpacity: loved ? 0.92 : 0.5 });
        const pick = ()=> onSelect(r.key);
        halo.on('click', pick); core.on('click', pick);
        halo.addTo(map); core.addTo(map);
        markersRef.current[r.key] = { halo, core, lvl };
        pts.push(r.center);
      });
      if (pts.length === 1) map.setView(pts[0], 5);
      else if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding:[26,26], maxZoom:6 });
    });
    return ()=> cancelAnimationFrame(raf);
  }, [regions]);

  // emphasize the selected marker
  useEffect(()=>{
    Object.entries(markersRef.current).forEach(([key, o])=>{
      const on = key === selKey;
      o.core.setStyle({ radius: (4 + (o.lvl-1)) + (on?3:0), color: on ? INK : '#fff', weight: on ? 2.5 : 1.5 });
      if (on) o.core.bringToFront();
    });
  }, [selKey]);

  const sel = regions.find(r=> r.key === selKey);

  return (
    <div>
      <div style={{ position:'relative', borderRadius:14, overflow:'hidden', border:`1px solid ${T.line}` }}>
        <div ref={elRef} style={{ height:240, width:'100%', background:T.raised }}/>
        {!selKey && <div style={{ position:'absolute', left:0, right:0, bottom:0, padding:'7px 10px', textAlign:'center', fontFamily:'var(--mono)', fontSize:10.5, color:T.ink3, background:'rgba(246,245,242,0.82)', backdropFilter:'blur(4px)', pointerEvents:'none' }}>Tap a region · larger, darker = more loved</div>}
      </div>
      {sel && <RegionCard region={sel} onOpenWine={onOpenWine} onClose={()=>onSelect(null)}/>}
    </div>
  );
}

function VStat({ id, n, big }){
  const v = VERDICTS[id];
  return (
    <div style={{ textAlign:'center', flex:big?'0 0 auto':'1 1 0', minWidth:0, padding: big?'0 4px':'0' }}>
      <div style={{ fontSize: big?22:15, fontWeight: big?780:680, color: n>0? v.color : T.ink4, lineHeight:1, letterSpacing:-0.3 }}>{n}</div>
      <div style={{ fontSize: big?11:10, color:T.ink3, marginTop:3, whiteSpace:'nowrap' }}>{v.label}</div>
    </div>
  );
}

function RegionCard({ region, onOpenWine, onClose }){
  return (
    <div style={{ marginTop:13, border:`1px solid ${T.line2}`, borderRadius:14, padding:'14px 15px', background:'#fff' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:10 }}>
        <div style={{ minWidth:0 }}>
          <h1 style={{ margin:0, fontFamily:'var(--serif)', fontSize:21, fontWeight:500, color:T.ink, lineHeight:1.05 }}>{region.label}</h1>
          <div style={{ fontSize:12.5, color:T.ink3, marginTop:3, display:'flex', alignItems:'center', gap:4 }}><Icon name="pin" size={13} color={T.ink3}/> {region.country}</div>
        </div>
        <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', padding:4, display:'flex', flexShrink:0 }}><Icon name="x" size={18} color={T.ink3}/></button>
      </div>

      {/* verdict counts — Buy Again emphasized */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:13 }}>
        <div style={{ background:VERDICTS.buy.bg, borderRadius:12, padding:'9px 14px', display:'flex', alignItems:'center', gap:2 }}>
          <VStat id="buy" n={region.buy} big/>
        </div>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:4, padding:'0 4px' }}>
          <VStat id="maybe" n={region.maybe}/>
          <VStat id="no" n={region.no}/>
          <VStat id="totry" n={region.totry}/>
        </div>
      </div>

      {/* why it fits */}
      {region.trait && <div style={{ marginTop:13, padding:'9px 11px', background:T.canvas, borderRadius:10, fontSize:12.5, color:T.ink2, lineHeight:1.45, display:'flex', gap:8 }}>
        <Icon name="sparkle" size={13} color={T.maybe} style={{ flexShrink:0, marginTop:2 }}/>
        <span>Why it fits your palate: {region.trait}.</span>
      </div>}

      {/* wines from here */}
      <div style={{ fontFamily:'var(--mono)', fontSize:10.5, color:T.ink3, letterSpacing:0.3, textTransform:'uppercase', margin:'15px 0 9px' }}>Your wines from here</div>
      <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
        {region.wines.map(w=>(
          <button key={w.id} onClick={()=>onOpenWine(w.id)} style={{ width:'100%', textAlign:'left', display:'flex', gap:11, alignItems:'center', padding:0, background:'none', border:'none', cursor:'pointer' }}>
            <BottlePhoto wine={w} w={40} h={50} rounded={8}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13.5, fontWeight:660, color:T.ink, letterSpacing:-0.2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{w.name} <span style={{ color:T.ink3, fontWeight:500 }}>{w.vintage}</span></div>
              <div style={{ fontSize:11.5, color:T.ink3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{[w.grape, w.region].filter(Boolean).join(' · ')}</div>
            </div>
            <VerdictBadge id={w.verdict} variant="expressive" size="sm"/>
          </button>
        ))}
      </div>
    </div>
  );
}
