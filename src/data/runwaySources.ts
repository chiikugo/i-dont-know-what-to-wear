/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/runwaySources.ts — links out to firstVIEW, Vogue Runway & friends
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE DOES
 *  When a look reaches the runway page we show a panel of "See it on the runway"
 *  buttons. This file builds those URLs. It is pure data + string-building: no
 *  network calls, nothing is scraped, and no third-party images are embedded.
 *
 *  TWO KINDS OF LINKS
 *   1. `showLinks(show)` — for ONE collection our photos came from, e.g.
 *      "Michael Kors Fall 2010": its Vogue Runway page, the designer on
 *      firstVIEW and ARCHIVE.pdf, and WWD coverage. Shown next to each source
 *      look on the runway page ("Seen on the runway").
 *   2. `buildSourceLinks(…)` — general links for a finished outfit: this
 *      season on Vogue Runway / firstVIEW, editorial sites, shops, inspiration.
 *
 *  WHY LINKS INSTEAD OF EMBEDDING?
 *  Runway photography on firstVIEW, Vogue Runway, WWD and ARCHIVE.pdf is
 *  copyrighted and mostly paywalled, and those sites offer no public API. Deep
 *  links are the honest, legal way to "connect" to them: the user lands on the
 *  right page of the real site. (Our own photos are Creative Commons runway
 *  photos from Wikimedia Commons — see data/shows.ts.)
 *
 *  ARE THE URLS REAL?
 *  Every URL pattern below was opened while building this file and returned the
 *  expected page (firstVIEW designer search, Vogue Runway season/show pages and
 *  search, ARCHIVE.pdf scans pages, Harper's Bazaar, Elle, GQ, WWD,
 *  Highsnobiety, Dazed, SSENSE, Farfetch, ASOS, Pinterest).
 *  Sites occasionally redesign — if a link 404s, fix its template here.
 *  NOTE: ARCHIVE.pdf is www.archivepdf.net (archivepdf.com is a different site).
 *
 *  COMMON CHANGES
 *  - Add a site     → add an entry in `buildSourceLinks` (copy one).
 *  - Re-order/hide  → edit the `kind` ordering in `groupSourceLinks`.
 *  - Different designers per mood → edit DESIGNERS_BY_VIBE.
 */

import { showOf } from "./shows";
import type { Section, Vibe } from "./types";

// ── Fashion seasons ─────────────────────────────────────────────────────────

/** A runway season, e.g. "Spring 2027". */
export interface Season {
  half: "spring" | "fall";
  year: number;
  /** "Spring 2027" */
  label: string;
  /** "spring-2027" — the form Vogue Runway uses in its URLs. */
  slug: string;
}

/**
 * The most recent runway season that has (mostly) shown, for a given date.
 *
 * Fashion weeks work like this:
 *   • Fall/Winter collections of year Y are shown January–March of Y.
 *   • Spring/Summer collections of year Y+1 are shown September–October of Y.
 * So from September onward the freshest collections are next year's Spring;
 * from January to August the freshest are this year's Fall.
 */
export function currentSeason(now: Date = new Date()): Season {
  const month = now.getMonth() + 1; // 1–12
  const year = now.getFullYear();
  if (month >= 9) {
    return { half: "spring", year: year + 1, label: `Spring ${year + 1}`, slug: `spring-${year + 1}` };
  }
  return { half: "fall", year, label: `Fall ${year}`, slug: `fall-${year}` };
}

// ── Designer spotlight (used for firstVIEW deep links) ──────────────────────

/**
 * Houses to spotlight per mood. firstVIEW's search is "starts with / contains"
 * on the designer name, so keep these as the plain brand names.
 * TWEAK: swap in your own favourites.
 */
export const DESIGNERS_BY_VIBE: Record<Vibe, string[]> = {
  minimal: ["Jil Sander", "The Row", "Lemaire"],
  classic: ["Ralph Lauren", "Max Mara", "Giorgio Armani"],
  relaxed: ["Bottega Veneta", "Loewe", "Chloe"],
  street: ["Balenciaga", "Off-White", "Y-3"],
  edgy: ["Saint Laurent", "Rick Owens", "Alexander McQueen"],
  romantic: ["Valentino", "Chloe", "Simone Rocha"],
  sporty: ["Prada", "Miu Miu", "Y-3"],
};

