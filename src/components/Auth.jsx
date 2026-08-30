// Auth.jsx — sign-in: Google OAuth (primary) + magic-link email (secondary).
// Editorial parchment style.
import React, { useState } from 'react';
import { T } from '../lib/data.js';
import { supabase, supabaseConfigured } from '../lib/supabase.js';
import { clearLastAnswer } from '../lib/lastanswer.js';

const wrap = { minHeight:'100vh', background:T.canvas, display:'flex', alignItems:'center', justifyContent:'center', padding:24, boxSizing:'border-box' };
const card = { width:'100%', maxWidth:360, background:T.bg, borderRadius:20, padding:'40px 28px', boxShadow:'0 10px 40px rgba(22,20,15,0.10), 0 1px 2px rgba(22,20,15,0.05)' };

function GoogleG({ size = 18 }){
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92A8.78 8.78 0 0 0 17.64 9.2z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  );
}

export function FullScreenLoader(){
  return <div style={wrap}><svg width={34} height={34} viewBox="0 0 24 24" style={{ animation:'wmSpin .8s linear infinite' }}>
    <circle cx="12" cy="12" r="9" fill="none" stroke={T.line2} strokeWidth="2.6"/>
    <path d="M21 12a9 9 0 00-9-9" fill="none" stroke={T.ink} strokeWidth="2.6" strokeLinecap="round"/></svg></div>;
}

// Never surface a raw error object / "{}" to the user. supabase-js can hand back
// an error whose .message is a serialized body (e.g. "{}") when the server returns
// an unexpected failure — map those, and known email-send failures, to clear copy.
function friendlyAuthError(error){
  const raw = (error && typeof error.message === 'string') ? error.message.trim() : '';
  if (!raw || (raw.startsWith('{') && raw.endsWith('}'))) {
    return 'Something went wrong sending the link. Use “Continue with Google,” or try again in a moment.';
  }
  if (/error sending|sending\s+\w*\s*email|smtp/i.test(raw)) {
    return 'We couldn’t email a sign-in link right now. Use “Continue with Google,” or try again in a few minutes.';
  }
  return raw;
}

export function AuthScreen(){
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [err, setErr] = useState('');
  const [gErr, setGErr] = useState('');
  const [gBusy, setGBusy] = useState(false);

  const google = async () => {
    setGErr(''); setGBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) { setGErr(friendlyAuthError(error)); setGBusy(false); }
    // on success the browser redirects to Google, so no further state needed
  };

  const send = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending'); setErr('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) { setErr(friendlyAuthError(error)); setStatus('error'); }
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
      <div style={{ fontFamily:'var(--mono)', fontSize:10.5, letterSpacing:'.24em', textTransform:'uppercase', color:T.ink3 }}>Wine Memory</div>
      <h1 style={{ margin:'10px 0 0', fontFamily:'var(--serif)', fontSize:30, fontWeight:500, lineHeight:1.1, color:T.ink, letterSpacing:0.2 }}>
        Never forget a <em style={{ fontStyle:'italic' }}>good bottle.</em></h1>
      <div style={{ fontSize:14, color:T.ink2, lineHeight:1.5, marginTop:10, marginBottom:26 }}>
        Save the wines you love. Skip the ones you don't.
      </div>

      {/* Primary — Continue with Google */}
      <button onClick={google} disabled={gBusy} style={{ width:'100%', height:52, borderRadius:12, border:'none', cursor:gBusy?'default':'pointer',
        background:T.ink, color:'#fff', fontFamily:'var(--sans)', fontSize:15.5, fontWeight:680,
        display:'flex', alignItems:'center', justifyContent:'center', gap:11 }}>
        <span style={{ width:26, height:26, borderRadius:7, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><GoogleG/></span>
        {gBusy ? 'Connecting…' : 'Continue with Google'}
      </button>
      {gErr && <div style={{ marginTop:9, fontSize:13, color:T.no, lineHeight:1.4 }}>{gErr}</div>}

      {/* Magic-link hidden for beta — Resend domain not yet verified.
          Flip SHOW_MAGIC_LINK = true to restore. Code stays intact. */}
      {false && <>
      <div style={{ display:'flex', alignItems:'center', gap:12, margin:'22px 0 18px' }}>
        <div style={{ flex:1, height:1, background:T.line2 }}/>
        <span style={{ fontFamily:'var(--mono)', fontSize:10.5, letterSpacing:0.5, textTransform:'uppercase', color:T.ink3 }}>or</span>
        <div style={{ flex:1, height:1, background:T.line2 }}/>
      </div>
      {status === 'sent' ? (
        <div style={{ padding:'16px 14px', borderRadius:12, background:T.surface, border:`1px solid ${T.line}` }}>
          <div style={{ fontSize:15, fontWeight:680, color:T.ink }}>Check your email</div>
          <div style={{ fontSize:13.5, color:T.ink2, lineHeight:1.5, marginTop:5 }}>We sent a magic link to <b>{email}</b>. Open it on this device to sign in.</div>
          <button onClick={()=>setStatus('idle')} style={{ marginTop:14, background:'none', border:'none', color:T.ink2, fontFamily:'var(--sans)', fontSize:13, fontWeight:600, cursor:'pointer', padding:0 }}>Use a different email</button>
        </div>
      ) : (
        <form onSubmit={send}>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com"
            style={{ width:'100%', boxSizing:'border-box', height:48, border:`1.5px solid ${email?T.ink:T.line2}`, borderRadius:12, padding:'0 14px', fontFamily:'var(--sans)', fontSize:15.5, color:T.ink, outline:'none', background:'#fff' }}/>
          {status === 'error' && <div style={{ marginTop:9, fontSize:13, color:T.no, lineHeight:1.4 }}>{err}</div>}
          <button type="submit" disabled={!email.trim() || status==='sending'} style={{ width:'100%', marginTop:12, height:48, borderRadius:12, cursor:email.trim()?'pointer':'default',
            background:'#fff', border:`1.5px solid ${email.trim()?T.ink:T.line2}`, color:email.trim()?T.ink:T.ink4,
            fontFamily:'var(--sans)', fontSize:14.5, fontWeight:640 }}>
            {status==='sending' ? 'Sending…' : 'Email me a magic link'}
          </button>
        </form>
      )}
      </>}

      <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:26 }}>
        <span style={{ width:6, height:6, borderRadius:99, background:'#9b2f3a' }}/>
        <span style={{ width:6, height:6, borderRadius:99, background:T.line2 }}/>
        <span style={{ width:6, height:6, borderRadius:99, background:T.line2 }}/>
      </div>
    </div></div>
  );
}

// On sign-out, the cached last pairing answer is cleared so nothing from this
// account lingers for the next person who signs in on the same device.
export async function signOut(){
  if (!supabase) return;
  try {
    const { data } = await supabase.auth.getUser();
    clearLastAnswer(data && data.user ? data.user.id : null);
  } catch { /* clearing the cache must never block sign-out */ }
  await supabase.auth.signOut();
}
