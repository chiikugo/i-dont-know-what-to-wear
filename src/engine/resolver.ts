/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  engine/resolver.ts — "ask the catalog a question"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE DOES
 *  Everything the question flow needs to know about the catalog:
 *    • which pieces exist for a section/category,
 *    • which pieces are still possible after the user's answers,
 *    • which options to offer for the next question (and a photo for each),
 *    • which single piece to show as "the photo" right now.
 *
 *  IMPORTANT DESIGN CHOICE — "faceted narrowing"
 *  The options for a question are *discovered from the catalog*, not hard-coded.
 *  After the user picks "Baggy" for shirts, the next question ("which tone?")
 *  only offers tones that exist among baggy shirts. That guarantees:
 *    1. every option always has a real photo behind it, and
 *    2. the flow ends naturally when only one piece is left.
 *  This is exactly how filters on a shopping site work.
 *
 *  EVERYTHING HERE IS PURE: same inputs → same outputs, no React, no storage.
 *  That makes it easy to unit test (see resolver.test.ts) and easy to reason
 *  about.
 */

import { CATALOG } from "../data/catalog";
import { showOf } from "../data/shows";
import { CATEGORIES } from "../data/wardrobe";
import { TYPE_COPY, LENGTH_COPY } from "../data/wardrobe";
import type { Answers, CategoryId, FacetKey, Piece, Section, Slot, Tone } from "../data/types";
import { COLORS, FIT_ORDER, TONE_ORDER, VIBE_ORDER } from "../data/types";

// ── Basic lookups ───────────────────────────────────────────────────────────

/** id → piece, for quick lookups (e.g. restoring a saved draft). */
const BY_ID: Map<string, Piece> = new Map(CATALOG.map((p) => [p.id, p]));

/** Find a piece by its id. */
export function getPiece(id: string): Piece | undefined {
  return BY_ID.get(id);
}

/** The tone family of a piece (derived from its colour). */
export function toneOf(piece: Piece): Tone {
  return COLORS[piece.color].tone;
}

/** The slot a piece fills (derived from its category). */
export function slotOfPiece(piece: Piece): Slot {
  return CATEGORIES[piece.category].slot;
}

/** The house a piece walked for, as a slug ("michael-kors", "street-style"…). */
export function houseOf(piece: Piece): string {
  return showOf(piece.show).houseSlug;
}

/** Is this piece visible in the given section? (unisex shows in both) */
export function inSection(piece: Piece, section: Section): boolean {
  return piece.section === section || piece.section === "unisex";
}

// Pre-filtered lists, built once per (section) so we aren't re-filtering the
// whole catalog on every render.
const SECTION_CACHE = new Map<Section, Piece[]>();

/** Every piece visible in a section. */
export function piecesForSection(section: Section): Piece[] {
  let list = SECTION_CACHE.get(section);
  if (!list) {
    list = CATALOG.filter((p) => inSection(p, section));
    SECTION_CACHE.set(section, list);
  }
  return list;
}

/** Every piece in one category of a section. */
export function piecesIn(section: Section, category: CategoryId): Piece[] {
  return piecesForSection(section).filter((p) => p.category === category);
}

/** Every piece (in a section) that can fill a slot. */
export function piecesForSlot(section: Section, slot: Slot): Piece[] {
  return piecesForSection(section).filter((p) => slotOfPiece(p) === slot);
}

// ── Facets ──────────────────────────────────────────────────────────────────

/**
 * The value(s) of a facet for a piece.
 * (A piece has several vibes, so `vibe` returns a list; the rest return one.)
 */
export function facetValues(piece: Piece, key: FacetKey): string[] {
  switch (key) {
    case "fit":
      return [piece.fit];
    case "tone":
      return [toneOf(piece)];
    case "vibe":
      return piece.vibes;
    case "type":
      return piece.type ? [piece.type] : [];
    case "length":
      return piece.length ? [piece.length] : [];
    case "house":
      return [houseOf(piece)];
  }
}

/** Does a piece satisfy ALL of the answers given so far? */
export function matchesAnswers(piece: Piece, answers: Answers): boolean {
  for (const [key, value] of Object.entries(answers) as [FacetKey, string | undefined][]) {
    if (value === undefined) continue;
    if (!facetValues(piece, key).includes(value)) return false;
  }
  return true;
}

/** The pieces still possible in a category after the answers so far. */
export function narrow(section: Section, category: CategoryId, answers: Answers): Piece[] {
  return piecesIn(section, category).filter((p) => matchesAnswers(p, answers));
}

