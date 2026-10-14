/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/pinterest.ts — connecting the site owner's Pinterest account (OAuth)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHY OAUTH (and not a pasted token)?
 *  Pinterest's quick "test tokens" expire after 24 hours. Connecting properly
 *  with Pinterest's sign-in ("OAuth") gives a 30-day token plus a refresh token
 *  the server renews by itself — and Pinterest REQUIRES this flow (shown in a
 *  video) before it grants an app Standard access.
 *
 *  THE FLOW, STEP BY STEP
 *   1. About page → "Connect Pinterest" → the browser goes to pinterest.com with
 *      our app id, the scopes we ask for (read-only), and a random `state`.
 *   2. You approve on Pinterest. Pinterest sends the browser back to
 *      <site>/pinterest/callback/?code=…&state=…  (a real page:
 *      pinterest/callback/index.html, which loads the app — see main.tsx)
 *   3. The callback page checks `state` (protection against forged requests)
 *      and hands the one-time `code` to our server function
 *      (supabase/functions/pinterest-auth).
 *   4. The server swaps the code for tokens using the app SECRET (which never
 *      touches the browser), checks the account is the site owner's
 *      (PINTEREST_OWNER_USERNAME), and stores the tokens server-side.
 *   5. From then on the live feed (supabase/functions/live-feed) reads the
 *      owner's boards with those tokens, renewing them as needed.
 *
 *  The browser never sees a token or the app secret.
 */

import { sitePath } from "./paths";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The server function that does the token exchange. */
const AUTH_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/pinterest-auth` : null;

/**
 * Where Pinterest sends you back — inside the site's folder, e.g.
 * "/i-dont-know-what-to-wear/pinterest/callback/". Register the FULL address
 * (redirectUri(), shown on the About page) in your Pinterest app — exactly,
 * with the trailing slash.
 */
export const CALLBACK_PATH = sitePath("pinterest/callback/");

/** Read-only: boards, pins, and the account's username (to check it's the owner). */
export const PINTEREST_SCOPES = ["boards:read", "pins:read", "user_accounts:read"];

const STATE_KEY = "wtw.pinterestState";

export interface PinterestStatus {
  /** The server has PINTEREST_APP_ID and PINTEREST_APP_SECRET. */
  configured: boolean;
  /** The app id (public — it appears in Pinterest's sign-in URL anyway). */
  appId: string | null;
  /** PINTEREST_OWNER_USERNAME is set (only that account may connect). */
  ownerSet: boolean;
  /** Who is connected right now, if anyone. */
  connected: { username: string; since?: string } | null;
}

/** The redirect URI for this site (e.g. https://chiikugo.github.io/i-dont-know-what-to-wear/pinterest/callback/). */
export function redirectUri(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

async function call(init?: RequestInit): Promise<unknown> {
  if (!AUTH_URL || !SUPABASE_KEY) throw new Error("Supabase isn't configured for this site.");
  const res = await fetch(AUTH_URL, {
    ...init,
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** Is Pinterest set up / connected? */
export async function getPinterestStatus(): Promise<PinterestStatus> {
  return (await call()) as PinterestStatus;
}

/** Build Pinterest's sign-in URL and remember a random `state` to check on the way back. */
export function startPinterestConnect(appId: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  try {
    sessionStorage.setItem(STATE_KEY, state);
  } catch {
    /* if storage is blocked the check below simply fails safely */
  }
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: PINTEREST_SCOPES.join(","),
    state,
  });
  return `https://www.pinterest.com/oauth/?${params}`;
}

/** Back from Pinterest: check `state`, then let the server swap the code for tokens. */
export async function finishPinterestConnect(search: string): Promise<{ username: string }> {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (error) throw new Error(error === "access_denied" ? "You cancelled the connection on Pinterest." : `Pinterest said: ${error}`);
  const code = params.get("code");
  const state = params.get("state");
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(STATE_KEY);
    sessionStorage.removeItem(STATE_KEY);
  } catch {
    expected = null;
  }
  if (!code) throw new Error("Pinterest didn't send a code back.");
  if (!state || !expected || state !== expected) {
    throw new Error("This sign-in didn't start from this browser (the security check failed). Please try Connect again.");
  }
  const data = (await call({ method: "POST", body: JSON.stringify({ action: "exchange", code, redirectUri: redirectUri() }) })) as { username: string };
  return { username: data.username };
}
