// db.js — data access for wines + pairings. Maps DB rows <-> the app's objects,
// and uploads bottle photos to Storage. RLS scopes everything to the signed-in user,
// so queries never need an explicit user filter.
import { supabase } from './supabase.js';
import { STORAGE_PREFIX, PHOTO_URL_TTL_SECONDS, storagePath } from './photopath.js';
import { WISHLIST_COLS, rowToItem as wishlistRowToItem, itemToRow as wishlistItemToRow, purchaseWishlistItem } from './wishlist.js';

export { storagePath };

// tastesLike/pairsWith use PostgREST column aliases so fetched rows come back
// camelCase (matching the client wine object); blurb/style map 1:1.
const WINE_COLS = 'id,producer,name,vintage,type,grape,region,country,loc,verdict,tags,note,where,source,price,photo,family,flavor,pairings,blurb,style,tastesLike:tastes_like,pairsWith:pairs_with,sample,added';

// ── photos ──────────────────────────────────────────────────────────
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

// Sign a whole cellar's photos in ONE request. The previous version issued a
// separate createSignedUrl call per wine, so opening a 50-bottle cellar meant
// 50 round-trips on every load.
async function signPaths(paths){
  const signed = new Map();
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return signed;
  const { data, error } = await supabase.storage.from('bottle-photos')
    .createSignedUrls(unique, PHOTO_URL_TTL_SECONDS);
  if (error){ console.error('Could not create private photo URLs', error); return signed; }
  for (const row of (data || [])){
    if (row && row.path && row.signedUrl && !row.error) signed.set(row.path, row.signedUrl);
  }
  return signed;
}

// Attach a display URL WITHOUT losing the stored value. `photoPath` always
// carries what the database holds, so a failed signing round-trip degrades to a
// placeholder that can be retried on the next load. The previous version
// returned null and dropped the path, permanently blanking a user's photo for
// the session on any transient Storage error.
function attachPhoto(wine, signed){
  const stored = wine.photo ?? null;
  const path = storagePath(stored);
  if (!path) return { ...wine, photo: stored, photoPath: null };
  return { ...wine, photo: signed.get(path) ?? null, photoPath: stored };
}

async function hydrateWines(rows){
  const list = rows || [];
  const signed = await signPaths(list.map(w => storagePath(w.photo)));
  return list.map(w => attachPhoto(w, signed));
}

async function hydrateWine(wine){
  return (await hydrateWines([wine]))[0];
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
  return hydrateWines(data);
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
  return hydrateWines(data);
}

// Fields that exist only on the hydrated client object and must never be
// written back. `photo` on a hydrated wine is a short-lived SIGNED URL —
// persisting one would replace the wine's real photo reference with an
// expiring token. Photos are changed through setWinePhoto only.
const CLIENT_ONLY_FIELDS = ['photoPath', 'photo'];

export async function updateWine(id, patch){
  const clean = { ...(patch || {}) };
  for (const k of CLIENT_ONLY_FIELDS) delete clean[k];
  if (!Object.keys(clean).length) return;
  const { error } = await supabase.from('wines').update(clean).eq('id', id);
  if (error) throw error;
}

// Upload a (base64 data URL) photo and attach it to an existing wine.
// Returns { photo, photoPath }: the signed URL to display now, and the stored
// reference, so the caller's state matches what a fresh fetch would produce.
export async function setWinePhoto(userId, id, dataUrl){
  const stored = await maybeUploadPhoto(userId, dataUrl);
  const { error } = await supabase.from('wines').update({ photo: stored }).eq('id', id);
  if (error) throw error;
  const signed = await signPaths([storagePath(stored)]);
  return { photo: signed.get(storagePath(stored)) ?? null, photoPath: stored };
}

export async function deleteSamples(){
  const { error } = await supabase.from('wines').delete().eq('sample', true);
  if (error) throw error;
}

// Delete the owned bottle first, then best-effort clean its private photo.
// This avoids leaving a live record pointing at a destroyed photo if the
// database request fails. RLS scopes both operations to the signed-in user.
export async function deleteWine(wine){
  if (!wine || !wine.id) throw new Error('wine id required');
  const photoPath = storagePath(wine.photoPath ?? wine.photo);
  const { error } = await supabase.from('wines').delete().eq('id', wine.id);
  if (error) throw error;
  if (photoPath){
    const { error: photoError } = await supabase.storage.from('bottle-photos').remove([photoPath]);
    if (photoError) console.error('Bottle removed, but its photo could not be cleaned up', photoError);
  }
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

// ── wishlist — bottles the user does NOT own ────────────────────────
// A separate table by design (see supabase/migrations/20260830000000_wishlist.sql):
// nothing here can enter cellar counts or palate calculations, because those
// read the wines table. Shapes and rules live in lib/wishlist.js (pure).
export async function fetchWishlist(){
  const { data, error } = await supabase.from('wishlist')
    .select(WISHLIST_COLS).eq('status', 'active').order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(wishlistRowToItem);
}

export async function insertWishlistItem(item){
  const { data, error } = await supabase.from('wishlist')
    .insert(wishlistItemToRow(item)).select(WISHLIST_COLS).single();
  if (error) throw error;
  return wishlistRowToItem(data);
}

export async function removeWishlistItem(id){
  const { error } = await supabase.from('wishlist').delete().eq('id', id);
  if (error) throw error;
}

// "I bought this": ONE atomic, idempotent database call (buy_wishlist_item in
// the migration) inserts the cellar wine and resolves the item in the same
// transaction; replaying it for an already-bought item returns the same wine,
// so the single client retry below can never create a duplicate.
function rawWineToClient(r){
  if (!r) return null;
  const { tastes_like, pairs_with, user_id, created_at, ...rest } = r;   // eslint-disable-line no-unused-vars
  return { ...rest, tastesLike: tastes_like ?? [], pairsWith: pairs_with ?? [],
    photo: null, photoPath: r.photo ?? null };   // a just-bought wine has no photo to sign
}

export async function buyWishlistItem(itemId, chosenType){
  const rpc = async (id, type)=>{
    const { data, error } = await supabase.rpc('buy_wishlist_item', { p_item_id: id, p_type: type ?? null });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  };
  const row = await purchaseWishlistItem(rpc, itemId, chosenType);
  return rawWineToClient(row);
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
