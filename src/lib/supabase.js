// supabase.js — single Supabase client, created from Vite env vars.
// The anon key is safe to ship in the client; Row Level Security protects data.
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

// When env isn't set (e.g. a fresh checkout without .env), we don't crash —
// the auth screen shows a "not configured" notice instead.
export const supabaseConfigured = Boolean(url && anon);

export const supabase = supabaseConfigured ? createClient(url, anon) : null;