// ── The link list ───────────────────────────────────────────────────────────

/** What kind of destination a link is — used to group the buttons. */
export type SourceKind = "runway" | "editorial" | "shop" | "inspo";

export interface SourceLink {
  id: string;
  /** Site name shown on the button. */
  name: string;
  kind: SourceKind;
  /** One line of context under the name. */
  blurb: string;
  href: string;
  /** True when the site's full content needs a subscription. */
  paywalled?: boolean;
}

/** Inputs for building the links for one look. */
export interface SourceContext {
  section: Section;
  /** Plain-language search phrase, e.g. "oversized white shirt wide-leg trousers". */
  query: string;
  /** The look's dominant mood (picks the firstVIEW designer). */
  vibe?: Vibe;
  /** Override "now" (handy for tests). */
  now?: Date;
}

const enc = encodeURIComponent;

/** ARCHIVE.pdf — scans of runway, lookbook and archive pieces. */
export const ARCHIVE_PDF_URL = "https://www.archivepdf.net/scans";

/**
 * Links for ONE show our photos came from (see data/shows.ts):
 * Vogue Runway → firstVIEW → ARCHIVE.pdf (when the house has a page) → WWD.
 */
export function showLinks(showKey: string): SourceLink[] {
  const show = showOf(showKey);
  if (show.kind === "street") {
    return show.wwd
      ? [{ id: "wwd", name: "WWD", kind: "editorial", blurb: "Street-style coverage", href: `https://wwd.com/search/?q=${enc(show.wwd)}` }]
      : [];
  }
  const links: SourceLink[] = [];
  links.push(
    show.vogue
      ? { id: "vogue-show", name: "Vogue Runway", kind: "runway", blurb: `The full ${show.season} show`, href: show.vogue }
      : {
          id: "vogue-search",
          name: "Vogue",
          kind: "runway",
          blurb: `Search ${show.house}`,
          href: `https://www.vogue.com/search?q=${enc(`${show.house} ${show.season}`)}`,
        },
  );
  if (show.firstview) {
    links.push({
      id: "firstview",
      name: "firstVIEW",
      kind: "runway",
      blurb: `${show.house} collections`,
      href: `https://www.firstview.com/alpha_list.php?type=designer&deslist=1&s=${enc(show.firstview)}`,
      paywalled: true,
    });
  }
  if (show.archivePdf) {
    links.push({
      id: "archivepdf",
      name: "ARCHIVE.pdf",
      kind: "runway",
      blurb: `${show.house} archive scans`,
      href: `${ARCHIVE_PDF_URL}/${show.archivePdf}`,
    });
  }
  if (show.wwd) {
    links.push({ id: "wwd", name: "WWD", kind: "editorial", blurb: "Reviews & coverage", href: `https://wwd.com/search/?q=${enc(show.wwd)}` });
  }
  return links;
}

/**
 * Build every outbound link for a look.
 * Order matters: runway first (the point of the page), then editorial, shop,
 * and general inspiration.
 */
