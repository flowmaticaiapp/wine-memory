// analytics.js — lightweight, in-house product analytics → public.events.
// Fire-and-forget: never blocks the UI, never throws. user_id is filled by the
// table's `default auth.uid()` for the signed-in user (RLS: own rows only).
import { supabase } from './supabase.js';

export function track(event, props){
  try {
    if (!supabase) return;
    supabase.from('events').insert({ event, props: props || {} }).then(()=>{}, ()=>{});
  } catch (_) { /* analytics is best-effort */ }
}