/**
 * The canonical display order for a facet's values. Values we do not know about
 * sort last, alphabetically — so adding a brand new `type` to the catalog
 * still works without touching this file.
 */
function orderOf(key: FacetKey, category: CategoryId): string[] {
  switch (key) {
    case "fit":
      return FIT_ORDER;
    case "tone":
      return TONE_ORDER;
    case "vibe":
      return VIBE_ORDER;
    case "length":
      return Object.keys(LENGTH_COPY);
    case "type":
      // Order types by how they appear in TYPE_COPY (which is grouped sensibly).
      // `category` is accepted so a future per-category order is a one-line change.
      void category;
      return Object.keys(TYPE_COPY);
    case "house":
      // No fixed order: houses sort alphabetically (see `facetOptions`).
      return [];
  }
}

/** A copy of `answers` with one facet removed. */
function without(answers: Answers, key: FacetKey): Answers {
  const copy: Answers = { ...answers };
  delete copy[key];
  return copy;
}

/** One selectable answer for a facet. */
export interface FacetOption {
  /** The raw value ("baggy", "earth", "denim"…). */
  value: string;
  /** How many pieces currently have that value (useful for "3 styles"). */
  count: number;
}

/**
 * The options to offer for `key`, given the answers so far.
 *
 * Note the subtle bit: we narrow by every answer EXCEPT `key` itself, so that
 * changing your mind about an earlier answer still shows the full set of
 * alternatives.
 */
export function facetOptions(
  section: Section,
  category: CategoryId,
  key: FacetKey,
  answers: Answers,
): FacetOption[] {
  const pool = narrow(section, category, without(answers, key));

  const counts = new Map<string, number>();
  for (const piece of pool) {
    for (const value of facetValues(piece, key)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }

  const order = orderOf(key, category);
  const rank = (v: string) => {
    const i = order.indexOf(v);
    return i === -1 ? order.length : i;
  };
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => rank(a.value) - rank(b.value) || a.value.localeCompare(b.value));
}

/** One step of the question flow: "ask this facet, here are the options". */
export interface Step {
  key: FacetKey;
  options: FacetOption[];
}

/**
 * Work out the NEXT question to ask for a category.
 *
 * @param handled facets already answered or skipped (so we don't re-ask them)
 * @returns the next step, or `null` when the chain is finished.
 *
 * A facet with only ONE possible answer is skipped silently: there is nothing
 * to choose between, so asking would just be noise.
 */
export function nextStep(
  section: Section,
  category: CategoryId,
  answers: Answers,
  handled: FacetKey[],
): Step | null {
  for (const key of CATEGORIES[category].chain) {
    if (handled.includes(key)) continue;
    const options = facetOptions(section, category, key, answers);
    if (options.length >= 2) return { key, options };
  }
  return null;
}

// ── Picking "the" photo ─────────────────────────────────────────────────────

/**
 * Choose one piece from a list, highest `score` first.
 * Ties break on id so the result is stable (no flicker between renders).
 *
 * @param score how much we want each piece (e.g. the taste model). Defaults to
 *              "no opinion", i.e. the first by id.
 */
export function pickBest(pieces: Piece[], score: (p: Piece) => number = () => 0): Piece | undefined {
  let best: Piece | undefined;
  let bestScore = -Infinity;
  for (const piece of pieces) {
    const s = score(piece);
    if (s > bestScore || (s === bestScore && best !== undefined && piece.id < best.id)) {
      best = piece;
      bestScore = s;
    }
  }
  return best;
}

/**
 * The single piece to show for a category + answers: the best one among those
 * that still match. (Falls back to the whole category if answers over-narrowed.)
 */
export function bestFor(
  section: Section,
  category: CategoryId,
  answers: Answers,
  score?: (p: Piece) => number,
): Piece | undefined {
  const matching = narrow(section, category, answers);
  return pickBest(matching.length ? matching : piecesIn(section, category), score);
}

/**
 * A representative swatch colour for each option value — taken from the actual
 * pieces behind it, so the swatch is honest about what you'll get.
 */
export function swatchesFor(
  section: Section,
  category: CategoryId,
  key: FacetKey,
  value: string,
  answers: Answers,
): string[] {
  const hexes: string[] = [];
  for (const piece of narrow(section, category, without(answers, key))) {
    if (!facetValues(piece, key).includes(value)) continue;
    const hex = COLORS[piece.color].hex;
    if (!hexes.includes(hex)) hexes.push(hex);
    if (hexes.length >= 4) break;
  }
  return hexes;
}
