/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  supabase/functions/pinterest-auth — "Connect Pinterest" (OAuth), server side
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The site owner connects their own Pinterest account once (About page →
 *  "Connect Pinterest"); the live feed then shows pins from their boards. This
 *  function is the server half of that sign-in — the half that may know the
 *  Pinterest app SECRET (the browser half is src/lib/pinterest.ts).
 *
 *  ENDPOINTS (all need the project's publishable key in the `apikey` header)
 *    GET   → { configured, appId, ownerSet, connected: { username, since } | null }
 *            what the About page shows
 *    POST  { action: "exchange", code, redirectUri }
 *          → swaps Pinterest's one-time code for tokens, checks the account
 *            IS the site owner's, stores the tokens (pinterestStore.ts)
 *
 *  SECRETS (Supabase dashboard → Edge Functions → Secrets)
 *    PINTEREST_APP_ID          from developers.pinterest.com → My apps
 *    PINTEREST_APP_SECRET      same place (never put this in the web page)
 *    PINTEREST_OWNER_USERNAME  your Pinterest username: ONLY this account can be
 *                              connected, so nobody else can swap in their boards
 *
 *  DEPLOY:  supabase functions deploy pinterest-auth --no-verify-jwt
 *  (`--no-verify-jwt` is right: the key check is in `isFromTheApp` below,
 *  as for the live-feed function.)
 */

import { accountName, connectionFrom, exchangeCode, loadConnection, saveConnection } from "./pinterestStore.ts";

const env = (key: string): string | undefined => Deno.env.get(key) || undefined;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

/** Is this request from the app? (It must carry one of the project's public keys.) */
function isFromTheApp(req: Request): boolean {
  const allowed = new Set<string>();
  const add = (k: unknown) => typeof k === "string" && k && allowed.add(k);
  add(env("SUPABASE_ANON_KEY"));
  add(env("SUPABASE_PUBLISHABLE_KEY"));
  try {
    for (const k of Object.values(JSON.parse(env("SUPABASE_PUBLISHABLE_KEYS") ?? "{}"))) add(k);
  } catch {
    /* not set — fine */
  }
  const sent = req.headers.get("apikey") ?? "";
  return allowed.size === 0 || allowed.has(sent);
}

/**
 * Only our own callback page may receive the code: https (or localhost while
 * developing), ending in /pinterest/callback/ — at the root of a domain or in
 * the site's folder (GitHub Pages: /i-dont-know-what-to-wear/pinterest/callback/).
 * (Pinterest itself also insists it matches an address registered for the app.)
 */
function validRedirect(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 300) return false;
  try {
    const u = new URL(uri);
    const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return (u.protocol === "https:" || (local && u.protocol === "http:")) && /^(\/[\w.-]+)*\/pinterest\/callback\/$/.test(u.pathname) && !u.search && !u.hash;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!isFromTheApp(req)) return json({ error: "Send the project's publishable key in the apikey header." }, 401);

  const appId = env("PINTEREST_APP_ID");
  const secret = env("PINTEREST_APP_SECRET");
  const owner = env("PINTEREST_OWNER_USERNAME")?.replace(/^@/, "").trim();

  if (req.method === "GET") {
    let connected: { username: string; since?: string } | null = null;
    try {
      const c = await loadConnection();
      if (c) connected = { username: c.username, since: c.connected_at };
    } catch {
      /* table missing or unreachable — report "not connected" */
    }
    return json({ configured: Boolean(appId && secret), appId: appId ?? null, ownerSet: Boolean(owner), connected });
  }

  if (req.method !== "POST") return json({ error: "Use GET or POST." }, 405);

  const body = (await req.json().catch(() => ({}))) as { action?: string; code?: unknown; redirectUri?: unknown };
  if (body.action !== "exchange") return json({ error: "Unknown action." }, 400);
  if (typeof body.code !== "string" || !/^[\w.~-]{8,512}$/.test(body.code)) return json({ error: "That sign-in code looks wrong — try Connect again." }, 400);
  if (!validRedirect(body.redirectUri)) return json({ error: "Unexpected redirect address." }, 400);
  if (!appId || !secret) return json({ error: "The site owner hasn't added the Pinterest app ID and secret to the server yet." }, 503);
  if (!owner) return json({ error: "Set PINTEREST_OWNER_USERNAME (the Pinterest account allowed to connect) in the Supabase secrets first." }, 503);

  try {
    const tokens = await exchangeCode(body.code, body.redirectUri, appId, secret);
    const username = await accountName(tokens.access_token);
    if (username.toLowerCase() !== owner.toLowerCase()) {
      // Not the owner: don't keep anything.
      return json({ error: `Only the site owner's Pinterest account (@${owner}) can be connected here — you signed in as @${username}.` }, 403);
    }
    const previous = await loadConnection().catch(() => null);
    await saveConnection(connectionFrom(tokens, username, previous?.username === username ? previous : null));
    return json({ connected: true, username });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 200) }, 502);
  }
});
