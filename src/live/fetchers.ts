/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  live/fetchers.ts — actually going online to get the latest looks
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Four kinds of fetch, all returning the same shape (a SourceResult):
 *    fetchDirect(source)    → an RSS feed the browser may read itself (Vogue…)
 *    fetchVam(designers)    → designer pieces from the V&A museum's open API
 *    fetchOpenverse(query)  → Creative Commons runway photos (Wikimedia Commons)
 *    fetchRelay()           → everything the Supabase relay collected (Pinterest,
 *                             YouTube shows, Bazaar, ELLE…), if the relay is set up
 *
 *  A source that fails (offline, site down, blocked) never breaks the row — it
 *  just reports `ok: false` with a short reason, shown in the status line.
 */

import { housesIn } from "../data/houses";
import { pickThumbWidth } from "../lib/imageUrl";
import { hashId, type LiveItem, parseFeed, resizeImage } from "./feedCore";
import type { DirectSource, LiveSection } from "./sources";
import { VAM_OBJECT_TYPES } from "./sources";
import { isLookStory } from "./tags";

export interface SourceResult {
  id: string;
  name: string;
  ok: boolean;
  items: LiveItem[];
  error?: string;
}

const TIMEOUT_MS = 10_000;

/** fetch with a timeout. */
async function get(url: string, headers?: Record<string, string>): Promise<Response> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

/** A short, friendly reason for a failed fetch. */
function reason(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/abort|timeout/i.test(msg)) return "timed out";
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return "offline or blocked";
  return msg.slice(0, 80);
}

