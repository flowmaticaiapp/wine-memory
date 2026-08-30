// db.js — data access for wines + pairings. Maps DB rows <-> the app's objects,
// and uploads bottle photos to Storage. RLS scopes everything to the signed-in user,
// so queries never need an explicit user filter.
import { supabase } from './supabase.js';

// tastesLike/pairsWith use PostgREST column aliases so fetched rows come back
// camelCase (matching the client wine object); blurb/style map 1:1.
const WINE_COLS = 'id,producer,name,vintage,type,grape,region,country,loc,verdict,tags,note,where,source,price,photo,family,flavor,pairings,blurb,style,tastesLike:tastes_like,pairsWith:pairs_with,sample,added';

// ── photos ──────────────────────────────────────────────────────────
const STORAGE_PREFIX = 'storage:';

// Snap/Scan hand us a base64 data URL. Store only the private object path in
// the database; a short-lived signed URL is created when the wine is loaded.
async function maybeUploadPhoto(userId, photo){
  if (!photo || !photo.startsWith('data:')) return photo || null;
  const blob = await (await fetch(photo)).blob();
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from('bottle-photos')
    .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  return STORAGE_PREFIX + path;
}

// Support both new private-path records and old public URLs so the privacy
// migration does not break photos already saved by users.
function storagePath(photo){
  if (!photo) return null;
  if (photo.startsWith(STORAGE_PREFIX)) return photo.slice(STORAGE_PREFIX.length);
  const marker = '/storage/v1/object/public/bottle-photos/';
  const at = photo.indexOf(marker);
  return at >= 0 ? decodeURIComponent(photo.slice(at + marker.length)) : null;
}

async function displayPhoto(photo){
  const path = storagePath(photo);
  if (!path) return photo || null;
  const { data, error } = await supabase.storage.from('bottle-photos')
    .createSignedUrl(path, 60 * 60 * 24);
  if (error) {
    console.error('Could not create private photo URL', error);
    return null;
  }
  return data.signedUrl;
}

async function hydrateWine(wine){
  return { ...wine, photo:await displayPhoto(wine.photo) };
}

// ── wines ───────────────────────────────────────────────────────────
function wineToRow(w, photo){
  return {
    producer:w.producer ?? null, name:w.name, vintage:w.vintage!=null?String(w.vintage):null,
    type:w.type ?? null, grape:w.grape ?? '', region:w.region ?? null, country:w.country ?? null,
    loc:w.loc ?? null, verdict:w.verdict ?? 'totry', tags:w.tags ?? [], note:w.note ?? '',
    where:w.where ?? 'home', source:w.source ?? null, price:w.price ?? null, photo:photo ?? null,
    family:w.family ?? null, flavor:w.flavor ?? null, pairings:w.pairings ?? [], sample:!!w.sample,
    blurb:w.blurb ?? null, style:w.style ?? null, tastes_like:w.tastesLike ?? [], pairs_with:w.pairsWith ?? [],
    added:w.added ?? null,
  };
}

export async function fetchWines(){
  const { data, error } = await supabase.from('wines').select(WINE_COLS).order('created_at', { ascending:false });
  if (error) throw error;
  return Promise.all(data.map(hydrateWine));
}

export async function insertWine(userId, w){
  const photo = await maybeUploadPhoto(userId, w.photo);
  const { data, error } = await supabase.from('wines').insert(wineToRow(w, photo)).select(WINE_COLS).single();
  if (error) throw error;
  return hydrateWine(data);
}

export async function insertWines(userId, arr){
  const rows = await Promise.all(arr.map(async w => wineToRow(w, await maybeUploadPhoto(userId, w.photo))));
  const { data, error } = await supabase.from('wines').insert(rows).select(WINE_COLS);
  if (error) throw error;
  return Promise.all(data.map(hydrateWine));
}

export async function updateWine(id, patch){
  const { error } = await supabase.from('wines').update(patch).eq('id', id);
  if (error) throw error;
}

// Upload a (base64 data URL) photo and attach it to an existing wine.
export async function setWinePhoto(userId, id, dataUrl){
  const stored = await maybeUploadPhoto(userId, dataUrl);
  const { error } = await supabase.from('wines').update({ photo: stored }).eq('id', id);
  if (error) throw error;
  return displayPhoto(stored);
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

// ── dining experiences ──────────────────────────────────────────────
function rowToDining(r){
  return { id:r.id, dish:r.dish, place:r.place, dishes:r.dishes ?? [], wines:r.wines ?? [],
    recommendation:r.recommendation ?? null, pick_name:r.pick_name, pick_price:r.pick_price,
    date:(r.created_at||'').slice(0,10) };
}

export async function fetchDining(){
  const { data, error } = await supabase.from('dining_experiences').select('*').order('created_at', { ascending:false });
  if (error) throw error;
  return data.map(rowToDining);
}

export async function insertDining(userId, e){
  const row = { dish:e.dish ?? '', place:e.place ?? '', dishes:e.dishes ?? [], wines:e.wines ?? [],
    recommendation:e.recommendation ?? null, pick_name:e.pick_name ?? null, pick_price:e.pick_price ?? null };
  const { data, error } = await supabase.from('dining_experiences').insert(row).select('*').single();
  if (error) throw error;
  return rowToDining(data);
}
