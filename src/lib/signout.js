// signout.js — clearing this account's on-device state, then ending the session.
//
// The order is the point. Both per-user caches (the last answer and the
// sommelier conversation) are removed SYNCHRONOUSLY, before any network
// request, using the user id the app already knows. Whether Supabase's
// sign-out request then succeeds, fails, or never returns, nothing from this
// account remains on the device for the next person who signs in here.
//
// Asking Supabase who the user is at sign-out time (the previous version) was
// a network round-trip that could fail and leave the caches in place.

import { clearLastAnswer } from './lastanswer.js';
import { clearConversation } from './conversation-store.js';

// Clear everything this app stores for one account. Pure with respect to the
// network; `storage` is injectable for tests.
export function clearUserState(userId, storage){
  clearLastAnswer(userId, storage);
  clearConversation(userId, storage);
}

// `auth` is any object with a signOut() method (supabase.auth in the app).
// Returns whatever signOut resolves to; rejects only if signOut rejects, and
// by then the local state is already gone.
export async function performSignOut(userId, auth, storage){
  clearUserState(userId, storage);
  if (!auth || typeof auth.signOut !== 'function') return;
  return await auth.signOut();
}