/** Titles that say "men's"/"menswear" go to menswear even from a womenswear source. */
function sectionFrom(text: string, fallback: LiveSection): LiveSection {
  if (/\bmen'?s\b|menswear/i.test(text)) return "menswear";
  return fallback;
}

/** Read one RSS feed straight from the browser. */
export async function fetchDirect(source: DirectSource): Promise<SourceResult> {
  try {
    const xml = await (await get(source.url)).text();
    const items = parseFeed(xml)
      .filter((e) => {
        if (!e.image || !e.link || !e.title) return false;
        if (source.looksOnly && !isLookStory(`${e.title} ${e.categories.join(" ")}`)) return false;
        if (source.onlyCategories && !e.categories.some((c) => source.onlyCategories!.test(c))) return false;
        if (source.not && source.not.test(`${e.categories.join(" ")} ${e.link}`)) return false;
        return true;
      })
      .slice(0, 20)
      .map((e): LiveItem => {
        const cats = e.categories.join(" ");
        return {
          id: `${source.id}:${hashId(e.id || e.link)}`,
          source: source.id,
          sourceName: source.name,
          kind: /street style/i.test(`${cats} ${e.title}`) ? "street" : source.kind,
          title: e.title,
          url: e.link,
          image: resizeImage(e.image!, 640),
          imageLarge: resizeImage(e.image!, 1280),
          published: e.published || new Date().toISOString(),
          section: sectionFrom(e.title, source.section),
          credit: e.author,
          categories: e.categories.slice(0, 6),
        };
      });
    return { id: source.id, name: source.name, ok: true, items };
  } catch (e) {
    return { id: source.id, name: source.name, ok: false, items: [], error: reason(e) };
  }
}

/** The bits of a V&A API record we use. */
interface VamRecord {
  systemNumber: string;
  objectType?: string;
  _primaryTitle?: string;
  _primaryMaker?: { name?: string };
  _primaryDate?: string;
  _images?: { _iiif_image_base_url?: string };
}

/**
 * Designer pieces from the V&A (Victoria and Albert Museum) collection API.
 * Free and open to browsers; images are served by the museum (IIIF).
 * Archive pieces aren't "news", so they're dated a day and a half back — they
 * mix into the row instead of always leading or trailing it.
 */
export async function fetchVam(designers: string[], options: { page?: number; perDesigner?: number } = {}): Promise<SourceResult> {
  const name = "V&A archive";
  const { page = 1, perDesigner = 5 } = options;
  try {
    const batches = await Promise.all(
      designers.map(async (designer) => {
        const url = `https://api.vam.ac.uk/v2/objects/search?q=${encodeURIComponent(designer)}&images_exist=1&page_size=30&page=${page}`;
        const data = (await (await get(url)).json()) as { records?: VamRecord[] };
        return (data.records ?? [])
          .filter((r) => r._images?._iiif_image_base_url && VAM_OBJECT_TYPES.test(r.objectType ?? "") && (r._primaryMaker?.name ?? "").toLowerCase().includes(designer.toLowerCase().split(" ").pop()!))
          .slice(0, perDesigner)
          .map((r): LiveItem => {
            const base = r._images!._iiif_image_base_url!;
            const maker = r._primaryMaker?.name ?? designer;
            const title = [r._primaryTitle || r.objectType, maker, r._primaryDate].filter(Boolean).join(" · ");
            return {
              id: `vam:${r.systemNumber}`,
              source: "vam",
              sourceName: name,
              kind: "archive",
              title,
              url: `https://collections.vam.ac.uk/item/${r.systemNumber}/`,
              image: `${base}full/!640,640/0/default.jpg`,
              imageLarge: `${base}full/!1280,1280/0/default.jpg`,
              published: new Date(Date.now() - 36 * 3_600_000).toISOString(),
              section: "both",
              credit: "© Victoria and Albert Museum, London",
              categories: [maker, r.objectType ?? ""].filter(Boolean),
            };
          });
      }),
    );
    return { id: "vam", name, ok: true, items: batches.flat() };
  } catch (e) {
    return { id: "vam", name, ok: false, items: [], error: reason(e) };
  }
}

// ── Openverse: Creative Commons runway photos ───────────────────────────────

/** The fields of an Openverse image result we use. */
export interface OpenverseImage {
  id: string;
  title?: string;
  /** The original file (on upload.wikimedia.org for Commons photos). */
  url: string;
  /** The photo's page on Wikimedia Commons (where it's credited in full). */
  foreign_landing_url?: string;
  creator?: string;
  license: string;
  license_version?: string;
  width?: number;
  height?: number;
}

/** Words that make a title an actual runway / fashion-week photo. */
const FASHION_WORDS = /fashion week|haute couture|catwalk|runway show|fashion show|d[ée]fil[ée]|pr[eê]t-[aà]-porter|ready-to-wear|menswear|womenswear|couture/i;
/** A season or year: "Spring-Summer 2014", "FW18", "Fall 2010"… */
const SEASON_WORDS = /\b(spring|summer|fall|autumn|winter|resort|cruise|pre-fall)\b|\b(ss|fw|aw)\s?\d{2}\b|\b(19|20)\d{2}\b/i;
/** Titles that are clearly something else (an airport runway, a premiere…). */
const NOT_RUNWAY = /airport|aircraft|airline|\bplane\b|\brunway \d|concert|premiere|red carpet|award|gala|festival|press conference|interview|signing|stadium/i;

/**
 * Is this Commons file title a runway photo? A house name + a season
 * ("Michael Kors Spring-Summer 2014 02"), or clear fashion-week words.
 */
export function isRunwayPhotoTitle(title: string): boolean {
  if (!title || NOT_RUNWAY.test(title)) return false;
  if (housesIn(title).length > 0 && (SEASON_WORDS.test(title) || /runway|couture/i.test(title))) return true;
  return FASHION_WORDS.test(title) || (/\brunway\b/i.test(title) && SEASON_WORDS.test(title));
}

/** "File:Max Azria Fall-Winter 2010 023 (cropped).jpg" → "Max Azria Fall-Winter 2010" */
export function cleanPhotoTitle(title: string): string {
  return title
    .replace(/^File:/i, "")
    .replace(/\.(jpe?g|png|webp|tiff?)$/i, "")
    .replace(/\((cropped|crop|edit|edited)\)/gi, "")
    .replace(/\s+\d{1,4}\s*$/, "") // trailing photo number
    .replace(/[_\s]+/g, " ")
    .trim();
}

/**
 * A Wikimedia thumbnail of an original Commons file, at one of Wikimedia's
 * standard widths (lib/imageUrl.ts) — never wider than the original.
 */
export function commonsThumbOf(original: string, wanted: number, originalWidth?: number): string {
  const m = original.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp))$/i);
  if (!m) return original;
  if (originalWidth && originalWidth <= 330) return original;
  const width = pickThumbWidth(wanted, originalWidth ?? 4000);
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${width}px-${m[3]}`;
}

/** "by" + "2.0" → "CC BY 2.0"; "cc0" → "CC0"; "pdm" → "Public domain". */
export function licenceLabel(license: string, version?: string): string {
  const l = license.toLowerCase();
  if (l === "cc0") return "CC0";
  if (l === "pdm") return "Public domain";
  return `CC ${l.toUpperCase()}${version ? ` ${version}` : ""}`;
}

/** One Openverse result → a live item (or null if it isn't a runway photo). */
export function openverseToItem(r: OpenverseImage, section: "womenswear" | "menswear", publishedAt: string): LiveItem | null {
  const raw = r.title ?? "";
  if (!isRunwayPhotoTitle(raw) || !/^https:\/\//.test(r.url)) return null;
  const title = cleanPhotoTitle(raw);
  const mens = /\bmen'?s\b|menswear|\buomo\b|\bhomme\b/i.test(raw);
  const creator = (r.creator ?? "").replace(/\s+from\s+.+$/i, "").trim();
  return {
    id: `openverse:${r.id}`,
    source: "openverse",
    sourceName: "Wikimedia Commons",
    kind: /street style/i.test(raw) ? "street" : "runway",
    title,
    url: r.foreign_landing_url && /^https:\/\//.test(r.foreign_landing_url) ? r.foreign_landing_url : r.url,
    image: commonsThumbOf(r.url, 500, r.width),
    imageLarge: commonsThumbOf(r.url, 1280, r.width),
    published: publishedAt,
    section: mens ? "menswear" : section,
    credit: `Photo: ${creator || "Wikimedia Commons"} · ${licenceLabel(r.license, r.license_version)}`,
    categories: [title],
    ...(r.width && r.height ? { width: r.width, height: r.height } : {}),
  };
}

/**
 * One page of Creative Commons runway photos for a search, from Openverse
 * (Wikimedia Commons only — the best-curated runway photography; licences that
 * allow cropping only). Returns how many pages there are, too.
 */
export async function fetchOpenverse(
  query: string,
  page: number,
  section: "womenswear" | "menswear",
): Promise<SourceResult & { pages: number }> {
  const name = "Openverse (Wikimedia Commons)";
  try {
    const url =
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}` +
      `&source=wikimedia&license_type=modification&mature=false&page_size=20&page=${page}`;
    const data = (await (await get(url)).json()) as { results?: OpenverseImage[]; page_count?: number };
    // Older runway photos: dated a few days back so they mix in below today's news.
    const publishedAt = new Date(Date.now() - 4 * 24 * 3_600_000).toISOString();
    const items = (data.results ?? []).map((r) => openverseToItem(r, section, publishedAt)).filter((x): x is LiveItem => x !== null);
    return { id: "openverse", name, ok: true, items, pages: data.page_count ?? page };
  } catch (e) {
    return { id: "openverse", name, ok: false, items: [], error: reason(e), pages: page };
  }
}

