/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  model/features.ts — turning a garment into things a model can learn about
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHY FEATURES?
 *  A taste model can't learn "this exact photo". It learns about the *qualities*
 *  that photos share. So every piece is described by a short list of
 *  "feature strings":
 *
 *      a baggy olive cargo pant, mood "street", formality 1
 *        → ["cat:pants", "fit:baggy", "tone:earth", "color:olive",
 *           "vibe:street", "dress:casual", "type:cargo", "fitcat:baggy:pants"]
 *
 *  If you tap three baggy things, "fit:baggy" gains weight — and EVERY baggy
 *  piece, including ones you've never seen, scores higher next time.
 *
 *  `fitcat` is a *cross* feature. It lets the model learn that you like baggy
 *  PANTS but slim SHIRTS, which a plain "fit:baggy" could not express.
 *
 *  Because every piece now comes from a real runway look, two more features
 *  describe WHERE it came from:
 *      house:max-mara      → Muse learns which designers you keep choosing
 *      kind:street         → …and whether you lean toward street style,
 *                            couture or archive pieces. (Plain runway looks are
 *                            the default — most of the catalog — so they get no
 *                            `kind:` feature; "you like runway looks" would
 *                            tell you nothing.)
 *  These are what power "Because you like Max Mara" on the home page.
 *
 *  You can add new feature kinds here (e.g. "season:winter") — just keep the
 *  "kind:value" shape, and add a human label in `featureLabel` so explanations
 *  read well.
 */

import { houseInfo, showOf } from "../data/shows";
import { CATEGORIES } from "../data/wardrobe";
import type { CategoryId, FacetKey, Fit, LookKind, Piece, Tone, Vibe } from "../data/types";
import { COLORS, VIBES } from "../data/types";

/** The fields of a piece that features are computed from. */
export type FeaturePiece = Pick<Piece, "category" | "fit" | "color" | "vibes" | "formality" | "type" | "length"> & {
  /** The show it walked in (absent for outfits saved before the runway catalog). */
  show?: string;
};

/** Bucket the 1–5 formality scale into three understandable levels. */
function dressBucket(formality: number): "casual" | "smart" | "dressy" {
  return formality <= 2 ? "casual" : formality === 3 ? "smart" : "dressy";
}

/** All feature strings for a piece. */
export function featuresOf(piece: FeaturePiece): string[] {
  const features = [
    `cat:${piece.category}`,
    `fit:${piece.fit}`,
    `tone:${COLORS[piece.color].tone}`,
    `color:${piece.color}`,
    `dress:${dressBucket(piece.formality)}`,
    `fitcat:${piece.fit}:${piece.category}`,
    ...piece.vibes.map((v) => `vibe:${v}`),
  ];
  if (piece.type) features.push(`type:${piece.type}`);
  if (piece.length) features.push(`length:${piece.length}`);
  if (piece.show) {
    const show = showOf(piece.show);
    features.push(`house:${show.houseSlug}`);
    if (show.kind !== "runway") features.push(`kind:${show.kind}`);
  }
  return features;
}

/**
 * Features for a single *answer* ("I picked Baggy for Pants"). Smaller than a
 * whole piece because the user only told us about one quality.
 */
export function optionFeatures(key: FacetKey, value: string, category: CategoryId): string[] {
  switch (key) {
    case "fit":
      return [`fit:${value}`, `fitcat:${value}:${category}`];
    case "tone":
      return [`tone:${value}`];
    case "vibe":
      return [`vibe:${value}`];
    case "type":
      return [`type:${value}`, `cat:${category}`];
    case "length":
      return [`length:${value}`, `cat:${category}`];
    case "house":
      return [`house:${value}`];
  }
}

// ── Human wording for explanations ──────────────────────────────────────────

// (No commas inside these: they get strung together into sentences.)
const FIT_WORDS: Record<Fit, string> = {
  slim: "slim, fitted cuts",
  regular: "straight, classic cuts",
  baggy: "baggy, oversized fits",
};

const TONE_WORDS: Record<Tone, string> = {
  light: "light, airy tones",
  dark: "dark, sharp tones",
  earth: "earthy tones",
  bold: "bold colour",
  denim: "denim blues",
};

/**
 * A short phrase for a feature, e.g. "baggy, oversized fits".
 * It finishes the sentence "because you like …".
 */
export function featureLabel(feature: string): string {
  const [kind, a, b] = feature.split(":");
  switch (kind) {
    case "cat":
      return CATEGORIES[a as CategoryId]?.label.toLowerCase() ?? a;
    case "fit":
      return FIT_WORDS[a as Fit] ?? a;
    case "tone":
      return TONE_WORDS[a as Tone] ?? a;
    case "color":
      return COLORS[a as keyof typeof COLORS]?.label ?? a;
    case "vibe":
      return `${(VIBES[a as Vibe]?.label ?? a).toLowerCase()} style`;
    case "dress":
      return a === "casual" ? "casual dressing" : a === "smart" ? "smart-casual looks" : "dressed-up looks";
    case "type":
      return a;
    case "length":
      return `${a} lengths`;
    case "fitcat": {
      const fit = a === "baggy" ? "baggy" : a === "slim" ? "slim" : "straight";
      return `${fit} ${CATEGORIES[b as CategoryId]?.label.toLowerCase() ?? b}`;
    }
    case "house":
      // "Max Mara" (a proper name — keep its capitals).
      return houseInfo(a).house;
    case "kind":
      return KIND_WORDS[a as LookKind] ?? a;
    default:
      return feature;
  }
}

const KIND_WORDS: Record<LookKind, string> = {
  runway: "runway looks",
  couture: "couture",
  street: "street style",
  archive: "archive pieces",
};
