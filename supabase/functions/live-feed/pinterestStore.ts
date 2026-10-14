/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  pinterestStore.ts — the site owner's Pinterest connection, kept server-side
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  SHARED BY TWO FUNCTIONS — there are two identical copies:
 *    supabase/functions/pinterest-auth/pinterestStore.ts  (connects the account)
 *    supabase/functions/live-feed/pinterestStore.ts       (reads its boards)
 *  Edit one, copy it over the other (a test fails if they drift apart).
 *
 *  WHERE THE TOKENS LIVE
 *  In the table public.pinterest_connection (supabase/schema.sql, section 4):
 *  row-level security is on and there are NO policies, so the public keys the
 *  web page uses can't read it at all. Only these server functions can, using
 *  the project's service key (Supabase gives every function that key as an
 *  environment variable — it never leaves the server).
 *
 *  TOKEN LIFETIMES (Pinterest API v5)
 *    access token   30 days
 *    refresh token  60 days, renewed every time it's used ("continuous")
 *  getUsableToken() renews the access token when it's within RENEW_DAYS of
 *  expiring — which also renews the refresh token — so as long as the site is
 *  visited at least every couple of months, the connection never lapses.
 */

/** One row: the owner's tokens. */
export interface PinterestConnection {
  username: string;
  access_token: string;
  refresh_token: string | null;
  scope: string | null;
  expires_at: string | null;
  refresh_expires_at: string | null;
  connected_at?: string;
  updated_at?: string;
}

/** What Pinterest's /oauth/token answers. */
export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  refresh_token_expires_at?: number;
  scope?: string;
}

/** Renew the access token when it has fewer than this many days left. */
export const RENEW_DAYS = 7;
const TIMEOUT_MS = 8000;
const API = "https://api.pinterest.com/v5";

const env = (key: string): string | undefined => Deno.env.get(key) || undefined;

/** The project's server-side key (legacy service_role JWT, or a new sb_secret_ key). */
function serviceKey(): string | undefined {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = Object.values(JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "{}"));
    return typeof keys[0] === "string" ? keys[0] : undefined;
  } catch {
    return undefined;
  }
}

/** Headers for the database's REST API. New-style keys go in `apikey` only. */
function dbHeaders(): Record<string, string> {
  const key = serviceKey();
  if (!key) throw new Error("server key missing");
  return key.startsWith("sb_")
    ? { apikey: key, "Content-Type": "application/json" }
    : { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

const table = () => `${env("SUPABASE_URL")}/rest/v1/pinterest_connection`;

/** The stored connection, or null. */
export async function loadConnection(): Promise<PinterestConnection | null> {
  const res = await fetch(`${table()}?id=eq.1&select=*`, { headers: dbHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`database HTTP ${res.status}`);
  const rows = (await res.json()) as PinterestConnection[];
  return rows[0] ?? null;
}

/** Save (insert or replace) the connection. */
export async function saveConnection(c: PinterestConnection): Promise<void> {
  const res = await fetch(`${table()}?on_conflict=id`, {
    method: "POST",
    headers: { ...dbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ id: 1, ...c, updated_at: new Date().toISOString() }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`database HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
}

/** Forget the connection (e.g. the owner revoked access on Pinterest). */
export async function deleteConnection(): Promise<void> {
  await fetch(`${table()}?id=eq.1`, { method: "DELETE", headers: dbHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
}

/** "Basic <base64(app id:secret)>" — how Pinterest wants the app to identify itself. */
function appAuth(appId: string, secret: string): string {
  return `Basic ${btoa(`${appId}:${secret}`)}`;
}

/** Call Pinterest's token endpoint (code exchange or refresh). */
async function tokenRequest(body: Record<string, string>, appId: string, secret: string): Promise<TokenResponse> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: appAuth(appId, secret), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse & { message?: string; error?: string };
  if (!res.ok || !data.access_token) throw new Error(`Pinterest: ${data.message ?? data.error ?? `HTTP ${res.status}`}`);
  return data;
}

/** Step 4 of the sign-in: swap the one-time code for tokens. */
export function exchangeCode(code: string, redirectUri: string, appId: string, secret: string): Promise<TokenResponse> {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, appId, secret);
}

/** Whose account a token belongs to. */
export async function accountName(accessToken: string): Promise<string> {
  const res = await fetch(`${API}/user_account`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const data = (await res.json().catch(() => ({}))) as { username?: string; message?: string };
  if (!res.ok || !data.username) throw new Error(`Pinterest: ${data.message ?? `HTTP ${res.status}`}`);
  return data.username;
}

/** A token response → a row to store. */
export function connectionFrom(t: TokenResponse, username: string, previous?: PinterestConnection | null): PinterestConnection {
  const now = Date.now();
  const refreshExpires = t.refresh_token_expires_at
    ? new Date(t.refresh_token_expires_at * 1000).toISOString()
    : t.refresh_token_expires_in
      ? new Date(now + t.refresh_token_expires_in * 1000).toISOString()
      : (previous?.refresh_expires_at ?? null);
  return {
    username,
    access_token: t.access_token,
    refresh_token: t.refresh_token ?? previous?.refresh_token ?? null,
    scope: t.scope ?? previous?.scope ?? null,
    expires_at: t.expires_in ? new Date(now + t.expires_in * 1000).toISOString() : (previous?.expires_at ?? null),
    refresh_expires_at: refreshExpires,
    connected_at: previous?.connected_at ?? new Date(now).toISOString(),
  };
}

/** Does this connection need renewing now? */
export function needsRenewal(c: PinterestConnection, now = Date.now()): boolean {
  if (!c.expires_at) return false;
  return Date.parse(c.expires_at) - now < RENEW_DAYS * 86_400_000;
}

/**
 * A token the live feed can use right now — renewed first if it's close to
 * expiring. Returns null when nothing is connected. If Pinterest refuses to
 * renew (the owner revoked access), the stored tokens are deleted.
 */
export async function getUsableToken(): Promise<string | null> {
  const c = await loadConnection();
  if (!c) return null;
  if (!needsRenewal(c)) return c.access_token;
  const appId = env("PINTEREST_APP_ID");
  const secret = env("PINTEREST_APP_SECRET");
  if (!c.refresh_token || !appId || !secret) return c.access_token;
  try {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: c.refresh_token }, appId, secret);
    const next = connectionFrom(t, c.username, c);
    await saveConnection(next);
    return next.access_token;
  } catch (e) {
    // Expired or revoked: if the access token is already dead too, forget it.
    if (c.expires_at && Date.parse(c.expires_at) < Date.now()) await deleteConnection();
    throw e;
  }
}
