// lastanswer.js — the "walked into a dead spot" cache, scoped per user.
//
// The first version used one device-wide key, which meant a second account on
// the same device could restore the previous account's question and answer.
// The key now embeds the authenticated user id, so an answer saved by one
// account is invisible to every other. No user id, no cache — a signed-out or
// indeterminate state neither reads nor writes.
//
// Restored data is VALIDATED before use: it came from storage, which anything
// on the device can write to, so it is treated as untrusted input rather than
// as our own state coming back.

export const LAST_ANSWER_TTL = 1000 * 60 * 60 * 12;   // a pairing is for tonight

const LEGACY_KEY = 'wm_last_pairing';                  // pre-user-scoping; purged on read

export function keyFor(userId){
  return (typeof userId === 'string' && userId) ? `wm_last_pairing_${userId}` : null;
}

// Shape check for a restored record. Anything that fails is discarded silently
// — a corrupt cache is never worth an error, and never worth rendering.
export function isValidSavedAnswer(v, now = Date.now()){
  if (!v || typeof v !== 'object') return false;
  if (typeof v.at !== 'number' || !(now - v.at >= 0) || (now - v.at) > LAST_ANSWER_TTL) return false;
  if (typeof v.asked !== 'string') return false;
  const d = v.data;
  if (!d || typeof d !== 'object') return false;
  if (d.mode === 'answer') return typeof d.text === 'string';
  if (d.mode === 'pairing'){
    return !!d.primary && typeof d.primary === 'object'
      && typeof d.primary.grape === 'string' && d.primary.grape.length > 0
      && (d.others === undefined || Array.isArray(d.others));
  }
  return false;
}

function storageOrNull(storage){
  if (storage) return storage;
  try { return globalThis.localStorage || null; } catch { return null; }
}

export function readLastAnswer(userId, storage, now = Date.now()){
  const store = storageOrNull(storage);
  const key = keyFor(userId);
  if (!store || !key) return null;
  try {
    // One-time cleanup of the old device-wide key: it may hold another
    // account's answer, so it is removed, never migrated.
    if (store.getItem(LEGACY_KEY) != null) store.removeItem(LEGACY_KEY);
    const raw = store.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!isValidSavedAnswer(saved, now)) { store.removeItem(key); return null; }
    return saved;
  } catch { return null; }
}

export function writeLastAnswer(userId, asked, data, storage, now = Date.now()){
  const store = storageOrNull(storage);
  const key = keyFor(userId);
  if (!store || !key) return;
  try { store.setItem(key, JSON.stringify({ at: now, asked: String(asked ?? ''), data })); }
  catch { /* storage full or blocked — the answer still shows */ }
}

// Called on sign-out or account switch so nothing lingers for the next person
// at this device. Safe to call with no id: it still purges the legacy key.
export function clearLastAnswer(userId, storage){
  const store = storageOrNull(storage);
  if (!store) return;
  try {
    store.removeItem(LEGACY_KEY);
    const key = keyFor(userId);
    if (key) store.removeItem(key);
  } catch { /* nothing to do */ }
}
