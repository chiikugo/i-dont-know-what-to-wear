/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  engine/compat.ts — "do these two pieces look good together?"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE DOES
 *  Given two pieces that would be worn at the same time, it returns a score
 *  (higher = better together) AND the human reasons behind it
 *  ("Volume balanced by a slim line"). The reasons are what the UI shows when
 *  it explains why it picked something — so it never feels like a black box.
 *
 *  HOW THE SCORING WORKS
 *  There is a short list of RULES. Each rule looks at the pair and either says
 *  nothing (`null`) or returns `{ score, text }`:
 *      score > 0   a point in favour    (e.g. +0.7  "Volume balanced…")
 *      score < 0   a point against      (e.g. −0.6  "Volume on volume…")
 *  The pair's total is the sum of every rule that fired. Typical totals sit
 *  between about −2 and +2.
 *
 *  The rules encode ordinary styling wisdom, in plain code:
 *    1. Dress codes should be within about one step of each other.
 *    2. Balance volume: baggy over slim (or the reverse) reads intentional.
 *    3. Colour: neutrals pair with anything; at most one statement colour.
 *    4. Shared mood helps.
 *    5. A few specific do-nots (hoodie under a blazer, heels with loungewear…).
 *    6. The runway knows best: two pieces a designer actually sent out
 *       TOGETHER (cut from the same runway photo) get a strong bonus; pieces
 *       from the same collection a smaller one.
 *
 *  HOW TO CHANGE IT
 *  - Make a rule matter more/less → change its `score` numbers.
 *  - Add a rule → write a small function and add it to RULES at the bottom.
 *  - Turn a rule off → delete it from RULES (or comment it out).
 *  After changing numbers, run `npm test` — the tests describe the behaviour the
 *  rules are expected to produce.
 */

import type { Piece, Slot } from "../data/types";
import { toneOf } from "./resolver";

/** One contribution to a pair's score, with a sentence explaining it. */
export interface Reason {
  score: number;
  text: string;
}

/** A rule inspects two pieces (and the slots they fill) and may return a Reason. */
type Rule = (a: Piece, slotA: Slot, b: Piece, slotB: Slot) => Reason | null;

// ── Small helpers ───────────────────────────────────────────────────────────

/** Slots that hold an actual garment (as opposed to shoes / accessories). */
const isGarment = (s: Slot) => s === "top" || s === "bottom" || s === "layer" || s === "onepiece";

