/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  model/recommend.ts — building the personalised home screen
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE DOES
 *  Turns "the model's opinion about every piece" into the ORDER of things on
 *  the endless home feed (components/feed/Feed.tsx):
 *
 *      rankLooks     whole runway LOOKS (photos), ranked by how much you'd
 *                    like the pieces in them — each with a plain-English reason
 *      rankPieces    every garment, best first, spread out so one show or
 *                    photo never crowds the wall
 *      headlineFor   the one-line read on you at the top of the home page
 *
 *  Each reason ("Because you like baggy, oversized fits") is generated from
 *  the model's own score breakdown — there is no hand-written explanation.
 *
 *  It is pure: give it a model state, get an order back. The feed re-calls it
 *  whenever your taste changes, which is why the home page visibly adapts.
 */

import { LOOKS, type Look } from "../data/catalog";
import type { Piece, Section, Vibe } from "../data/types";
import { piecesForSection } from "../engine/resolver";
import { featureLabel, featuresOf } from "./features";
import type { CrowdPrior, TasteState } from "./tasteModel";
import { explain, rankScore, taste, topFeatures } from "./tasteModel";

// ── Types ───────────────────────────────────────────────────────────────────

/** One recommended piece plus the "why". */
export interface RecItem {
  piece: Piece;
  /** The sentence shown on the card. */
  reason: string;
  /** The score it was ranked by (useful for debugging / tests). */
  score: number;
}

/** One recommended runway look (a whole photo) plus the "why". */
export interface LookRec {
  look: Look;
  reason: string;
  score: number;
}

export interface FeedArgs {
  section: Section;
  state: TasteState;
  crowd: CrowdPrior | null;
  /** Piece ids the user said "not for me" to. */
  dismissed: ReadonlySet<string>;
  /** When set, only pieces with this mood are shown. */
  vibe?: Vibe | null;
  /** How many to return (rankLooks only; default 10). */
  limit?: number;
  /** Most looks from one show (rankLooks only; default 2 — the endless feed allows more). */
  perShow?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Up to three candidate sentences explaining a recommendation, best first,
 * built from the model's own score breakdown (model/tasteModel.ts → explain).
 */
function reasonCandidates(piece: Piece, state: TasteState, crowd: CrowdPrior | null): string[] {
  return explain(state, featuresOf(piece), crowd)
    // Only positive reasons, and only ones that read well in a sentence.
    .filter((c) => c.amount > 0.01 && !/^(dress|color|fitcat):/.test(c.feature))
    .slice(0, 3)
    .map((c) => {
      const label = featureLabel(c.feature);
      switch (c.source) {
        case "you":
          return `Because you like ${label}`;
        case "community":
          return `Popular with the community: ${label}`;
        case "editor":
          return `Editor's pick: ${label}`;
      }
    });
}

/** "Leaning baggy fits, minimal style & earthy tones" — or an invitation. */
export function headlineFor(state: TasteState): string {
  if (state.picks < 3) {
    return "Tap a mood or start with a piece — I'll learn your taste as you go.";
  }
  const { likes } = topFeatures(state, 8);
  // Skip very specific features so the headline stays readable.
  const readable = likes
    .map(([f]) => f)
    .filter((f) => /^(fit|vibe|tone|house):/.test(f))
    .slice(0, 3)
    .map(featureLabel);
  if (readable.length === 0) return "Still learning — keep picking and I'll sharpen up.";
  const last = readable.pop()!;
  const list = readable.length ? `${readable.join("; ")} and ${last}` : last;
  return `Leaning toward ${list}.`;
}

// ── The feed ────────────────────────────────────────────────────────────────

/**
 * Whole runway looks for the home feed, best first.
 * A look's score = the average taste score of its garments (accessories left
 * out — a bag shouldn't decide whether you like an outfit). At most two looks
 * per show, so one collection can't fill the wall (the feed passes a higher `perShow`).
 */
export function rankLooks(args: FeedArgs): LookRec[] {
  const { section, state, crowd, dismissed, vibe = null, limit = 10, perShow = 2 } = args;
  const candidates = LOOKS.filter(
    (l) =>
      (l.section === section || l.section === "unisex") &&
      (!vibe || l.vibes.includes(vibe)) &&
      !l.pieces.every((p) => dismissed.has(p.id)),
  );
  const scored = candidates
    .map((look) => {
      const garments = look.pieces.filter((p) => p.category !== "accessories");
      const counted = garments.length ? garments : look.pieces;
      const score = counted.reduce((sum, p) => sum + rankScore(state, featuresOf(p), crowd, 0.2), 0) / counted.length;
      // The garment you'd like most (one pass — no sorting needed for a maximum).
      let best = counted[0];
      let bestTaste = -Infinity;
      for (const p of counted) {
        const t = taste(state, featuresOf(p), crowd);
        if (t > bestTaste) [best, bestTaste] = [p, t];
      }
      return { look, score, best };
    })
    .sort((a, b) => b.score - a.score);

  const shown = new Map<string, number>();
  const out: { look: Look; score: number; best: Piece }[] = [];
  for (const item of scored) {
    const n = shown.get(item.look.show) ?? 0;
    if (n >= perShow) continue;
    shown.set(item.look.show, n + 1);
    out.push(item);
    if (out.length >= limit) break;
  }

  // Reasons: borrow the best garment's explanation, varied across the feed.
  const used = new Set<string>();
  return out.map(({ look, score, best }) => {
    const options = reasonCandidates(best, state, crowd);
    const reason = options.find((o) => !used.has(o)) ?? options[0] ?? "Straight from the runway";
    used.add(reason);
    return { look, score, reason };
  });
}

/**
 * Every garment, best first, for the endless home feed (feed/posts.ts deals
 * them out between live posts and runway looks). Accessories are left out (a
 * belt is a weak place to start a look), and the order is spread so the same
 * show never comes up twice in a row and no photo appears twice.
 */
export function rankPieces(args: FeedArgs): RecItem[] {
  const { section, state, crowd, dismissed, vibe = null } = args;
  const scored = piecesForSection(section)
    .filter((p) => p.category !== "accessories" && !dismissed.has(p.id) && (!vibe || p.vibes.includes(vibe)))
    .map((piece) => ({ piece, score: rankScore(state, featuresOf(piece), crowd, 0.3), reason: "" }))
    .sort((a, b) => b.score - a.score || a.piece.id.localeCompare(b.piece.id));

  const out: RecItem[] = [];
  const looks = new Set<string>();
  const queue = [...scored];
  while (queue.length) {
    const recentShows = out.slice(-3).map((r) => r.piece.show);
    let index = queue.findIndex((r) => !looks.has(r.piece.look) && !recentShows.includes(r.piece.show));
    if (index === -1) index = queue.findIndex((r) => !looks.has(r.piece.look));
    if (index === -1) break; // only repeats of used photos are left
    const [next] = queue.splice(index, 1);
    looks.add(next.piece.look);
    out.push(next);
  }
  return out;
}
