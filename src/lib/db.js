// db.js — data access for wines + pairings. Maps DB rows <-> the app's objects,
// and uploads bottle photos to Storage. RLS scopes everything to the signed-in user,
// so queries never need an explicit user filter.
import { supabase } from './supabase.js';

const WINE_COLS = 'id,producer,name,vintage,type,grape,region,country,loc,verdict,tags,note,where,source,price,photo,family,flavor,pairings,sample,added';

// ── photos ──────────────────────────────────────────────────────────
// Snap/Scan hand us a base64 data URL; upload it and return a public URL.
// Anything else (already a URL, or null) passes through untouched.
async function maybeUploadPhoto(userId, photo){
  if (!photo || !photo.startsWith('data:')) return photo || null;
  const blob = await (await fetch(photo)).blob();
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('bottle-photos')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return supabase.storage.from('bottle-photos').getPublicUrl(path).data.publicUrl;
}

// ── wines ───────────────────────────────────────────────────────────
function wineToRow(w, photo){
  return {
    producer:w.producer ?? null, name:w.name, vintage:w.vintage!=null?String(w.vintage):null,
    type:w.type ?? null, grape:w.grape ?? '', region:w.region ?? null, country:w.country ?? null,
    loc:w.loc ?? null, verdict:w.verdict ?? 'totry', tags:w.tags ?? [], note:w.note ?? '',
    where:w.where ?? 'home', source:w.source ?? null, price:w.price ?? null, photo:photo ?? null,
    family:w.family ?? null, flavor:w.flavor ?? null, pairings:w.pairings ?? [], sample:!!w.sample,
    added:w.added ?? null,
  };
}

export async function fetchWines(){
  const { data, error } = await supabase.from('wines').select(WINE_COLS).order('created_at', { ascending:false });
  if (error) throw error;
  return data;
}

export async function insertWine(userId, w){
  const photo = await maybeUploadPhoto(userId, w.photo);
  const { data, error } = await supabase.from('wines').insert(wineToRow(w, photo)).select(WINE_COLS).single();
  if (error) throw error;
  return data;
}

export async function insertWines(userId, arr){
  const rows = await Promise.all(arr.map(async w => wineToRow(w, await maybeUploadPhoto(userId, w.photo))));
  const { data, error } = await supabase.from('wines').insert(rows).select(WINE_COLS);
  if (error) throw error;
  return data;
}

export async function updateWine(id, patch){
  const { error } = await supabase.from('wines').update(patch).eq('id', id);
  if (error) throw error;
}

// Upload a (base64 data URL) photo and attach it to an existing wine.
export async function setWinePhoto(userId, id, dataUrl){
  const url = await maybeUploadPhoto(userId, dataUrl);
  const { error } = await supabase.from('wines').update({ photo: url }).eq('id', id);
  if (error) throw error;
  return url;
}

export async function deleteSamples(){
  const { error } = await supabase.from('wines').delete().eq('sample', true);
  if (error) throw error;
}

// ── pairings ────────────────────────────────────────────────────────
function rowToPairing(r){
  return { id:r.id, dish:r.dish, style:r.style, why:r.why, type:r.type,
    related_saved_wine_id:r.wine_id, date:(r.created_at||'').slice(0,10) };
}

export async function fetchPairings(){
  const { data, error } = await supabase.from('pairings').select('*').order('created_at', { ascending:false });
  if (error) throw error;
  return data.map(rowToPairing);
}

export async function insertPairing(userId, p){
  const row = { dish:p.dish ?? '', style:p.style ?? '', why:p.why ?? '', type:p.type ?? 'Red', wine_id:p.related_saved_wine_id ?? null };
  const { data, error } = await supabase.from('pairings').insert(row).select('*').single();
  if (error) throw error;
  return rowToPairing(data);
}
