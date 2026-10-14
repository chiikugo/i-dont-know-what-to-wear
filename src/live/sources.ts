/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  live/sources.ts — where the live, always-refreshing looks come from
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  THE HOME PAGE'S "LIVE FROM THE RUNWAY" ROW pulls fresh looks from high-fashion
 *  sources online. Nothing is downloaded or stored: the app keeps each item's
 *  title, link and IMAGE ADDRESS, and the browser shows the picture straight
 *  from the publisher's own servers, always linking back to the original.
 *
 *  TWO WAYS A SOURCE IS READ
 *  1. DIRECT — the browser reads the feed itself. Only possible when the site
 *     allows it (Vogue, British Vogue and GQ do; so does the V&A museum's API).
 *     These work with no setup at all.
 *  2. RELAY — sites that don't allow it (Pinterest, YouTube, Harper's Bazaar,
 *     ELLE, W, Hypebeast, Dazed) are read by a small Supabase Edge Function,
 *     supabase/functions/live-feed. That's also where the official Pinterest API
 *     runs with YOUR token (tokens must never be in the web page). The relay's
 *     source list lives in that file.
 *
 *  WHY THESE SOURCES (the research behind it, October 2026)
 *  - Vogue Runway / British Vogue / GQ: official RSS feeds, updated many times a
 *    day during fashion month, large images, browser-readable.
 *  - Pinterest: the official API (v5) only reads boards of the account that
 *    authorised the app — so you curate boards, the app reads them. Pinterest's
 *    public profile feeds of the houses themselves (Dior, Saint Laurent, Prada,
 *    Louis Vuitton, Balmain, Burberry, Oscar de la Renta, McQueen, Gucci) and of
 *    Vogue, British Vogue, W and GQ need no setup.
 *  - YouTube: the houses' own channels post full shows; videos may be embedded.
 *  - V&A: a free museum API with designer archive pieces (McQueen, Westwood…).
 *  - Openverse: Creative Commons runway photos from Wikimedia Commons, a page
 *    at a time, so the endless feed never runs dry (see OPENVERSE_QUERIES).
 *  - Looked at but not wired in: The Met's Costume Institute API (CC0 images
 *    for its 19th-century couture — but it sits behind bot protection that
 *    blocks bursts of requests, so it's unreliable for a live feed).
 *  - NOT used: Google image search (API closing to everyone on 1 Jan 2027),
 *    Bing image search (retired 2025), Flickr (API keys now need a paid Pro
 *    account), Instagram (no public feed), firstVIEW / Vogue Runway galleries /
 *    Tagwalk (no public API — subscription or business licensing only).
 *
 *  ADD A DIRECT SOURCE: copy an entry in DIRECT_SOURCES. It must be a feed the
 *  browser is allowed to read (test: open the app, check the source's status
 *  line under the live row — it says if the browser was blocked).
 */

import type { LiveKind } from "./feedCore";

export type LiveSection = "womenswear" | "menswear" | "both";

export interface DirectSource {
  id: string;
  name: string;
  /** The RSS/Atom feed address. */
  url: string;
  kind: LiveKind;
  /** Who the source mostly speaks to (titles can override, e.g. "menswear"). */
  section: LiveSection;
  /** Keep only entries whose categories match (optional). */
  onlyCategories?: RegExp;
  /** Drop entries whose categories / link / title match (optional). */
  not?: RegExp;
  /** Keep only stories about looks — collections, shows, street style, designers (see live/tags.ts). */
  looksOnly?: boolean;
}

/** Shopping round-ups and sales aren't runway looks. */
const SHOPPING = /shopping|vogue shops|\bsales?\b|black friday|cyber|deals|wedding|gift/i;

/** Feeds the browser reads directly — they work with no setup. */
export const DIRECT_SOURCES: DirectSource[] = [
  {
    id: "vogue-runway",
    name: "Vogue Runway",
    url: "https://www.vogue.com/feed/runway/rss",
    kind: "runway",
    section: "womenswear",
    not: SHOPPING,
  },
  {
    id: "british-vogue",
    name: "British Vogue",
    url: "https://www.vogue.co.uk/feed/rss",
    kind: "editorial",
    section: "womenswear",
    onlyCategories: /^(fashion|street style|runway|catwalk|fashion week)$/i,
    not: SHOPPING,
    looksOnly: true,
  },
  {
    id: "gq",
    name: "GQ",
    url: "https://www.gq.com/feed/rss",
    kind: "editorial",
    section: "menswear",
    onlyCategories: /^(style|fashion|runway)$/i,
    not: SHOPPING,
    looksOnly: true,
  },
];

/**
 * Designers searched in the V&A museum's collection (two per refresh, taking
 * turns, so the archive pieces keep changing). TWEAK freely.
 */
export const VAM_DESIGNERS = [
  "Alexander McQueen",
  "Vivienne Westwood",
  "Balenciaga",
  "Christian Dior",
  "Yohji Yamamoto",
  "Comme des Garçons",
  "Issey Miyake",
  "Jean Paul Gaultier",
  "Gianni Versace",
  "John Galliano",
  "Hussein Chalayan",
  "Zandra Rhodes",
  "Thierry Mugler",
  "Azzedine Alaïa",
  "Schiaparelli",
  "Ossie Clark",
];

/**
 * OPENVERSE — an open search engine (run by WordPress.org) over Creative
 * Commons images. Restricted to Wikimedia Commons, it finds real runway photos
 * by the same photographers as the app's own catalog (Christopher Macsurak,
 * Masaki-H…), each with its licence and photographer. Searched a page at a time
 * whenever the endless feed runs low (useLiveFeed.ts → loadMoreArchive), so the
 * wall never runs dry. Anonymous use allows 20 searches a minute and 200 a day
 * per visitor — the app uses at most one every 20 s. TWEAK the searches freely.
 */
export const OPENVERSE_QUERIES: Record<"womenswear" | "menswear", string[]> = {
  womenswear: [
    "Spring-Summer runway",
    "Fall-Winter runway",
    "haute couture runway",
    "Paris Fashion Week runway",
    "Milan Fashion Week runway",
    "New York Fashion Week runway",
    "London Fashion Week runway",
    "Chanel haute couture",
    "Christian Dior runway",
    "Valentino runway",
    "Givenchy runway",
    "Elie Saab runway",
    "Jean Paul Gaultier couture",
    "Prada runway",
    "Versace runway",
  ],
  menswear: [
    "menswear runway",
    "menswear Fall-Winter",
    "menswear Spring-Summer",
    "Paris Men's Fashion Week",
    "Milan Men's Fashion Week",
    "London Collections Men",
    "Pitti Uomo",
  ],
};

/** Only these V&A object types count as "looks" (not sketches or posters). */
export const VAM_OBJECT_TYPES = /ensemble|dress|gown|coat|jacket|suit|skirt|trouser|top|bodice|shoe|boot|bag|hat|cape|jumpsuit/i;

/** How often the live posts refresh themselves, in minutes. TWEAK (Vogue updates its feed every ~5 min). */
export const REFRESH_MINUTES = 3;

/** Words for each kind of live post (the label on its card). */
export const LIVE_KIND_LABEL: Record<LiveKind, string> = {
  runway: "Runway",
  street: "Street style",
  show: "Show",
  pinterest: "Pinterest",
  archive: "Archive",
  editorial: "Editorial",
};
