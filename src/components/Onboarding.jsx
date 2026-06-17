// Onboarding.jsx — post-sign-in onboarding (Screens 2 & 3). Screen 1 is the
// value-bearing AuthScreen. Shown once for new users (no wines yet); the gate
// + show-once flag live in main.jsx. Screen 3 hands off to Snap a Label.
import React from 'react';
import { T } from '../lib/data.js';
import { Icon } from './ui.jsx';
import { track } from '../lib/analytics.js';

const { useState: oUS, useEffect: oUE } = React;
const WINE_RED = '#9b2f3a';

const primaryBtn = { height:52, borderRadius:13, border:'none', cursor:'pointer', background:T.ink, color:'#fff',
  fontFamily:'var(--sans)', fontSize:15.5, fontWeight:680, display:'flex', alignItems:'center', justifyContent:'center', gap:9 };
const ghostBtn = { background:'none', border:'none', cursor:'pointer', color:T.ink2, fontFamily:'var(--sans)', fontSize:13.5, fontWeight:600, padding:6 };

function Dots({ active }){
  return (
    <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
      {[0,1,2].map(i=>(<span key={i} style={{ width:6, height:6, borderRadius:99, background:i===active?WINE_RED:'#d9d5cc' }}/>))}
    </div>
  );
}

// Screen 2 — the payoff, made tangible by a greyed preview of the taste portrait.
const PREVIEW = [
  ['Grapes you love', 'Pinot Noir', false],
  ['Regions you return to', 'Willamette', false],
  ['What to try next', 'Barolo', true],
];

function Onboarding({ onSnap, onSkip }){
  const [step, setStep] = oUS(0); // 0 = Screen 2, 1 = Screen 3
  oUE(()=>{ track('onboarding_started'); }, []);
  oUE(()=>{ track('onboarding_screen_view', { n: step===0 ? 2 : 3 }); }, [step]);

  const wrap = { position:'absolute', inset:0, zIndex:95, background:T.bg, display:'flex', flexDirection:'column',
    padding:'calc(46px + env(safe-area-inset-top)) 28px calc(28px + env(safe-area-inset-bottom))', boxSizing:'border-box' };

  if (step === 0) return (
    <div style={wrap}>
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <h1 style={{ margin:0, fontFamily:'var(--serif)', fontSize:34, fontWeight:500, lineHeight:1.08, color:T.ink, letterSpacing:0.2 }}>
          The more you save, the <em style={{ fontStyle:'italic' }}>smarter</em> it gets.</h1>
        <p style={{ margin:'14px 0 0', fontFamily:'var(--sans)', fontSize:14.5, lineHeight:1.5, color:T.ink2 }}>
          Your favorite grapes, the regions you return to, and what to try next.</p>
        <div style={{ marginTop:30 }}>
          {PREVIEW.map(([lab, chip, accent], i)=>(
            <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 0', borderBottom: i<2?`1px solid ${T.line}`:'none' }}>
              <span style={{ fontFamily:'var(--mono)', fontSize:9.5, letterSpacing:0.6, textTransform:'uppercase', color:T.ink4 }}>{lab}</span>
              <span style={{ display:'flex', alignItems:'center', gap:7, fontFamily:'var(--sans)', fontSize:13, color: accent?WINE_RED:T.ink3 }}>
                {accent
                  ? <Icon name="sparkle" size={12} color={WINE_RED}/>
                  : <span style={{ width:7, height:7, borderRadius:99, border:`1.5px solid ${T.ink4}` }}/>}
                {chip}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
        <button onClick={()=>setStep(1)} style={primaryBtn}>Continue</button>
        <Dots active={1}/>
      </div>
    </div>
  );

  return (
    <div style={wrap}>
      <h1 style={{ margin:0, fontFamily:'var(--serif)', fontSize:33, fontWeight:500, lineHeight:1.08, color:T.ink, letterSpacing:0.2 }}>
        Start with <em style={{ fontStyle:'italic' }}>one bottle.</em></h1>
      <p style={{ margin:'12px 0 0', fontFamily:'var(--sans)', fontSize:14.5, lineHeight:1.5, color:T.ink2 }}>
        Snap one you already love — we'll do the rest.</p>
      <div style={{ flex:1, margin:'22px 0', border:`2px dashed ${T.line2}`, borderRadius:18, background:T.canvas, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <Icon name="camera" size={64} color={T.ink4}/>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <button onClick={()=>{ track('onboarding_snap_tapped'); track('onboarding_completed'); onSnap(); }} style={primaryBtn}>
          <Icon name="camera" size={19} color="#fff"/> Snap a Label</button>
        <button onClick={()=>{ track('onboarding_skipped'); onSkip(); }} style={ghostBtn}>I'll explore first</button>
        <Dots active={2}/>
      </div>
    </div>
  );
}

export { Onboarding };
