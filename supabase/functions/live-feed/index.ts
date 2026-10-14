/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  supabase/functions/live-feed — the live feed's tiny server relay
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHY THIS EXISTS
 *  The home page's "Live from the runway" row reads fashion feeds straight from
 *  the browser where it can (Vogue, British Vogue and GQ allow that). Many
 *  sites — Pinterest, YouTube, Harper's Bazaar, Elle… — don't let a web page
 *  read their feeds directly (browsers block it: "CORS"). This function runs on
 *  Supabase's servers, reads those feeds for the app, and hands back one tidy
 *  list. It also talks to the official Pinterest API with YOUR token, which
 *  must never be put in the web page.
 *
 *  WHAT IT RETURNS
 *  GET https://<project>.supabase.co/functions/v1/live-feed
 *    → { generatedAt, items: LiveItem[], sources: [{ id, name, ok, count, error? }] }
 *  Items carry image ADDRESSES only. No image is downloaded or stored: the
 *  browser loads each picture from the publisher's own servers.
 *
 *  WHO MAY CALL IT
 *  Only your app: every request must carry one of this project's public keys
 *  (the publishable / anon key the app already uses) in the `apikey` header.
 *  The function checks it itself — Supabase's built-in JWT check doesn't
 *  understand the new publishable keys, so it's deployed with that turned off
 *  (Supabase's own recommendation for these keys).
 *
 *  WHAT IT WILL NOT DO
 *  It only reads the fixed list of feeds below — it can't be used to fetch
 *  arbitrary web pages. It keeps each source for 5 minutes in memory (so a
 *  busy home page doesn't hammer anyone), stores nothing in the database, and
 *  never sends your token anywhere but api.pinterest.com.
 *
 *  PINTEREST — YOUR OWN BOARDS
 *  Once the site owner has clicked "Connect Pinterest" (About page; the
 *  pinterest-auth function stores the tokens), this function reads pins from
 *  the owner's public boards with the official API, renewing the token by
 *  itself (pinterestStore.ts). Secrets (dashboard → Edge Functions → Secrets):
 *    PINTEREST_APP_ID, PINTEREST_APP_SECRET   needed to renew the token
 *    PINTEREST_BOARD_IDS      optional: comma-separated board ids to read
 *                             (default: all the owner's public boards, up to 8)
 *    PINTEREST_ACCESS_TOKEN   optional shortcut for testing: a token pasted by
 *                             hand (e.g. Pinterest's 24-hour test token) is
 *                             used instead of the connected account's
 *  See docs/PINTEREST_APPLICATION.md for the step-by-step.
 *
 *  ADD OR REMOVE A FEED: edit RSS_SOURCES / YOUTUBE_CHANNELS below and deploy:
 *    supabase functions deploy live-feed --no-verify-jwt
 *  (`--no-verify-jwt` is right here: the key check is in `isFromTheApp` below.)
 */

import { hashId, type LiveItem, type LiveKind, parseFeed, resizeImage } from "./feedCore.ts";
import { getUsableToken } from "./pinterestStore.ts";

const UA = "WhatToWearLiveFeed/1.0 (personal fashion app; reads public fashion feeds)";
const CACHE_MS = 5 * 60 * 1000; // keep each source for 5 minutes
const TIMEOUT_MS = 8000; // give up on a slow source after 8 s
const PER_SOURCE = 10; // newest items kept per source

type Section = LiveItem["section"];

interface RssSource {
  id: string;
  name: string;
  url: string;
  kind: LiveKind;
  section: Section;
  /** Keep only entries whose LINK matches — e.g. the site's fashion section (optional). */
  path?: RegExp;
  /** Keep only entries whose link / categories / title match (optional). */
  only?: RegExp;
  /** …and drop entries that match this (shopping roundups, sales…). */
  not?: RegExp;
}

// ── The feeds (TWEAK: add, remove or re-order) ──────────────────────────────

/** Shopping round-ups and sales aren't runway looks — skip them. */
const SHOPPING = /\/shopping\/|\bsale\b|deals|gift guide|black friday|cyber|how (she|he) shops|best .* to buy|\bdrops?\b/i;

/**
 * A story counts as a LOOK (not news, beauty or shopping) if it talks about
 * collections, shows, street style… or names a big house. Applied to the
 * magazines below; designer feeds and Vogue's own Pinterest are all looks.
 */
const LOOKS = /runway|collection|(fashion|runway|couture|menswear|womenswear) shows?|shows? in (paris|milan|london|new york|copenhagen|shanghai|tokyo|seoul)|street style|\blooks?\b|couture|ready-to-wear|resort|cruise|fashion week|lookbook|campaign|\b(spring|summer|fall|autumn|winter)\b|\b(ss|fw|aw)\s?\d\d\b|chanel|dior|prada|vuitton|gucci|saint laurent|balenciaga|loewe|valentino|versace|mcqueen|hermès|hermes|celine|givenchy|fendi|miu miu|bottega|schiaparelli|margiela|rick owens|the row|jacquemus/i;

/** Public feeds from high-fashion houses, magazines' Pinterest profiles and publications. */
const RSS_SOURCES: RssSource[] = [
  // Pinterest — official public profile feeds of the houses themselves (no account needed).
  { id: "pinterest-dior", name: "Dior · Pinterest", url: "https://www.pinterest.com/dior/feed.rss", kind: "pinterest", section: "womenswear" },
  { id: "pinterest-ysl", name: "Saint Laurent · Pinterest", url: "https://www.pinterest.com/ysl/feed.rss", kind: "pinterest", section: "both" },
  { id: "pinterest-prada", name: "Prada · Pinterest", url: "https://www.pinterest.com/prada/feed.rss", kind: "pinterest", section: "both" },
  { id: "pinterest-louisvuitton", name: "Louis Vuitton · Pinterest", url: "https://www.pinterest.com/louisvuitton/feed.rss", kind: "pinterest", section: "both" },
  { id: "pinterest-balmain", name: "Balmain · Pinterest", url: "https://www.pinterest.com/balmain/feed.rss", kind: "pinterest", section: "womenswear" },
  { id: "pinterest-burberry", name: "Burberry · Pinterest", url: "https://www.pinterest.com/burberry/feed.rss", kind: "pinterest", section: "both" },
  { id: "pinterest-oscardelarenta", name: "Oscar de la Renta · Pinterest", url: "https://www.pinterest.com/oscardelarenta/feed.rss", kind: "pinterest", section: "womenswear" },
  { id: "pinterest-mcqueen", name: "Alexander McQueen · Pinterest", url: "https://www.pinterest.com/alexandermcqueen/feed.rss", kind: "pinterest", section: "both" },
  { id: "pinterest-gucci", name: "Gucci · Pinterest", url: "https://www.pinterest.com/gucci/feed.rss", kind: "pinterest", section: "both" },
  // Pinterest — the magazines' own boards (editorial photography).
  { id: "pinterest-vogue", name: "Vogue · Pinterest", url: "https://www.pinterest.com/voguemagazine/feed.rss", kind: "pinterest", section: "womenswear" },
  { id: "pinterest-britishvogue", name: "British Vogue · Pinterest", url: "https://www.pinterest.com/britishvogue/feed.rss", kind: "pinterest", section: "womenswear" },
  { id: "pinterest-wmag", name: "W Magazine · Pinterest", url: "https://www.pinterest.com/wmag/feed.rss", kind: "pinterest", section: "womenswear" },
  { id: "pinterest-gq", name: "GQ · Pinterest", url: "https://www.pinterest.com/gqmagazine/feed.rss", kind: "pinterest", section: "menswear", only: LOOKS },
  // Publications whose feeds browsers can't read directly — looks only, no shopping.
  { id: "bazaar", name: "Harper's Bazaar", url: "https://www.harpersbazaar.com/rss/all.xml/", kind: "editorial", section: "womenswear", path: /\/(fashion|celebrity)\//, only: LOOKS, not: SHOPPING },
  { id: "elle", name: "ELLE", url: "https://www.elle.com/rss/fashion.xml/", kind: "editorial", section: "womenswear", only: LOOKS, not: SHOPPING },
  { id: "wmag", name: "W Magazine", url: "https://www.wmagazine.com/rss", kind: "editorial", section: "both", path: /\/fashion\//, only: LOOKS, not: SHOPPING },
  { id: "hypebeast", name: "Hypebeast", url: "https://hypebeast.com/fashion/feed", kind: "editorial", section: "menswear", only: LOOKS, not: SHOPPING },
  { id: "dazed", name: "Dazed", url: "https://www.dazeddigital.com/rss", kind: "editorial", section: "both", path: /\/fashion\//, only: LOOKS, not: SHOPPING },
];

/**
 * Official YouTube channels of the big houses — full shows and show films.
 * (Channel ids come from each brand's youtube.com/@handle page.)
 */
const YOUTUBE_CHANNELS: { house: string; channel: string }[] = [
  { house: "Chanel", channel: "UCclHSnngVTZK7LEOQAzcg1w" },
  { house: "Dior", channel: "UC6xD-jKli-_qIYXDTsNv4dw" },
  { house: "Louis Vuitton", channel: "UC5q0PIKGr2lGOsiT14AlEYg" },
  { house: "Prada", channel: "UCyKqxNOVX6e1kBKB23g8r6g" },
  { house: "Gucci", channel: "UCo6fjlKg6GuCmEMeqYbGJng" },
  { house: "Balenciaga", channel: "UC08-C3TjnbKb6MPnfJd3IVQ" },
  { house: "Loewe", channel: "UCIkFEXV_zvjOlmOcKEHW_hg" },
  { house: "Miu Miu", channel: "UCm1E_-vk6Y0e_frZZRIavtw" },
  { house: "Fendi", channel: "UC7UUIS022jLrmdj3ktB0zpA" },
  { house: "Bottega Veneta", channel: "UCxBbMh9D8lGSfF8tIY2J-SQ" },
  { house: "Alexander McQueen", channel: "UCw5QfJ2YiUmCUM9lZPlXxhw" },
  { house: "Hermès", channel: "UCmFOnqrNg-YHLXfdB3GexBg" },
  { house: "Valentino", channel: "UCEVPnj90D28Z4KDYQ2tLzqw" },
  { house: "Versace", channel: "UCrx5pVziMo1qzF8isicR5SQ" },
  { house: "Jacquemus", channel: "UClaOpoQRFj-6r0Cl23oCDrw" },
  { house: "Thom Browne", channel: "UCY4S3FArtQondtEjyr53Wzw" },
];

/**
 * A video counts as a SHOW if its title says show / runway / défilé, or names
 * a collection with a season — and isn't an advert for watches, eyewear,
 * fragrance, bags… (brands post plenty of those too).
 */
const SHOW_WORDS = /\bshow\b|runway|défilé|catwalk/i;
const SEASON_COLLECTION = /collection/i;
const SEASON = /spring[- ]summer|fall[- ]winter|autumn[- ]winter|cruise|resort|couture|pre-?fall|\b(ss|fw|aw)\s?\d\d\b|summer\s?\d\d|winter\s?\d\d/i;
const PRODUCT = /watch(es)?\b|eyewear|sunglasses|fragrance|perfume|parfum|beauty|lipstick|make-?up|jewel(le)?ry|handbag|\bbags?\b|sneakers?|skincare/i;
const isShow = (title: string) => !PRODUCT.test(title) && (SHOW_WORDS.test(title) || (SEASON_COLLECTION.test(title) && SEASON.test(title)));

// ── Helpers ─────────────────────────────────────────────────────────────────

const env = (key: string): string | undefined => Deno.env.get(key) || undefined;

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

/** Guess the section from words in a title ("menswear", "men's"…). */
function sectionFrom(text: string, fallback: Section): Section {
  if (/\bmen'?s\b|menswear|\bfor men\b/i.test(text)) return "menswear";
  if (/\bwomen'?s\b|womenswear|ready-to-wear/i.test(text)) return fallback === "menswear" ? "both" : "womenswear";
  return fallback;
}

// ── Sources ─────────────────────────────────────────────────────────────────

async function readRss(src: RssSource): Promise<LiveItem[]> {
  const entries = parseFeed(await fetchText(src.url));
  return entries
    .filter((e) => {
      const text = `${e.link} ${e.categories.join(" ")} ${e.title} ${e.summary.slice(0, 200)}`;
      // Designers' pins often have no caption — the picture is the point; magazines need a headline.
      const hasWords = e.title || e.summary || src.kind === "pinterest";
      return (
        e.image &&
        e.link &&
        hasWords &&
        (!src.path || src.path.test(e.link)) &&
        (!src.only || src.only.test(text)) &&
        !(src.not && src.not.test(text))
      );
    })
    .slice(0, PER_SOURCE)
    .map((e) => {
      const title = e.title || e.summary.slice(0, 140) || `${src.name.replace(/ · Pinterest$/, "")} on Pinterest`;
      return {
        id: `${src.id}:${hashId(e.id || e.link)}`,
        source: src.id,
        sourceName: src.name,
        kind: src.kind === "editorial" && /street style/i.test(`${title} ${e.categories.join(" ")}`) ? "street" : src.kind,
        title,
        url: e.link,
        image: resizeImage(e.image!, 640),
        imageLarge: resizeImage(e.image!, 1280),
        published: e.published || new Date().toISOString(),
        section: sectionFrom(title, src.section),
        credit: e.author,
        categories: e.categories.slice(0, 6),
      } satisfies LiveItem;
    });
}

async function readYouTube(ch: { house: string; channel: string }): Promise<LiveItem[]> {
  const entries = parseFeed(await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${ch.channel}`));
  return entries
    // Full-length show films only (not Shorts, not adverts).
    .filter((e) => e.videoId && !e.link.includes("/shorts/") && isShow(e.title))
    .slice(0, 4)
    .map((e): LiveItem => ({
      id: `youtube:${e.videoId}`,
      source: "youtube",
      sourceName: `${ch.house} · YouTube`,
      kind: "show",
      title: e.title,
      url: e.link || `https://www.youtube.com/watch?v=${e.videoId}`,
      image: `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
      imageLarge: `https://i.ytimg.com/vi/${e.videoId}/sddefault.jpg`,
      published: e.published || new Date().toISOString(),
      section: sectionFrom(e.title, "both"),
      video: e.videoId,
      credit: ch.house,
      categories: [ch.house],
    }));
}

// ── Pinterest API (official, your own boards) ───────────────────────────────

/** GET from the Pinterest API with a token. */
async function pinterestGet(path: string, token: string): Promise<any> {
  const res = await fetch(`https://api.pinterest.com/v5${path}`, {
    headers: { Authorization: `Bearer ${token}`, "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Pinterest API HTTP ${res.status}`);
  return await res.json();
}

interface PinImage { url: string; width: number; height: number }

async function readPinterestApi(): Promise<LiveItem[]> {
  // A hand-pasted token wins (handy for testing); otherwise the connected account's.
  const token = env("PINTEREST_ACCESS_TOKEN") ?? (await getUsableToken().catch(() => null));
  if (!token) throw new Error("not connected (About page → Connect Pinterest)");
  let boards: { id: string; name: string }[];
  const ids = env("PINTEREST_BOARD_IDS")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (ids?.length) {
    boards = ids.map((id) => ({ id, name: "Pinterest" }));
  } else {
    const list = await pinterestGet("/boards?page_size=25&privacy=PUBLIC", token);
    boards = (list.items ?? []).slice(0, 8).map((b: any) => ({ id: b.id, name: b.name }));
  }
  const perBoard = await Promise.all(
    boards.map(async (board) => {
      const data = await pinterestGet(`/boards/${board.id}/pins?page_size=25`, token);
      return (data.items ?? []).map((pin: any): LiveItem | null => {
        const images: Record<string, PinImage> = pin.media?.images ?? {};
        const image = images["600x"]?.url ?? images["400x300"]?.url ?? images["1200x"]?.url;
        if (!image) return null;
        const title = pin.title || pin.description || pin.alt_text || board.name;
        const size = images["600x"] ?? images["1200x"];
        return {
          id: `pinterest:${pin.id}`,
          source: "pinterest-api",
          sourceName: `Pinterest · ${board.name}`,
          kind: "pinterest",
          title: String(title).slice(0, 200),
          url: `https://www.pinterest.com/pin/${pin.id}/`,
          image,
          imageLarge: images["1200x"]?.url ?? image,
          published: pin.created_at ? new Date(pin.created_at).toISOString() : new Date().toISOString(),
          section: sectionFrom(`${board.name} ${title}`, "both"),
          categories: [board.name],
          // The picture's real shape, so the feed shows it uncropped from the start.
          ...(size?.width && size?.height ? { width: size.width, height: size.height } : {}),
        };
      });
    }),
  );
  return perBoard.flat().filter((x): x is LiveItem => x !== null);
}

// ── Caching & the handler ───────────────────────────────────────────────────

interface Job { id: string; name: string; run: () => Promise<LiveItem[]> }
interface CacheEntry { at: number; items: LiveItem[]; error?: string }
const cache = new Map<string, CacheEntry>();

async function cached(job: Job): Promise<CacheEntry> {
  const hit = cache.get(job.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  try {
    const value = { at: Date.now(), items: await job.run() };
    cache.set(job.id, value);
    return value;
  } catch (e) {
    const value = { at: Date.now(), items: hit?.items ?? [], error: String((e as Error).message ?? e).slice(0, 120) };
    cache.set(job.id, value);
    return value;
  }
}

/**
 * Is this request from the app? It must send one of the project's public keys
 * (Supabase provides them to every function as environment variables).
 */
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!isFromTheApp(req)) {
    return new Response(JSON.stringify({ error: "Send the project's publishable key in the apikey header." }), {
      status: 401,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const jobs: Job[] = [
    { id: "pinterest-api", name: "Your Pinterest boards", run: readPinterestApi },
    ...RSS_SOURCES.map((s) => ({ id: s.id, name: s.name, run: () => readRss(s) })),
    { id: "youtube", name: "Designer channels · YouTube", run: async () => (await Promise.all(YOUTUBE_CHANNELS.map((c) => readYouTube(c).catch(() => [])))).flat() },
  ];
  const results = await Promise.all(jobs.map(async (job) => ({ job, result: await cached(job) })));

  const items = results.flatMap((r) => r.result.items);
  const sources = results.map(({ job, result }) => ({
    id: job.id,
    name: job.name,
    ok: !result.error,
    count: result.items.length,
    ...(result.error ? { error: result.error } : {}),
  }));

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), items, sources }), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
});
