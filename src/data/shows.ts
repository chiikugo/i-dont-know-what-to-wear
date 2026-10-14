/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/shows.ts — the collections our looks come from (and where to see them)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE IS
 *  Every runway look in the app belongs to a "show": one designer's collection
 *  in one season (Michael Kors, Fall 2010), or a group of street-style photos
 *  from one fashion week, or a designer's museum archive. This file names each
 *  show and says where to see the rest of it:
 *
 *    vogue       the show's page on Vogue Runway (every link below was opened
 *                and returned the right page when this file was written)
 *    firstview   the designer name to search on firstVIEW (subscription archive)
 *    archivePdf  the designer's page on ARCHIVE.pdf (www.archivepdf.net/scans/…),
 *                only for houses that actually have one there
 *    wwd         words to search on WWD (Women's Wear Daily)
 *
 *  WHY LINKS, NOT THEIR PHOTOS
 *  firstVIEW, Vogue Runway, WWD and ARCHIVE.pdf photos are copyrighted (and
 *  mostly behind a paywall), so we can't show them inside the app. Our own
 *  photos are real runway / street / museum photos from Wikimedia Commons under
 *  Creative Commons licences — and every look links out to its show on those
 *  sites so you can see the full collection there.
 *
 *  HOW TO ADD A SHOW
 *  1. Add an entry below (copy one). The key is what tools/looks/looks.src.txt
 *     uses in its 4th column.
 *  2. Open the Vogue Runway URL in a browser before adding it — if Vogue doesn't
 *     cover that show, leave `vogue` out and the app falls back to a Vogue search.
 */

import { HOUSES } from "./houses";
import type { LookKind } from "./types";

export interface ShowDef {
  /** The designer / house, or "Street style". Shown on every card. */
  house: string;
  /** Lower-case id for the house — what the taste model ("Muse") learns. */
  houseSlug: string;
  /** "Fall 2010 Ready-to-Wear", "Spring 2012 Couture", "Archive"… */
  season: string;
  /** Where it was shown (optional). */
  city?: string;
  kind: LookKind;
  /** Vogue Runway page for exactly this show (verified). */
  vogue?: string;
  /** Designer name to search on firstVIEW. */
  firstview?: string;
  /** ARCHIVE.pdf scans page slug (www.archivepdf.net/scans/<slug>). */
  archivePdf?: string;
  /** Words to search on WWD. */
  wwd?: string;
  /** One line of context for the runway page. */
  note?: string;
}

const VOGUE = "https://www.vogue.com/fashion-shows";

/** Every show the catalog uses. Keys are referenced by the looks. */
export const SHOWS: Record<string, ShowDef> = {
  // ── Womenswear runway ────────────────────────────────────────────────────
  "kors-fw10": {
    house: "Michael Kors",
    houseSlug: "michael-kors",
    season: "Fall 2010 Ready-to-Wear",
    city: "New York",
    kind: "runway",
    vogue: `${VOGUE}/fall-2010-ready-to-wear/michael-kors-collection`,
    firstview: "Michael Kors",
    wwd: "Michael Kors fall 2010",
    note: "Camel, grey and fur — American luxury sportswear at its most polished.",
  },
  "lim-fw10": {
    house: "3.1 Phillip Lim",
    houseSlug: "phillip-lim",
    season: "Fall 2010 Ready-to-Wear",
    city: "New York",
    kind: "runway",
    vogue: `${VOGUE}/fall-2010-ready-to-wear/3-1-phillip-lim`,
    firstview: "Phillip Lim",
    wwd: "3.1 Phillip Lim fall 2010",
    note: "Blanket plaids, shearling and lamé — downtown cool with a sense of humour.",
  },
  "dbg-fw10": {
    house: "Diesel Black Gold",
    houseSlug: "diesel-black-gold",
    season: "Fall 2010 Ready-to-Wear",
    city: "New York",
    kind: "runway",
    vogue: `${VOGUE}/fall-2010-ready-to-wear/diesel-black-gold`,
    firstview: "Diesel Black Gold",
    wwd: "Diesel Black Gold fall 2010",
    note: "Leather, denim and buckled boots — rock'n'roll denim done luxe.",
  },
  "chai-fw10": {
    house: "Richard Chai",
    houseSlug: "richard-chai",
    season: "Fall 2010 Ready-to-Wear",
    city: "New York",
    kind: "runway",
    vogue: `${VOGUE}/fall-2010-ready-to-wear/richard-chai-love`,
    firstview: "Richard Chai",
    wwd: "Richard Chai fall 2010",
    note: "Soft taupes, slouchy satin and florals — relaxed, layered, romantic.",
  },
  "y3-fw10": {
    house: "Y-3",
    houseSlug: "y-3",
    season: "Fall 2010",
    city: "New York",
    kind: "runway",
    vogue: `${VOGUE}/fall-2010-ready-to-wear/y-3`,
    firstview: "Y-3",
    archivePdf: "yohji-yamamoto",
    wwd: "Y-3 fall 2010",
    note: "Yohji Yamamoto × adidas: capes, stripes and colour-blocked sportswear.",
  },
  "jill-fw10": {
    house: "Jill Stuart",
    houseSlug: "jill-stuart",
    season: "Fall 2010 Ready-to-Wear",
    city: "New York",
    kind: "runway",
    vogue: `${VOGUE}/fall-2010-ready-to-wear/jill-stuart`,
    firstview: "Jill Stuart",
    wwd: "Jill Stuart fall 2010",
    note: "Over-the-knee boots, sequins and slouchy beanies — dark and girlish.",
  },
  "dvf-ss14": {
    house: "Diane von Furstenberg",
    houseSlug: "dvf",
    season: "Spring 2014 Ready-to-Wear",
    city: "New York",
    kind: "runway",
    vogue: `${VOGUE}/spring-2014-ready-to-wear/diane-von-furstenberg`,
    firstview: "Diane von Furstenberg",
    wwd: "Diane von Furstenberg spring 2014",
    note: "Wrap dresses, graphic prints and gold — summer glamour.",
  },
  "mcqueen-fw18": {
    house: "Alexander McQueen",
    houseSlug: "alexander-mcqueen",
    season: "Fall 2018 Ready-to-Wear",
    city: "Paris",
    kind: "runway",
    vogue: `${VOGUE}/fall-2018-ready-to-wear/alexander-mcqueen`,
    firstview: "Alexander McQueen",
    wwd: "Alexander McQueen fall 2018",
    note: "Sarah Burton's moth prints, leather corsetry and sharp tailoring.",
  },
  "maxmara-fw19": {
    house: "Max Mara",
    houseSlug: "max-mara",
    season: "Fall 2019 Ready-to-Wear",
    city: "Milan",
    kind: "runway",
    vogue: `${VOGUE}/fall-2019-ready-to-wear/max-mara`,
    firstview: "Max Mara",
    wwd: "Max Mara fall 2019",
    note: "The camel coat house: teddy coats, croc boots and tonal dressing.",
  },
  "basilsoda-hc-ss12": {
    house: "Basil Soda",
    houseSlug: "basil-soda",
    season: "Spring 2012 Couture",
    city: "Paris",
    kind: "couture",
    firstview: "Basil Soda",
    wwd: "Basil Soda couture spring 2012",
    note: "Hand-embroidered evening gowns from the Beirut couturier.",
  },
  "ivh-hc-ss12": {
    house: "Iris van Herpen",
    houseSlug: "iris-van-herpen",
    season: "Spring 2012 Couture",
    city: "Paris",
    kind: "couture",
    vogue: `${VOGUE}/spring-2012-couture/iris-van-herpen`,
    firstview: "Iris van Herpen",
    wwd: "Iris van Herpen couture spring 2012",
    note: "Sculptural, 3D-built couture — fashion as architecture.",
  },
  "lins-hc-ss12": {
    house: "Gustavo Lins",
    houseSlug: "gustavo-lins",
    season: "Spring 2012 Couture",
    city: "Paris",
    kind: "couture",
    firstview: "Gustavo Lins",
    wwd: "Gustavo Lins couture",
    note: "Draped, architectural couture from the Brazilian-born Paris designer.",
  },

  // ── Menswear runway ──────────────────────────────────────────────────────
  "oliverspencer-ss14": {
    house: "Oliver Spencer",
    houseSlug: "oliver-spencer",
    season: "Spring 2014 Menswear",
    city: "London",
    kind: "runway",
    firstview: "Oliver Spencer",
    wwd: "Oliver Spencer spring 2014",
    note: "Relaxed British tailoring: linen suits, paint-splattered cotton, loafers.",
  },
  "astridandersen-ss14": {
    house: "Astrid Andersen",
    houseSlug: "astrid-andersen",
    season: "Spring 2014 Menswear",
    city: "London",
    kind: "runway",
    vogue: `${VOGUE}/spring-2014-menswear/astrid-andersen`,
    firstview: "Astrid Andersen",
    wwd: "Astrid Andersen spring 2014",
    note: "Luxury sportswear: lace, mesh and velvet tracksuits.",
  },

  // ── Street style ─────────────────────────────────────────────────────────
  "street-paris-aw19": {
    house: "Street style",
    houseSlug: "street-style",
    season: "Paris Fashion Week · Autumn/Winter 2019",
    city: "Paris",
    kind: "street",
    wwd: "Paris Fashion Week street style fall 2019",
    note: "Editors and front-row regulars arriving at the shows.",
  },
  "street-lv-aw14": {
    house: "Street style",
    houseSlug: "street-style",
    season: "Louis Vuitton show · Autumn/Winter 2014",
    city: "Paris",
    kind: "street",
    wwd: "Louis Vuitton fall 2014 street style",
    note: "Outside the Louis Vuitton show, Paris.",
  },
  "street-paris-hc12": {
    house: "Street style",
    houseSlug: "street-style",
    season: "Paris Haute Couture week · 2012",
    city: "Paris",
    kind: "street",
    wwd: "Paris couture street style 2012",
    note: "Between the couture shows, Paris.",
  },

  // ── Archive (museum pieces, photographed on their own) ───────────────────
  "archive-rafsimons": {
    house: "Raf Simons",
    houseSlug: "raf-simons",
    season: "Archive · 1998–2005",
    kind: "archive",
    firstview: "Raf Simons",
    archivePdf: "raf-simons",
    wwd: "Raf Simons archive",
    note: "Pieces held by the RISD Museum, Providence.",
  },
  "archive-cdg": {
    house: "Comme des Garçons",
    houseSlug: "comme-des-garcons",
    season: "Archive",
    kind: "archive",
    firstview: "Comme des Garcons",
    archivePdf: "comme-des-garcons",
    wwd: "Comme des Garcons Rei Kawakubo",
    note: "Rei Kawakubo's label — museum and collector pieces.",
  },
  "archive-junya": {
    house: "Junya Watanabe",
    houseSlug: "junya-watanabe",
    season: "Archive · 2002",
    kind: "archive",
    firstview: "Junya Watanabe",
    archivePdf: "comme-des-garcons",
    wwd: "Junya Watanabe",
    note: "Junya Watanabe for Comme des Garçons, held by the RISD Museum.",
  },
  "archive-wvb": {
    house: "Walter Van Beirendonck",
    houseSlug: "walter-van-beirendonck",
    season: "Archive · 2017",
    kind: "archive",
    firstview: "Walter Van Beirendonck",
    archivePdf: "walter-van-beirendonck",
    wwd: "Walter Van Beirendonck",
    note: "The Antwerp Six's maximalist, held by the RISD Museum.",
  },
  "archive-paulsmith": {
    house: "Paul Smith",
    houseSlug: "paul-smith",
    season: "Archive",
    kind: "archive",
    firstview: "Paul Smith",
    wwd: "Paul Smith",
    note: "British tailoring with a twist — the signature stripe and a 2007 suit.",
  },
  "archive-yohji": {
    house: "Yohji Yamamoto",
    houseSlug: "yohji-yamamoto",
    season: "Archive · c. 1990",
    kind: "archive",
    firstview: "Yohji Yamamoto",
    archivePdf: "yohji-yamamoto",
    wwd: "Yohji Yamamoto",
    note: "Museum pieces from the master of black.",
  },
  "archive-margiela": {
    house: "Maison Margiela",
    houseSlug: "maison-margiela",
    season: "Archive · Winter 1997",
    kind: "archive",
    firstview: "Maison Martin Margiela",
    archivePdf: "maison-martin-margiela",
    wwd: "Maison Martin Margiela",
    note: "Martin Margiela's deconstruction, shown in exhibition.",
  },
  "archive-gaultier": {
    house: "Jean Paul Gaultier",
    houseSlug: "jean-paul-gaultier",
    season: "Archive · 1990s",
    kind: "archive",
    firstview: "Jean Paul Gaultier",
    wwd: "Jean Paul Gaultier",
    note: "Op-art tailoring and the famous dot catsuit, held by the RISD Museum.",
  },
};

/** Friendly words for each kind of look (used in captions and filters). */
export const KIND_LABEL: Record<LookKind, string> = {
  runway: "Runway",
  couture: "Couture",
  street: "Street style",
  archive: "Archive",
};

/** A show by key, with a safe fallback so a typo never crashes the UI. */
export function showOf(key: string | undefined): ShowDef {
  return (
    (key && SHOWS[key]) || {
      house: "Runway",
      houseSlug: "runway",
      season: "",
      kind: "runway",
    }
  );
}

/**
 * A house's display name and a short line about its shows — used as the option
 * wording for the "Whose runway?" question. e.g.
 *   houseInfo("max-mara") → { house: "Max Mara", seasons: "Fall 2019 Ready-to-Wear · Milan" }
 */
export function houseInfo(slug: string): { house: string; seasons: string } {
  const shows = Object.values(SHOWS).filter((s) => s.houseSlug === slug);
  // Designers that only appear in the live feed (Chanel, Prada…) aren't in SHOWS.
  if (shows.length === 0) return { house: HOUSES[slug]?.name ?? slug, seasons: "" };
  if (shows.length === 1) {
    const s = shows[0];
    return { house: s.house, seasons: [s.season, s.city].filter(Boolean).join(" · ") };
  }
  return { house: shows[0].house, seasons: `${shows.length} ${shows[0].kind === "street" ? "fashion weeks" : "collections"}` };
}

