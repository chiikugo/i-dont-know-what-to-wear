/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  engine/copy.ts — the "magazine caption" for a look
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE DOES
 *  Given a finished outfit, produce the words and facts that appear on the
 *  runway card:
 *      • a name            "Quiet Volume"
 *      • a silhouette      "Oversized over slim"
 *      • a colour palette  ivory · camel · black
 *      • the dominant mood "minimal"
 *      • styling notes     "Half-tuck the front to keep your waist visible."
 *      • a search phrase   "oversized white shirt wide-leg trousers loafers"
 *                          (used to build the Vogue/firstVIEW links)
 *
 *  It is all plain rules and word-lists — no AI service, no network. To change
 *  the voice of the app, edit the word-lists (ADJECTIVES, NOUNS) and the notes.
 *
 *  It accepts a "LookPiece" — the fields shared by catalog `Piece`s AND closet
 *  `PieceSnapshot`s — so it works for a live draft and for a saved outfit.
 */

import type { ColorName, Fit, Piece, Slot, Tone, Vibe } from "../data/types";
import { COLORS, FORMALITY_LABEL, SLOT_ORDER, VIBE_ORDER } from "../data/types";
import { seededPick, hashString } from "../lib/hash";

/** The subset of a piece we need to describe a look. */
export type LookPiece = Pick<
  Piece,
  "id" | "title" | "category" | "fit" | "color" | "vibes" | "formality" | "type" | "length"
>;

/** A set of pieces keyed by slot (some slots may be empty). */
export type LookPieces = Partial<Record<Slot, LookPiece>>;

/** Everything we say about a look. */
export interface LookFacts {
  name: string;
  silhouette: string;
  palette: { name: ColorName; label: string; hex: string }[];
  /** The mood that appears most across the pieces. */
  vibe: Vibe;
  /** All moods present, strongest first. */
  vibes: Vibe[];
  /** Average formality, rounded to 1–5. */
  formality: 1 | 2 | 3 | 4 | 5;
  formalityLabel: string;
  /** Up to three short styling tips. */
  notes: string[];
  /** A plain-language search phrase for outbound links. */
  query: string;
}

// ── Name generator ──────────────────────────────────────────────────────────

/** First word of the name, chosen by the dominant mood. TWEAK freely. */
const ADJECTIVES: Record<Vibe, string[]> = {
  minimal: ["Quiet", "Pared-Back", "Still"],
  classic: ["Tailored", "Heritage", "Polished"],
  relaxed: ["Easy", "Sunday", "Soft-Focus"],
  street: ["Concrete", "Late-Night", "Loud"],
  edgy: ["After-Dark", "Sharp", "Wired"],
  romantic: ["Velvet", "Golden-Hour", "Soft"],
  sporty: ["Open-Air", "Fast", "Court"],
};

/** Second word, chosen by the dominant colour family. */
const TONE_NOUNS: Record<Tone, string[]> = {
  light: ["Linen", "Daylight", "Ivory"],
  dark: ["Noir", "Midnight", "Hours"],
  earth: ["Terrain", "Clay", "Harvest"],
  bold: ["Signal", "Flare", "Pop"],
  denim: ["Indigo", "Workwear", "Wash"],
};

/** Alternative second words, chosen by silhouette. */
const SHAPE_NOUNS = { volume: ["Volume", "Drape"], line: ["Line", "Column"], easy: ["Ease", "Proportion"] };

// ── Silhouette ──────────────────────────────────────────────────────────────

/** Short human names for fits when combining. */
const FIT_WORD: Record<Fit, string> = { slim: "slim", regular: "straight", baggy: "oversized" };

