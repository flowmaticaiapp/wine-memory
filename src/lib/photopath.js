// photopath.js — pure helpers for resolving a stored bottle-photo reference.
//
// Kept free of the Supabase client on purpose: this is the piece that decides
// whether a photo saved before the storage-privacy change can still be found,
// so it needs to be testable in isolation, without env vars or a network.

// Marks a value as a private Storage object path rather than a URL.
export const STORAGE_PREFIX = 'storage:';

// How long a display URL stays valid. Signed URLs are minted per page load, so
// this only needs to outlive a single session.
export const PHOTO_URL_TTL_SECONDS = 60 * 60 * 24;

// Resolve a stored `photo` value to a Storage object path, or null if it is not
// one. Three shapes must all keep working — that is what makes the photo-privacy
// change non-breaking for wines that already exist:
//
//   'storage:<uid>/<uuid>.jpg'                      → written after this change
//   'https://…/object/public/bottle-photos/<path>'  → written before it
//   'app/scan/b1.jpg' | null | ''                   → bundled seed asset, not Storage
//
export function storagePath(photo){
  if (!photo || typeof photo !== 'string') return null;
  if (photo.startsWith(STORAGE_PREFIX)) return photo.slice(STORAGE_PREFIX.length) || null;
  const marker = '/storage/v1/object/public/bottle-photos/';
  const at = photo.indexOf(marker);
  if (at < 0) return null;
  // Drop any query string — public URLs may carry cache-busting params.
  const raw = photo.slice(at + marker.length).split('?')[0];
  if (!raw) return null;
  try { return decodeURIComponent(raw); } catch { return raw; }
}
