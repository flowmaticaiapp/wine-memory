// Auth.jsx — magic-link sign-in screen + full-screen loader. Editorial parchment style.
import React, { useState } from 'react';
import { T } from '../lib/data.js';
import { supabase, supabaseConfigured } from '../lib/supabase.js';

const wrap = { minHeight:'100vh', background:T.canvas, display:'flex', alignItems:'center', justifyContent:'center', padding:24, boxSizing:'border-box' };
const card = { width:'100%', maxWidth:360, background:T.bg, borderRadius:20, padding:'40px 28px', boxShadow:'0 10px 40px rgba(22,20,15,0.10), 0 1px 2px rgba(22,20,15,0.05)' };

export function FullScreenLoader(){
  return <div style={wrap}><svg width={34} height={34} viewBox="0 0 24 24" style={{ animation:'wmSpin .8s linear infinite' }}>
    <circle cx="12" cy="12" r="9" fill="none" stroke={T.line2} strokeWidth="2.6"/>
    <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={T.ink} strokeWidth="2.6" strokeLinecap="round"/></svg></div>;
}

export function AuthScreen(){
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [err, setErr] = useState('');

  const send = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending'); setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) { setErr(error.message); setStatus('error'); }
    else setStatus('sent');
  };

  if (!supabaseConfigured) return (
    <div style={wrap}><div style={card}>
      <div style={{ fontFamily:'var(--serif)', fontSize:26, color:T.ink, marginBottom:10 }}>Wine Memory</div>
      <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5 }}>Supabase isn’t configured. Set <code style={{ fontFamily:'var(--mono)', fontSize:12.5 }}>VITE_SUPABASE_URL</code> and <code style={{ fontFamily:'var(--mono)', fontSize:12.5 }}>VITE_SUPABASE_ANON_KEY</code> in your environment to enable sign-in.</div>
    </div></div>
  );

  return (
    <div style={wrap}><div style={card}>
      <div style={{ fontFamily:'var(--serif)', fontSize:30, color:T.ink, letterSpacing:0.2 }}>Wine Memory</div>
      <div style={{ fontSize:14.5, color:T.ink2, lineHeight:1.5, marginTop:8, marginBottom:26 }}>
        Sign in to your cellar. We’ll email you a one-tap link — no password.
      </div>

      {status === 'sent' ? (
        <div style={{ padding:'16px 14px', borderRadius:12, background:T.surface, border:`1px solid ${T.line}` }}>
          <div style={{ fontSize:15, fontWeight:680, color:T.ink }}>Check your email</div>
          <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:5 }}>We sent a magic link to <b>{email}</b>. Open it on this device to sign in.</div>
          <button onClick={()=>{ setStatus('idle'); }} style={{ marginTop:14, background:'none', border:'none', color:T.ink2, fontFamily:'var(--sans)', fontSize:13, fontWeight:600, cursor:'pointer', padding:0 }}>Use a different email</button>
        </div>
      ) : (
        <form onSubmit={send}>
          <input type="email" autoFocus value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com"
            style={{ width:'100%', boxSizing:'border-box', height:50, border:`1.5px solid ${email?T.ink:T.line2}`, borderRadius:12, padding:'0 14px', fontFamily:'var(--sans)', fontSize:16, color:T.ink, outline:'none', background:'#fff' }}/>
          {status === 'error' && <div style={{ marginTop:9, fontSize:13, color:T.no, lineHeight:1.4 }}>{err}</div>}
          <button type="submit" disabled={!email.trim() || status==='sending'} style={{ width:'100%', marginTop:14, height:50, borderRadius:12, border:'none', cursor:email.trim()?'pointer':'default', background:email.trim()?T.ink:T.raised, color:email.trim()?'#fff':T.ink4, fontFamily:'var(--sans)', fontSize:15.5, fontWeight:700 }}>
            {status==='sending' ? 'Sending…' : 'Send magic link'}
          </button>
        </form>
      )}
    </div></div>
  );
}

export async function signOut(){ if (supabase) await supabase.auth.signOut(); }