/** Describe how the pieces relate in volume. */
export function silhouetteOf(pieces: LookPieces): string {
  const { onepiece, top, bottom, layer } = pieces;

  let base: string;
  if (onepiece) {
    base =
      onepiece.fit === "slim" ? "Fitted one-piece" : onepiece.fit === "baggy" ? "Flowing one-piece" : "Easy one-piece";
  } else if (top && bottom) {
    if (top.fit === bottom.fit) {
      base = top.fit === "slim" ? "One slim column" : top.fit === "baggy" ? "All volume" : "Easy straight line";
    } else {
      base = `${capitalise(FIT_WORD[top.fit])} over ${FIT_WORD[bottom.fit]}`;
    }
  } else {
    const only = top ?? bottom ?? layer;
    base = only ? `${capitalise(FIT_WORD[only.fit])} lines` : "Open silhouette";
  }

  if (layer && (onepiece || top || bottom)) {
    return `${base}, ${layer.fit === "baggy" ? "oversized" : layer.fit === "slim" ? "tailored" : "easy"} layer`;
  }
  return base;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── The main function ───────────────────────────────────────────────────────

/** Count how often each vibe occurs across the pieces. */
function rankVibes(pieces: LookPiece[]): Vibe[] {
  const counts = new Map<Vibe, number>();
  for (const piece of pieces) for (const v of piece.vibes) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || VIBE_ORDER.indexOf(a[0]) - VIBE_ORDER.indexOf(b[0]))
    .map(([v]) => v);
}

