/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/storage.ts — a safe wrapper around the browser's localStorage
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT localStorage IS
 *  A small key → text store that lives in the user's browser and survives
 *  refreshes. We use it for: which section you picked, your in-progress outfit,
 *  your closet (as a local copy), the log of your taste events, and which live
 *  looks you dismissed. (Live looks themselves are never stored.)
 *
 *  WHY A WRAPPER?
 *  localStorage can throw (private windows, blocked storage, a full disk) and
 *  only stores strings. These helpers turn all of that into "returns the
 *  fallback / silently does nothing" so the rest of the app never needs a
 *  try/catch.
 *
 *  Every key is prefixed with "wtw." so we never collide with other apps on
 *  the same origin. Bump the `.v1` suffix of a key if you ever change the shape
 *  of what it stores (old data will then be ignored instead of crashing).
 */

/** All storage keys in one place, so you can see everything the app saves. */
export const STORAGE_KEYS = {
  /** "menswear" | "womenswear" — the user's chosen section. */
  section: "wtw.section.v1",
  /** The outfit currently being built. */
  draft: "wtw.draft.v1",
  /** Local copy of the closet (the source of truth when Supabase is off). */
  closet: "wtw.closet.v1",
  /** The log of taste events the model learns from (capped). */
  events: "wtw.events.v1",
  /** Ids of recommendations the user dismissed. */
  dismissed: "wtw.dismissed.v1",
  /** Small preferences, e.g. whether to share anonymous picks. */
  settings: "wtw.settings.v1",
  /** Ids of live-feed items the user said "not for me" to. */
  liveDismissed: "wtw.liveDismissed.v1",
} as const;

/** Read and parse JSON; return `fallback` on any problem. */
export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Stringify and store; silently ignore failures (e.g. storage blocked). */
export function saveJSON(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the app still works, it just won't persist */
  }
}

/** Remove a key; silently ignore failures. */
export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
