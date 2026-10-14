/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  live/feedCore.ts — reading RSS/Atom feeds into "live items" (shared code)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  ⚠  THIS FILE EXISTS TWICE, ON PURPOSE.
 *     src/live/feedCore.ts                      ← used by the web app
 *     supabase/functions/live-feed/feedCore.ts  ← used by the server relay
 *  Keep them IDENTICAL (copy one over the other after editing). A test
 *  (src/live/feedCore.test.ts) fails if they drift apart. It has no imports, so
 *  the same file runs in the browser (Vite) and on Supabase (Deno).
 *
 *  WHAT IT DOES
 *  Fashion sites publish "feeds" — machine-readable lists of their latest
 *  stories (RSS or Atom). Vogue Runway, Pinterest boards, YouTube channels… all
 *  have one. `parseFeed` turns a feed into simple entries (title, link, date,
 *  image). Images are never downloaded: an entry only keeps the image's ADDRESS,
 *  and the browser loads it from the publisher's own servers ("hot-linking").
 *
 *  WHY NOT A FULL XML LIBRARY?
 *  Feeds are simple and regular, and this needs to work in two runtimes with no
 *  dependencies. A few careful regular expressions handle every feed the app
 *  uses (they're tested against examples of each format in feedCore.test.ts).
 */

// ── The shape everything is normalised into ─────────────────────────────────

/** What kind of picture a live item is. */
export type LiveKind = "runway" | "street" | "show" | "pinterest" | "archive" | "editorial";

/** One look/story/video in the live feed, from any source. */
export interface LiveItem {
  /** Stable id (same story → same id on every refresh). */
  id: string;
  /** Which source it came from, e.g. "vogue-runway". */
  source: string;
  /** Display name of the source, e.g. "Vogue Runway". */
  sourceName: string;
  kind: LiveKind;
  title: string;
  /** Link to the original (article, pin or video page). Always shown. */
  url: string;
  /** Image address on the publisher's server (card size). */
  image: string;
  /** A bigger version for the detail view (falls back to `image`). */
  imageLarge?: string;
  /** ISO date it was published. */
  published: string;
  /** Who it's most relevant to. */
  section: "womenswear" | "menswear" | "both";
  /** YouTube video id, for show videos (played in an embedded player). */
  video?: string;
  /** Photographer / rights holder line, when the source gives one. */
  credit?: string;
  /** Section / board / tag names from the source (used for Muse's tags). */
  categories?: string[];
  /** The picture's real size in px, when the source says (keeps its shape exact in the feed). */
  width?: number;
  height?: number;
}

/** One raw entry read from a feed, before a source turns it into a LiveItem. */
export interface FeedEntry {
  title: string;
  link: string;
  id: string;
  /** ISO date ("" if the feed gave none). */
  published: string;
  categories: string[];
  image?: string;
  author?: string;
  /** Plain-text summary (HTML removed). */
  summary: string;
  /** YouTube feeds only. */
  videoId?: string;
}

// ── Small text helpers ──────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** "&amp;" → "&", "&#39;" → "'", "&#x2019;" → "’", and unwraps <![CDATA[…]]>. */
export function decodeEntities(input: string): string {
  return input
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
      }
      return ENTITIES[code.toLowerCase()] ?? whole;
    });
}

/** Remove HTML tags and squeeze whitespace. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Regular expressions are built once per tag name and reused: a feed has
 * dozens of entries and each asks for the same ten or so tags, so building
 * them fresh every time added up.
 */
const reCache = new Map<string, RegExp>();
function cachedRe(key: string, build: () => RegExp): RegExp {
  let re = reCache.get(key);
  if (!re) reCache.set(key, (re = build()));
  re.lastIndex = 0; // "g" expressions remember where they stopped — start over
  return re;
}