/** Describe a look. Pass a `seed` to vary the generated name. */
export function describeLook(pieces: LookPieces, seed = 0): LookFacts {
  const ordered: LookPiece[] = SLOT_ORDER.map((s) => pieces[s]).filter((p): p is LookPiece => !!p);

  // Mood
  const vibes = rankVibes(ordered);
  const vibe: Vibe = vibes[0] ?? "classic";

  // Palette (unique colours, in head-to-toe order)
  const palette: LookFacts["palette"] = [];
  for (const piece of ordered) {
    if (!palette.some((c) => c.name === piece.color)) {
      palette.push({ name: piece.color, label: COLORS[piece.color].label, hex: COLORS[piece.color].hex });
    }
  }

  // Formality (average)
  const avg = ordered.length ? ordered.reduce((s, p) => s + p.formality, 0) / ordered.length : 3;
  const formality = Math.min(5, Math.max(1, Math.round(avg))) as 1 | 2 | 3 | 4 | 5;

  // Name: adjective from the mood + noun from colour or shape.
  const key = ordered.map((p) => p.id).join("|") + `#${seed}`;
  const toneCounts = new Map<Tone, number>();
  for (const p of ordered) {
    const t = COLORS[p.color].tone;
    toneCounts.set(t, (toneCounts.get(t) ?? 0) + 1);
  }
  const topTone = [...toneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "light";
  const volume = ordered.filter((p) => p.fit === "baggy").length;
  const sleek = ordered.filter((p) => p.fit === "slim").length;
  const shape = volume > sleek ? SHAPE_NOUNS.volume : sleek > volume ? SHAPE_NOUNS.line : SHAPE_NOUNS.easy;
  const adjective = seededPick(ADJECTIVES[vibe], 0, key);
  const nounPool = hashString(key) % 2 === 0 ? TONE_NOUNS[topTone] : shape;
  // Never produce "Easy Ease": drop nouns that start like the adjective.
  const sameStem = (noun: string) => noun.slice(0, 3).toLowerCase() === adjective.slice(0, 3).toLowerCase();
  const nouns = nounPool.filter((n) => !sameStem(n));
  const name = `${adjective} ${seededPick(nouns.length ? nouns : TONE_NOUNS[topTone].filter((n) => !sameStem(n)), 1, key)}`;

  return {
    name,
    silhouette: silhouetteOf(pieces),
    palette,
    vibe,
    vibes,
    formality,
    formalityLabel: FORMALITY_LABEL[formality],
    notes: stylingNotes(pieces, palette),
    query: searchPhrase(pieces),
  };
}

// ── Styling notes ───────────────────────────────────────────────────────────

/**
 * Up to three practical tips, picked by simple conditions. Order = priority.
 * Each `if` is independent, so adding a tip is just adding another `if`.
 */
function stylingNotes(pieces: LookPieces, palette: LookFacts["palette"]): string[] {
  const notes: string[] = [];
  const { top, bottom, layer, shoes, onepiece } = pieces;
  const all = Object.values(pieces).filter((p): p is LookPiece => !!p);

  // Proportion
  if (top && bottom) {
    if (top.fit === "baggy" && bottom.fit === "slim") {
      notes.push("Half-tuck the front of the top to keep your waist visible.");
    } else if (top.fit === "slim" && bottom.fit === "baggy") {
      notes.push("Keep the top fitted and let the trousers move — that contrast is the look.");
    } else if (top.fit === "baggy" && bottom.fit === "baggy") {
      notes.push("Keep one hem sharp — a clean shoe or crisp cuff — so the volume reads intentional.");
    }
  }
  if (onepiece?.fit === "baggy") notes.push("Let the movement do the work; keep jewellery minimal.");

  // Colour
  const tones = all.map((p) => COLORS[p.color].tone);
  const bold = all.find((p) => COLORS[p.color].tone === "bold");
  if (bold) {
    notes.push(`Let the ${COLORS[bold.color].label} lead and keep everything else quiet.`);
  } else if (tones.length > 1 && tones.every((t) => t === "dark")) {
    notes.push("Mix textures — knit, leather, cotton — so the dark never goes flat.");
  } else if (tones.length > 1 && tones.every((t) => t === "light")) {
    notes.push("Light on light: anchor it with one darker detail in the shoes or bag.");
  } else if (palette.length >= 3 && tones.every((t) => t === "earth" || t === "light")) {
    notes.push("Stay in one warm family and let a single piece contrast.");
  }

  // Layers and shoes
  if (layer) notes.push("Wear the layer open so the piece underneath still shows.");
  if (shoes?.type === "sneakers" && all.some((p) => p.formality >= 4)) {
    notes.push("Clean white sneakers make dressed-up pieces feel current, not costume-y.");
  }
  if (shoes?.type === "boots") notes.push("Boots ground the proportions — leave a little ankle showing.");

  return notes.slice(0, 3);
}

// ── Search phrase ───────────────────────────────────────────────────────────

/** "oversized" / "slim" / "wide-leg" — the fit word that helps a search. */
function fitSearchWord(piece: LookPiece): string {
  if (piece.category === "pants") {
    return piece.fit === "baggy" ? "wide-leg" : piece.fit === "slim" ? "slim" : "straight";
  }
  if (piece.category === "skirts" || piece.category === "dresses") return piece.fit === "baggy" ? "flowy" : "";
  if (piece.category === "shoes" || piece.category === "accessories") return "";
  return piece.fit === "baggy" ? "oversized" : piece.fit === "slim" ? "fitted" : "";
}

/** The noun that names the garment in a search. */
function garmentNoun(piece: LookPiece): string {
  const type = piece.type;
  switch (piece.category) {
    case "shirts":
      return "shirt";
    case "tshirts":
      return "t-shirt";
    case "sweaters":
      return "knit sweater";
    case "hoodies":
      return "hoodie";
    case "jackets":
      return type === "denim" ? "denim jacket" : type === "leather" ? "leather jacket" : type === "bomber" ? "bomber jacket" : type ?? "jacket";
    case "pants":
      return type === "denim" ? "jeans" : type === "tailored" ? "trousers" : type === "cargo" ? "cargo pants" : type === "chino" ? "chinos" : "pants";
    case "skirts":
      return `${piece.length ?? ""} skirt`.trim();
    case "dresses":
      return `${piece.length ?? ""} dress`.trim();
    case "shoes":
      return type === "dress" ? "dress shoes" : type ?? "shoes";
    case "accessories":
      return type ?? "accessory";
  }
}

/**
 * Build a short search phrase like "oversized white shirt wide-leg trousers".
 * We keep to the body pieces + layer (shoes/accessories make searches too
 * narrow to return anything useful).
 */
export function searchPhrase(pieces: LookPieces): string {
  const parts: string[] = [];
  for (const slot of ["onepiece", "top", "bottom", "layer"] as Slot[]) {
    const piece = pieces[slot];
    if (!piece) continue;
    const colour = slot === "top" || slot === "onepiece" ? COLORS[piece.color].label : "";
    parts.push([fitSearchWord(piece), colour, garmentNoun(piece)].filter(Boolean).join(" "));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
