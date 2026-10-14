/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  live/inspire.ts — "Build a look inspired by this"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A live look is just a picture and a caption — the outfit builder can't
 *  dress you in it directly (it needs garments tagged by fit, colour, slot…).
 *  This bridges the two: it finds the catalog garment that best echoes the live
 *  look, and the builder takes it from there.
 *
 *  HOW A GARMENT IS CHOSEN (highest score wins)
 *      +3    same designer (e.g. an Alexander McQueen story → a McQueen piece)
 *      +1    for each colour the caption mentions that the piece has
 *      +0.5  same colour family (tone)
 *      +0.8  for each mood in common
 *      + 0.3 × Muse's opinion of the piece (your taste breaks ties)
 *  Only real garments compete (not shoes or accessories) — a look is built
 *  AROUND what you start from.
 */

import { CATALOG } from "../data/catalog";
import { houseInfo } from "../data/shows";
import type { Piece, Section } from "../data/types";
import { COLORS } from "../data/types";
import { houseOf, inSection } from "../engine/resolver";
import type { LiveItem } from "./feedCore";
import { liveColours, liveHouses, liveVibes } from "./tags";

export interface Inspiration {
  piece: Piece;
  /** One line explaining the match, e.g. "Same house: Alexander McQueen". */
  reason: string;
}

/** The catalog garment that best matches a live look, for a section. */
export function inspiredPiece(item: LiveItem, section: Section, score: (p: Piece) => number = () => 0): Inspiration | null {
  const houses = new Set(liveHouses(item));
  const colours = liveColours(item);
  const tones = new Set(colours.map((c) => COLORS[c].tone));
  const vibes = new Set(liveVibes(item));

  let best: { piece: Piece; total: number; why: string } | null = null;
  for (const piece of CATALOG) {
    if (!inSection(piece, section) || piece.category === "shoes" || piece.category === "accessories") continue;
    let total = 0.3 * score(piece);
    let why = "";
    if (houses.has(houseOf(piece))) {
      total += 3;
      why = `Same house: ${houseInfo(houseOf(piece)).house}`;
    }
    if (colours.includes(piece.color)) {
      total += 1;
      why ||= `Same colour: ${COLORS[piece.color].label}`;
    } else if (tones.has(COLORS[piece.color].tone)) {
      total += 0.5;
    }
    const shared = piece.vibes.filter((v) => vibes.has(v));
    total += 0.8 * shared.length;
    if (!why && shared.length) why = `Same mood: ${shared[0]}`;
    if (!best || total > best.total || (total === best.total && piece.id < best.piece.id)) best = { piece, total, why };
  }
  return best ? { piece: best.piece, reason: best.why || "Picked to suit your taste" } : null;
}