/** The text inside the first <tag>…</tag> (namespaced tags like "dc:creator" work too). */
function tagText(block: string, tag: string): string {
  const m = cachedRe(`text:${tag}`, () => new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")).exec(block);
  return m ? decodeEntities(m[1]).trim() : "";
}

/** Value of `attr` on the first <tag …> that also matches `extra` (if given). */
function tagAttr(block: string, tag: string, attr: string, extra?: RegExp): string {
  const re = cachedRe(`open:${tag}`, () => new RegExp(`<${tag}\\b[^>]*>`, "gi"));
  const attrRe = cachedRe(`attr:${attr}`, () => new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
  for (const m of block.matchAll(re)) {
    if (extra && !extra.test(m[0])) continue;
    const a = attrRe.exec(m[0]);
    if (a) return decodeEntities(a[2] ?? a[3] ?? "");
  }
  return "";
}

/** Any date string → ISO, or "" if it can't be read. */
function toIso(date: string): string {
  if (!date) return "";
  const t = Date.parse(date);
  return Number.isFinite(t) ? new Date(t).toISOString() : "";
}

/** A short, stable id from any string (djb2 hash, base 36). */
export function hashId(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// ── The parser ──────────────────────────────────────────────────────────────

/**
 * Read an RSS 2.0 or Atom feed into entries. Never throws: a broken feed just
 * gives fewer (or zero) entries.
 */
export function parseFeed(xml: string): FeedEntry[] {
  const out: FeedEntry[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const block of blocks) {
    const title = stripTags(tagText(block, "title"));
    // RSS: <link>url</link>. Atom: <link rel="alternate" href="url"/>.
    const link =
      tagText(block, "link") ||
      tagAttr(block, "link", "href", /rel\s*=\s*["']alternate["']/i) ||
      tagAttr(block, "link", "href");
    const id = tagText(block, "guid") || tagText(block, "id") || link;
    const published = toIso(tagText(block, "pubDate") || tagText(block, "published") || tagText(block, "updated") || tagText(block, "dc:date"));

    const categories: string[] = [];
    for (const m of block.matchAll(/<category\b([^>]*)>([\s\S]*?)<\/category>/gi)) {
      const text = stripTags(decodeEntities(m[2]));
      if (text) categories.push(text);
    }
    for (const m of block.matchAll(/<category\b[^>]*\bterm\s*=\s*"([^"]+)"[^>]*\/?>/gi)) categories.push(decodeEntities(m[1]));

    // The short text fields (decoded — Pinterest escapes its HTML inside <description>).
    const short = decodeEntities(tagText(block, "description") || tagText(block, "summary"));
    // Every HTML-ish field, decoded. Some feeds put a text-only <summary> first
    // and the picture in <content>, so all of them may be searched for an
    // image. Built only when needed: full articles (<content:encoded>) are
    // long, and most feeds name their picture in a <media:…> tag anyway.
    let fieldsCache: string[] | null = null;
    const fields = () =>
      (fieldsCache ??= ["content:encoded", "content", "description", "summary"].map((t) => decodeEntities(tagText(block, t))).filter(Boolean));
    const summary = stripTags(short || fields()[0] || "");
    const image =
      tagAttr(block, "media:thumbnail", "url") ||
      tagAttr(block, "media:content", "url", /medium\s*=\s*["']image["']|type\s*=\s*["']image\//i) ||
      tagAttr(block, "media:content", "url", /url\s*=\s*["'][^"']+\.(?:jpe?g|png|webp|gif)/i) ||
      tagAttr(block, "enclosure", "url", /type\s*=\s*["']image\//i) ||
      (/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(fields().join(" "))?.[1] ?? "");

    const author = stripTags(tagText(block, "dc:creator") || tagText(block, "name") || tagText(block, "author"));
    const videoId = tagText(block, "yt:videoId") || undefined;

    if (!title && !link) continue;
    out.push({
      title,
      link,
      id,
      published,
      categories,
      image: image ? decodeEntities(image) : undefined,
      author: author || undefined,
      summary: summary.slice(0, 400),
      videoId,
    });
  }
  return out;
}

// ── Image sizes on the publishers' own servers ──────────────────────────────

/**
 * Ask the publisher's image server for a sensible size instead of the
 * original (some originals are 5–10 MB). Each big fashion publisher's image
 * CDN takes a size in its URL; unknown hosts are left alone.
 */
export function resizeImage(url: string, width: number): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    // Condé Nast (Vogue, British Vogue, GQ): /master/pass/ → /master/w_640,c_limit/
    if (/(^|\.)(assets\.vogue\.com|media\.vogue\.co\.uk|media\.gq\.com|assets\.wmagazine\.com)$/.test(host) && u.pathname.includes("/master/")) {
      u.pathname = u.pathname.replace(/\/master\/[^/]+\//, `/master/w_${width},c_limit/`);
      return u.toString();
    }
    // Pinterest: /236x/… → /736x/… (Pinterest only serves a few widths).
    if (host === "i.pinimg.com") {
      const size = width <= 236 ? "236x" : width <= 474 ? "474x" : width <= 564 ? "564x" : "736x";
      u.pathname = u.pathname.replace(/^\/(\d+x|originals)\//, `/${size}/`);
      return u.toString();
    }
    // Hearst (Harper's Bazaar, Elle).
    if (host === "hips.hearstapps.com") {
      u.searchParams.set("resize", `${width}:*`);
      return u.toString();
    }
    // Bustle Digital (W Magazine) — imgix.
    if (host === "imgix.bustle.com") {
      u.searchParams.set("w", String(width));
      return u.toString();
    }
    // YouTube thumbnails: hqdefault (480px) is plenty for cards.
    if (/(^|\.)ytimg\.com$/.test(host)) {
      u.pathname = u.pathname.replace(/\/[a-z0-9]*default\.jpg$/i, width > 480 ? "/sddefault.jpg" : "/hqdefault.jpg");
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}