export function buildSourceLinks(ctx: SourceContext): SourceLink[] {
  const { section, query } = ctx;
  const q = enc(query);
  const season = currentSeason(ctx.now);
  const women = section === "womenswear";

  // Vogue's season pages use "ready-to-wear" for womenswear, "menswear" for men.
  const vogueCollection = `https://www.vogue.com/fashion-shows/${season.slug}-${women ? "ready-to-wear" : "menswear"}`;

  // firstVIEW: browse that gender's collections by date, or search a designer.
  const fvGender = women ? "Women" : "Men";
  const designer = (DESIGNERS_BY_VIBE[ctx.vibe ?? "classic"] ?? DESIGNERS_BY_VIBE.classic)[0];

  return [
    // ── Runway ────────────────────────────────────────────────────────────
    {
      id: "vogue-runway",
      name: "Vogue Runway",
      kind: "runway",
      blurb: `Every look from ${season.label} ${women ? "ready-to-wear" : "menswear"}`,
      href: vogueCollection,
    },
    {
      id: "firstview",
      name: "firstVIEW",
      kind: "runway",
      blurb: `Browse ${women ? "women's" : "men's"} runway collections by date`,
      href: `https://www.firstview.com/collection_results.php?s_g=${fvGender}&b=date&clear=1`,
      paywalled: true,
    },
    {
      id: "firstview-designer",
      name: `firstVIEW · ${designer}`,
      kind: "runway",
      blurb: "Designer spotlight that matches this mood",
      href: `https://www.firstview.com/alpha_list.php?type=designer&deslist=1&s=${enc(designer)}`,
      paywalled: true,
    },
    {
      id: "archivepdf",
      name: "ARCHIVE.pdf",
      kind: "runway",
      blurb: "Scans of rare runway and archive pieces",
      href: ARCHIVE_PDF_URL,
    },

    // ── Editorial ────────────────────────────────────────────────────────
    {
      id: "vogue-search",
      name: "Vogue",
      kind: "editorial",
      blurb: "Editorials and reports on this silhouette",
      href: `https://www.vogue.com/search?q=${q}`,
    },
    women
      ? {
          id: "bazaar",
          name: "Harper's Bazaar",
          kind: "editorial",
          blurb: "Styling stories and street style",
          href: `https://www.harpersbazaar.com/search/?q=${q}`,
        }
      : {
          id: "gq",
          name: "GQ",
          kind: "editorial",
          blurb: "Menswear guides and style notes",
          href: `https://www.gq.com/search?q=${q}`,
        },
    {
      id: "elle",
      name: "Elle",
      kind: "editorial",
      blurb: "Trend reports and how-to-wear",
      href: `https://www.elle.com/search/?q=${q}`,
    },
    {
      id: "wwd",
      name: "WWD",
      kind: "editorial",
      blurb: "Industry coverage and collections",
      href: `https://wwd.com/search/?q=${q}`,
    },
    {
      id: "highsnobiety",
      name: "Highsnobiety",
      kind: "editorial",
      blurb: "Streetwear and luxury crossover",
      href: `https://www.highsnobiety.com/search/?q=${q}`,
    },
    {
      id: "dazed",
      name: "Dazed",
      kind: "editorial",
      blurb: "Youth culture and new designers",
      href: `https://www.dazeddigital.com/search?q=${q}`,
    },

    // ── Shop ─────────────────────────────────────────────────────────────
    {
      id: "ssense",
      name: "SSENSE",
      kind: "shop",
      blurb: "Designer pieces in this style",
      href: `https://www.ssense.com/en-us/${women ? "women" : "men"}?q=${q}`,
    },
    {
      id: "farfetch",
      name: "Farfetch",
      kind: "shop",
      blurb: "Luxury boutiques worldwide",
      href: `https://www.farfetch.com/shopping/${women ? "women" : "men"}/search/items.aspx?q=${q}`,
    },
    {
      id: "asos",
      name: "ASOS",
      kind: "shop",
      blurb: "Wearable versions without the price tag",
      href: `https://www.asos.com/us/search/?q=${q}`,
    },

    // ── Inspiration ──────────────────────────────────────────────────────
    {
      id: "pinterest",
      name: "Pinterest",
      kind: "inspo",
      blurb: "Boards of real outfits",
      href: `https://www.pinterest.com/search/pins/?q=${enc(query + " outfit")}`,
    },
    {
      id: "google",
      name: "Google Images",
      kind: "inspo",
      blurb: "Runway looks that match",
      href: `https://www.google.com/search?tbm=isch&q=${enc(query + " runway look")}`,
    },
  ];
}

/** Group links by kind, in display order — convenient for rendering. */
export function groupSourceLinks(links: SourceLink[]): { kind: SourceKind; title: string; links: SourceLink[] }[] {
  const titles: Record<SourceKind, string> = {
    runway: "On the runway",
    editorial: "Editorial & reports",
    shop: "Shop the look",
    inspo: "More inspiration",
  };
  const order: SourceKind[] = ["runway", "editorial", "shop", "inspo"];
  return order
    .map((kind) => ({ kind, title: titles[kind], links: links.filter((l) => l.kind === kind) }))
    .filter((g) => g.links.length > 0);
}
