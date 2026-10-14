/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  engine/composer.ts — build a whole outfit from one (or more) known pieces
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  THE BIG IDEA  ("I can build an outfit from only knowing one piece")
 *  Give the composer whatever the user has decided so far — often just ONE
 *  piece — and it fills in every other slot, one slot at a time:
 *
 *      1. Decide which slots are still needed (body → shoes → layer → accessory).
 *      2. For each empty slot, score every candidate piece against everything
 *         already chosen using the rules in compat.ts.
 *      3. Add the taste model's opinion ("this person tends to like X").
 *      4. Add a small repeatable wobble so Shuffle can give a different answer.
 *      5. Keep the highest scorer. Move to the next slot — and now it has one
 *         more piece to be compatible with.
 *
 *  This is a "greedy" algorithm: it doesn't try every possible outfit (there
 *  are millions) — it builds one sensible slot at a time. That is fast and
 *  produces good-looking results.
 *
 *  RUNWAY-AWARE
 *  Every piece comes from a real runway look, and compat.ts rewards pieces that
 *  walked together ("Styled together on the runway"). So start from a coat and
 *  the composer tends to rebuild the outfit the designer sent out — while still
 *  free to mix in pieces from other shows. If the starting piece's look was
 *  built around a dress, the composer reaches for a dress too.
 *
 *  INPUTS THAT MATTER
 *  - fixed   : pieces the user has chosen or LOCKED — never changed.
 *  - omitted : slots the user removed (e.g. "no accessory").
 *  - taste   : function(piece) → how much this user likes it (from the model).
 *  - seed    : bump it to re-roll the "wobble" (the Shuffle button).
 */

import { LOOKS } from "../data/catalog";
import type { Piece, Section, Slot } from "../data/types";
import { seededUnit } from "../lib/hash";
import { pairReasons, pairWeight } from "./compat";
import { piecesForSlot } from "./resolver";

/** Everything the composer needs. */
export interface ComposeInput {
  section: Section;
  /** Pieces that must stay exactly as they are. */
  fixed: Partial<Record<Slot, Piece>>;
  /** Slots the user has switched off. */
  omitted?: Slot[];
  /** The user's taste: higher = liked more. Defaults to "no opinion". */
  taste?: (piece: Piece) => number;
  /** How much taste counts relative to the styling rules (0 = ignore). */
  tasteWeight?: number;
  /** 0 = the single best look. Any other number = a different good look (Shuffle). */
  seed?: number;
}

/** What the composer returns. */
export interface ComposeResult {
  /** The complete look: fixed pieces + newly chosen ones. */
  pieces: Partial<Record<Slot, Piece>>;
  /** For each newly chosen slot, up to two short reasons it was picked. */
  why: Partial<Record<Slot, string[]>>;
}

/**
 * SHUFFLE SETTINGS.
 * With seed 0 the composer always takes the single best-scoring candidate.
 * With any other seed it instead *samples* among the best few, favouring
 * higher scores (like rolling a weighted die). So Shuffle gives a different —
 * but still good — outfit each time.
 *   SHUFFLE_POOL        how many top candidates are in the running
 *   SHUFFLE_TEMPERATURE higher = more adventurous, lower = sticks to the best
 */
const SHUFFLE_POOL = 4;
const SHUFFLE_TEMPERATURE = 0.6;

/** Runway looks whose outfit is built around a dress or jumpsuit. */
const DRESS_LOOKS = new Set(LOOKS.filter((l) => l.pieces.some((p) => p.category === "dresses")).map((l) => l.id));

/** One candidate with its final score. */
interface Scored {
  piece: Piece;
  total: number;
  reasons: string[];
}

/** Weighted pick among the top candidates, repeatable for a given seed. */
function sampleTop(scored: Scored[], seed: number, slot: Slot): Scored {
  const pool = scored.slice(0, SHUFFLE_POOL);
  const best = pool[0].total;
  const weights = pool.map((s) => Math.exp((s.total - best) / SHUFFLE_TEMPERATURE));
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = seededUnit(seed, `pick:${slot}`) * sum;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[0];
}

/**
 * Score one candidate for one slot against the pieces already in the look.
 * Returns the number plus the reasons that contributed most.
 */
