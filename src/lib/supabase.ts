/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/supabase.ts — connecting to your Supabase database (optional)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT SUPABASE IS
 *  A free hosted Postgres database with a ready-made web API and login system.
 *  We use it for two things:
 *    1. the Closet      (your saved outfits, so they're not stuck in one browser)
 *    2. community taste (anonymous "what do people pick?" counts the model uses)
 *
 *  THE APP WORKS WITHOUT IT
 *  If you haven't set the two environment variables below, `configured` is
 *  false, no network calls are made, and everything is stored in this browser
 *  instead. Setting it up later "just turns on" syncing.
 *
 *  TO TURN IT ON  (full walk-through is in README.md → "Connect Supabase")
 *    1. Create a free project at supabase.com.
 *    2. Run supabase/schema.sql in its SQL editor.
 *    3. Enable "Anonymous sign-ins" (Authentication → Sign In / Providers).
 *    4. Copy .env.example to .env.local and paste your project URL + anon key.
 *    5. Restart `npm run dev`.
 *
 *  HOW LOGIN WORKS WITHOUT A LOGIN SCREEN
 *  Supabase "anonymous sign-ins" give every browser a real, private user id
 *  automatically. The database's Row Level Security rules (in schema.sql) then
 *  make sure each person can only ever read and write THEIR OWN rows — even
 *  though the anon key is visible in the page source (that's normal and safe
 *  *because* of those rules).
 *
 *  THE STATUS STORE
 *  Other files need to show "Synced ✓ / Offline / Error" and need the client.
 *  This file keeps one tiny shared status object and a `useBackendStatus()`
 *  hook so the UI re-renders when it changes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

// ── Configuration ───────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when both environment variables are present. */
export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// ── Status store (tiny observable) ──────────────────────────────────────────

export type BackendState = "off" | "connecting" | "online" | "error";

export interface BackendStatus {
  state: BackendState;
  /** Human-readable explanation, shown in the closet header. */
  message: string;
  /** The (anonymous) user id once signed in. */
  userId: string | null;
}

let status: BackendStatus = supabaseConfigured
  ? { state: "connecting", message: "Connecting to Supabase…", userId: null }
  : { state: "off", message: "Saved on this device", userId: null };

const listeners = new Set<() => void>();

function setStatus(next: BackendStatus): void {
  status = next;
  listeners.forEach((l) => l());
}

/** React hook: re-renders whenever the connection status changes. */
export function useBackendStatus(): BackendStatus {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => status,
    () => status,
  );
}

// ── The client + sign-in ────────────────────────────────────────────────────

let client: SupabaseClient | null = null;
let connecting: Promise<SupabaseClient | null> | null = null;

/** Turn Supabase's technical errors into something a human can act on. */
function friendlyError(message: string): string {
  if (/anonymous sign-ins are disabled/i.test(message)) {
    return "Anonymous sign-ins are off in your Supabase project. Enable them under Authentication → Sign In / Providers.";
  }
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Can't reach Supabase right now. Your changes are kept on this device and will sync later.";
  }
  return message;
}

/**
 * Connect (once) and sign in anonymously.
 * Resolves to the client, or `null` if Supabase is not configured / failed.
 * Safe to call from many places — everyone shares the same promise.
 */
export function connectBackend(): Promise<SupabaseClient | null> {
  if (!supabaseConfigured) return Promise.resolve(null);
  if (connecting) return connecting;

  connecting = (async () => {
    try {
      if (!client) {
        // Loaded on demand: when Supabase isn't configured the (large) client
        // library is never downloaded, keeping the app's first load small.
        const { createClient } = await import("@supabase/supabase-js");
        client = createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        });
      }

      // Reuse the saved session if there is one; otherwise create an anonymous user.
      const existing = await client.auth.getSession();
      let userId = existing.data.session?.user.id ?? null;

      if (!userId) {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        userId = data.user?.id ?? null;
      }

      setStatus({ state: "online", message: "Synced with Supabase", userId });
      return client;
    } catch (e) {
      const message = friendlyError(e instanceof Error ? e.message : String(e));
      setStatus({ state: "error", message, userId: null });
      connecting = null; // allow a later retry
      return null;
    }
  })();

  return connecting;
}

/** Mark the connection as offline/errored after a failed request. */
export function reportBackendError(error: unknown): void {
  const message = friendlyError(error instanceof Error ? error.message : String(error));
  setStatus({ state: "error", message, userId: status.userId });
}

/** Mark the connection healthy again after a successful request. */
export function reportBackendOk(): void {
  if (supabaseConfigured && status.state !== "online") {
    setStatus({ state: "online", message: "Synced with Supabase", userId: status.userId });
  }
}