/** Jaccard overlap of two sets: |A ∩ B| / |A ∪ B|, between 0 and 1. */
function jaccard<T>(a: T[], b: T[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/** Does either piece carry this vibe? */
const eitherHas = (a: Piece, b: Piece, vibe: Piece["vibes"][number]) =>
  a.vibes.includes(vibe) || b.vibes.includes(vibe);

// ── The rules ───────────────────────────────────────────────────────────────

/** 1 ─ Dress code: stay within about one notch. */
const formalityRule: Rule = (a, _sa, b) => {
  const d = Math.abs(a.formality - b.formality);
  if (d === 0) return { score: 0.5, text: "Same dress code" };
  if (d === 1) return { score: 0.3, text: "Dress codes sit well together" };
  if (d === 2) return { score: -0.5, text: "A little mismatched in formality" };
  return { score: -1.3, text: "Dress codes clash" };
};

/** 2a ─ Silhouette: balance volume between top and bottom (not layers). */
const silhouetteRule: Rule = (a, sa, b, sb) => {
  if (!isGarment(sa) || !isGarment(sb)) return null;
  if (sa === "layer" || sb === "layer") return null; // handled by layerFitRule
  const fits = [a.fit, b.fit];
  const has = (f: Piece["fit"]) => fits.includes(f);

  if (has("slim") && has("baggy")) return { score: 0.7, text: "Volume balanced by a slim line" };
  if (fits[0] === "baggy" && fits[1] === "baggy") {
    return eitherHas(a, b, "street")
      ? { score: 0.25, text: "Full-volume street proportions" }
      : { score: -0.6, text: "Volume on volume is hard to carry" };
  }
  if (fits[0] === "slim" && fits[1] === "slim") {
    return eitherHas(a, b, "minimal")
      ? { score: 0.3, text: "One clean, close line" }
      : { score: 0.15, text: "A clean, close line" };
  }
  return { score: 0.2, text: "Easy proportions" };
};

/** 2b ─ A layer has to fit over what is under it. */
const layerFitRule: Rule = (a, sa, b, sb) => {
  const layer = sa === "layer" ? a : sb === "layer" ? b : null;
  const under = sa === "layer" ? b : sb === "layer" ? a : null;
  const underSlot = sa === "layer" ? sb : sa;
  if (!layer || !under || (underSlot !== "top" && underSlot !== "onepiece")) return null;

  if (layer.fit === "slim" && under.fit === "baggy") {
    return { score: -0.9, text: "A fitted layer over a baggy top feels tight" };
  }
  if (layer.fit === "baggy" && under.fit === "slim") {
    return { score: 0.5, text: "An easy layer over a clean base" };
  }
  return null;
};

/** 3 ─ Colour: neutrals are friendly, statement colours are not. */
const colourRule: Rule = (a, _sa, b) => {
  const ta = toneOf(a);
  const tb = toneOf(b);

  if (a.color === b.color) {
    if (a.color === "print") {
      // Two prints: a matching set from one look is a statement; otherwise they fight.
      return a.look === b.look ? { score: 0.3, text: "A matching print set" } : { score: -0.9, text: "Two prints compete" };
    }
    return ta === "bold" ? { score: 0.25, text: "One bold colour, head to toe" } : { score: 0.2, text: "One colour, head to toe" };
  }

  if (ta === tb) {
    switch (ta) {
      case "light":
        return { score: 0.45, text: "Tonal and soft" };
      case "dark":
        return { score: 0.45, text: "Depth from dark on dark" };
      case "earth":
        return { score: 0.4, text: "Earth tones in harmony" };
      case "denim":
        return eitherHas(a, b, "street") || eitherHas(a, b, "edgy")
          ? { score: 0.2, text: "Double denim, on purpose" }
          : { score: -0.4, text: "Denim on denim needs intent" };
      case "bold":
        return { score: -0.9, text: "Two statement colours compete" };
    }
  }

  const pair = new Set([ta, tb]);
  if (pair.has("light") && pair.has("dark")) return { score: 0.55, text: "Light and dark contrast" };
  if (pair.has("earth") && pair.has("light")) return { score: 0.45, text: "Warm earth against light" };
  if (pair.has("earth") && pair.has("dark")) return { score: 0.25, text: "Earth tones grounded by dark" };
  if (pair.has("denim")) return { score: 0.4, text: "Denim anchors the palette" };
  if (pair.has("bold")) {
    return pair.has("earth")
      ? { score: 0.05, text: "A pop of colour against earth" }
      : { score: 0.35, text: "One colour pop, kept simple" };
  }
  return null;
};

/** 4 ─ Mood: pieces that share a vibe look like they belong together. */
const moodRule: Rule = (a, _sa, b) => {
  const j = jaccard(a.vibes, b.vibes);
  if (j === 0) return { score: -0.1, text: "Two different moods" };
  return { score: 0.9 * j, text: j >= 0.5 ? "Same mood" : "A shared mood" };
};

/** 5 ─ A handful of specific do-nots and do-dos. */
const specialRule: Rule = (a, sa, b, sb) => {
  const pair = [
    { piece: a, slot: sa },
    { piece: b, slot: sb },
  ];
  const find = (pred: (p: Piece, s: Slot) => boolean) => pair.find((x) => pred(x.piece, x.slot));
  const other = (x: { piece: Piece }) => pair.find((y) => y.piece !== x.piece)!;

  // A hoodie fights tailoring.
  const hoodie = find((p) => p.category === "hoodies");
  if (hoodie) {
    const o = other(hoodie);
    if (o.slot === "layer" && (o.piece.type === "blazer" || (o.piece.type === "coat" && o.piece.formality >= 4))) {
      return { score: -1, text: "A hoodie under tailoring fights itself" };
    }
  }

  // Shoes vs. the dress code of the piece they sit under.
  const shoe = find((_p, s) => s === "shoes");
  if (shoe) {
    const o = other(shoe);
    if (shoe.piece.type === "sneakers" && o.piece.formality === 5) {
      return { score: -0.5, text: "Sneakers undercut black-tie" };
    }
    if (shoe.piece.type === "heels" && o.piece.formality === 1) {
      return { score: -0.5, text: "Heels over loungewear" };
    }
  }

  // Accessories.
  const acc = find((_p, s) => s === "accessory");
  if (acc) {
    const o = other(acc);
    const type = acc.piece.type;
    if (type === "hat" && /beanie/i.test(acc.piece.title) && o.piece.formality >= 4) {
      return { score: -0.8, text: "A beanie muddles a dressed-up look" };
    }
    if (type === "bag" && o.piece.formality >= 3) {
      return { score: 0.2, text: "A good bag finishes the look" };
    }
  }

  // Sport sandals under tailoring.
  if (shoe && shoe.piece.type === "sandals" && other(shoe).piece.formality >= 4) {
    return { score: -0.5, text: "Sport sandals undercut tailoring" };
  }
  return null;
};

/** 6 ─ The runway: what a designer sent out together, belongs together. */
const runwayRule: Rule = (a, _sa, b) => {
  if (a.look && a.look === b.look) return { score: 0.9, text: "Styled together on the runway" };
  if (a.show && a.show === b.show) return { score: 0.3, text: "From the same collection" };
  return null;
};

/** The active rule list — edit this to add / remove rules. */
const RULES: Rule[] = [formalityRule, silhouetteRule, layerFitRule, colourRule, moodRule, specialRule, runwayRule];

// ── Putting it together ─────────────────────────────────────────────────────

/** All reasons (positive and negative) for a pair. */
export function pairReasons(a: Piece, slotA: Slot, b: Piece, slotB: Slot): Reason[] {
  const out: Reason[] = [];
  for (const rule of RULES) {
    const r = rule(a, slotA, b, slotB);
    if (r) out.push(r);
  }
  return out;
}

/** Sum of all reasons: how well the two pieces go together. */
export function pairScore(a: Piece, slotA: Slot, b: Piece, slotB: Slot): number {
  return pairReasons(a, slotA, b, slotB).reduce((sum, r) => sum + r.score, 0);
}

/**
 * How much a pair "matters" to the overall look.
 * Top+bottom is the foundation (1.0); an accessory barely moves the needle.
 * TWEAK these to make the engine care more or less about certain pairings.
 */
export function pairWeight(a: Slot, b: Slot): number {
  const has = (s: Slot) => a === s || b === s;
  if (has("accessory")) return 0.35;
  if (has("top") && has("bottom")) return 1.0;
  if (has("layer") && (has("top") || has("onepiece"))) return 0.9;
  if (has("layer") && has("bottom")) return 0.6;
  if (has("shoes") && (has("top") || has("bottom") || has("onepiece"))) return 0.7;
  if (has("shoes") && has("layer")) return 0.45;
  return 0.5;
}