export function scoreCandidate(
  candidate: Piece,
  slot: Slot,
  chosen: Partial<Record<Slot, Piece>>,
): { score: number; reasons: string[] } {
  let score = 0;
  const weighted: { w: number; text: string }[] = [];

  for (const [otherSlot, other] of Object.entries(chosen) as [Slot, Piece | undefined][]) {
    if (!other || otherSlot === slot) continue;
    const weight = pairWeight(slot, otherSlot);
    for (const reason of pairReasons(candidate, slot, other, otherSlot)) {
      score += reason.score * weight;
      if (reason.score > 0) weighted.push({ w: reason.score * weight, text: reason.text });
    }
  }

  // Strongest reasons first, no duplicates (several pairs can share a sentence).
  const reasons: string[] = [];
  for (const r of weighted.sort((a, b) => b.w - a.w)) {
    if (!reasons.includes(r.text)) reasons.push(r.text);
    if (reasons.length >= 2) break;
  }
  return { score, reasons };
}

/** Compose a full look. See the file header for the algorithm. */
export function composeLook(input: ComposeInput): ComposeResult {
  const { section, fixed, omitted = [], taste = () => 0, tasteWeight = 0.6, seed = 0 } = input;

  const pieces: Partial<Record<Slot, Piece>> = { ...fixed };
  const why: Partial<Record<Slot, string[]>> = {};
  const used = new Set(Object.values(pieces).map((p) => p!.id));

  // Which "body" slots do we need? Either a one-piece (dress) OR top + bottom.
  const order: Slot[] = [];
  if (pieces.onepiece) {
    // A dress is already chosen: nothing else covers the body.
  } else if (pieces.top || pieces.bottom) {
    // At least half of a separates outfit is chosen.
    if (!pieces.top) order.push("top");
    if (!pieces.bottom) order.push("bottom");
  } else {
    // Nothing for the body yet. If a chosen piece walked in a look built around a
    // dress, follow the runway (most of the time); otherwise reach for a dress
    // only occasionally. Either way it varies with the Shuffle seed.
    const fromDressLook = Object.values(pieces).some((p) => p && DRESS_LOOKS.has(p.look));
    const wantDress = fromDressLook ? seed % 3 !== 2 : seed % 3 === 1;
    if (section === "womenswear" && wantDress && !omitted.includes("onepiece")) order.push("onepiece");
    else order.push("top", "bottom");
  }
  order.push("shoes", "layer", "accessory");

  for (const slot of order) {
    if (pieces[slot] || omitted.includes(slot)) continue;

    // Score every unused candidate for this slot against what's chosen so far.
    const scored: Scored[] = piecesForSlot(section, slot)
      .filter((p) => !used.has(p.id))
      .map((piece) => {
        const { score, reasons } = scoreCandidate(piece, slot, pieces);
        return { piece, reasons, total: score + tasteWeight * taste(piece) };
      })
      // Best first; ties broken by id so the order never flickers.
      .sort((a, b) => b.total - a.total || a.piece.id.localeCompare(b.piece.id));

    if (scored.length === 0) continue;
    const choice = seed === 0 ? scored[0] : sampleTop(scored, seed, slot);

    pieces[slot] = choice.piece;
    used.add(choice.piece.id);
    if (choice.reasons.length) why[slot] = choice.reasons;
  }

  return { pieces, why };
}

/**
 * Rank swap candidates for one slot against the REST of the current look.
 * Used by the "Swap" button: the first item is the best alternative.
 *
 * @param current the look as it is now (the slot being swapped is ignored)
 */
export function rankAlternatives(
  section: Section,
  slot: Slot,
  current: Partial<Record<Slot, Piece>>,
  taste: (piece: Piece) => number = () => 0,
  tasteWeight = 0.6,
): { piece: Piece; reasons: string[] }[] {
  const usedIds = new Set(Object.values(current).map((p) => p!.id));
  return piecesForSlot(section, slot)
    .filter((p) => !usedIds.has(p.id))
    .map((piece) => {
      const { score, reasons } = scoreCandidate(piece, slot, current);
      return { piece, reasons, total: score + tasteWeight * taste(piece) };
    })
    .sort((a, b) => b.total - a.total || a.piece.id.localeCompare(b.piece.id))
    .map(({ piece, reasons }) => ({ piece, reasons }));
}
