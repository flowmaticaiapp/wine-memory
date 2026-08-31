// ai.js — single entry point for calling the AI Edge Functions.
// Returns the function's data on success. On an auth/limit block (401/429) it
// broadcasts the function's friendly message via a global `wm-ai-blocked` event
// (the app shell shows it as a toast) and throws so callers fall back gracefully.
import { supabase } from './supabase.js';

export async function invokeAI(fn, body){
  if (!supabase) throw new Error('not configured');
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error){
    let status = 0, msg = '';
    try {
      status = error.context?.status || 0;
      const b = await error.context.json();
      msg = b?.error || '';
    } catch (_) { /* non-JSON error body */ }
    const blocked = status === 401 || status === 429;
    if (blocked && typeof window !== 'undefined'){
      window.dispatchEvent(new CustomEvent('wm-ai-blocked', { detail: msg || 'Please sign in to use Wine Memory.' }));
    }
    const e = new Error(msg || (blocked ? 'Please sign in to use Wine Memory.' : 'request failed'));
    e.blocked = blocked;
    e.status = status;
    throw e;
  }
  return data;
}