/** What the relay sends back. */
interface RelayResponse {
  generatedAt: string;
  items: LiveItem[];
  sources: { id: string; name: string; ok: boolean; count: number; error?: string }[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
/** The public (publishable) key — the relay only answers requests that carry it. */
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** The relay's address (the Supabase Edge Function "live-feed"), or null if Supabase isn't set up. */
export const RELAY_URL = SUPABASE_URL ? `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/live-feed` : null;

/**
 * Everything the relay collected. Returns one SourceResult per relay source
 * (so the status line can say e.g. "Your Pinterest boards: not connected").
 */
export async function fetchRelay(): Promise<SourceResult[]> {
  if (!RELAY_URL || !SUPABASE_KEY) return [{ id: "relay", name: "Relay", ok: false, items: [], error: "Supabase not configured" }];
  try {
    // Key on the `apikey` header only (not "Authorization": new keys aren't JWTs).
    const data = (await (await get(RELAY_URL, { apikey: SUPABASE_KEY })).json()) as RelayResponse;
    const bySource = new Map<string, LiveItem[]>();
    for (const item of data.items ?? []) {
      const key = item.source === "youtube" ? "youtube" : item.source;
      bySource.set(key, [...(bySource.get(key) ?? []), item]);
    }
    return (data.sources ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      ok: s.ok,
      items: bySource.get(s.id) ?? [],
      error: s.error,
    }));
  } catch (e) {
    return [{ id: "relay", name: "Relay", ok: false, items: [], error: reason(e) }];
  }
}
