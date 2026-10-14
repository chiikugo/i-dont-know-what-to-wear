/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  state/draft.ts — the outfit-in-progress, as plain data + pure functions
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT A "DRAFT" IS
 *  Everything about the outfit the user is currently building:
 *
 *      Draft
 *       ├─ section      menswear | womenswear
 *       ├─ slots        one entry per slot that has a piece (top, shoes…)
 *       │    └─ DraftSlot  { category, pieceId, answers, locked, origin … }
 *       ├─ omitted      slots the user switched off ("no accessory")
 *       ├─ seed         bump to Shuffle
 *       ├─ focus        which slot is being refined right now (or null)
 *       ├─ anchor       the slot the user started from
 *       └─ origin       the post the look started from (a runway look, a live
 *                       post from Vogue/Pinterest…, or one garment) — shown as
 *                       the top card of the stack on the look board
 *
 *  THE TWO KINDS OF PIECE IN A DRAFT
 *    USER-DECIDED (locked)  the anchor, anything the user finished refining,
 *                           anything they pinned. The engine never touches it.
 *    ENGINE-PICKED          everything else. Whenever a user-decided piece
 *                           changes, the engine re-picks these so the whole
 *                           look stays coherent. (That's how an outfit grows
 *                           out of "only knowing one piece".)
 *
 *  WHY PURE FUNCTIONS?
 *  Every function here takes a draft and returns a NEW draft, never editing the
 *  old one. React likes that (it can tell something changed), tests like it
 *  (no mocks needed), and it makes the flow easy to read top to bottom.
 *  The React side (AppContext.tsx) is only glue around these.
 *
 *  THE LIFE OF A DRAFT
 *      startFromCategory("shirts")   → focus the Top slot, ask questions
 *      answer("fit","baggy") …       → narrows which piece is previewed
 *      commit()                      → lock the previewed piece, engine fills
 *                                      the other slots, focus = null (Board)
 *      focusSlot("bottom")           → refine another slot the same way
 *      swapSlot / shuffle / lock …   → tweak on the Board
 *      replaceSlot / omitSlot / fillSlot → "Change", "Delete" and "Add" on a card
 */

import { getLook } from "../data/catalog";
import { CATEGORIES, slotOf } from "../data/wardrobe";
import type { Answers, CategoryId, FacetKey, Piece, Section, Slot } from "../data/types";
import { composeLook, rankAlternatives } from "../engine/composer";
import { bestFor, facetValues, getPiece, nextStep, type Step } from "../engine/resolver";

// ── Types ───────────────────────────────────────────────────────────────────

/** What we know about ONE slot of the outfit. */
export interface DraftSlot {
  /** Which category the piece in this slot belongs to. */
  category: CategoryId;
  /** The committed piece ("" while the question flow is still previewing). */
  pieceId: string;
  /** The user's answers while refining this slot. */
  answers: Answers;
  /** Facets already answered or skipped (so the flow doesn't re-ask). */
  handled: FacetKey[];
  /** Locked pieces are never changed by the engine. */
  locked: boolean;
  /** Who chose it: the user, or the engine. (Shown as a badge on the board.) */
  origin: "user" | "engine";
  /** Pieces the user swapped away from — never offered again for this slot. */
  rejected: string[];
}

/**
 * The few facts about a live post (Vogue, Pinterest, YouTube, a museum…) needed
 * to show it as the top card of the stack. Only text and addresses — the
 * picture itself always loads from the publisher.
 */
export interface LiveCover {
  id: string;
  title: string;
  /** Picture address on the publisher's server. */
  image: string;
  imageLarge?: string;
  /** Link to the original post. */
  url: string;
  sourceName: string;
  /** runway / street / show / pinterest / archive / editorial */
  kind: string;
  /** YouTube video id (show films play on the card). */
  video?: string;
  credit?: string;
}

/** Where a look started. Shown as the top card of the stack on the look board. */
export type DraftOrigin =
  | { kind: "look"; lookId: string }
  | { kind: "piece"; pieceId: string }
  | { kind: "live"; item: LiveCover; reason?: string };

/** The whole outfit-in-progress. */
export interface Draft {
  version: 1;
  section: Section;
  slots: Partial<Record<Slot, DraftSlot>>;
  omitted: Slot[];
  seed: number;
  focus: Slot | null;
  anchor: Slot | null;
  /** The post this look started from (absent when started from a category). */
  origin?: DraftOrigin;
}

/** "How much do we like this piece?" — supplied by the taste model. */
export type TasteFn = (piece: Piece) => number;

const NO_TASTE: TasteFn = () => 0;

// ── Reading a draft ─────────────────────────────────────────────────────────

/** A brand-new, empty draft. */
export function newDraft(section: Section): Draft {
  return { version: 1, section, slots: {}, omitted: [], seed: 0, focus: null, anchor: null };
}

/** The committed catalog pieces, by slot. */
export function draftPieces(draft: Draft): Partial<Record<Slot, Piece>> {
  const out: Partial<Record<Slot, Piece>> = {};
  for (const [slot, entry] of Object.entries(draft.slots) as [Slot, DraftSlot][]) {
    const piece = entry.pieceId ? getPiece(entry.pieceId) : undefined;
    if (piece) out[slot] = piece;
  }
  return out;
}

/**
 * The piece to SHOW for the slot being refined.
 *  - Before any answers it is the piece already there (so opening "Refine"
 *    doesn't change anything until you answer).
 *  - After answers it is the best piece that satisfies them (taste breaks ties).
 */
export function previewPiece(draft: Draft, taste: TasteFn = NO_TASTE): Piece | undefined {
  if (!draft.focus) return undefined;
  const entry = draft.slots[draft.focus];
  if (!entry) return undefined;
  if (entry.handled.length === 0 && entry.pieceId) return getPiece(entry.pieceId);
  return bestFor(draft.section, entry.category, entry.answers, taste);
}

/** The next question for the slot being refined (or null when finished). */
export function currentStep(draft: Draft): Step | null {
  if (!draft.focus) return null;
  const entry = draft.slots[draft.focus];
  if (!entry) return null;
  return nextStep(draft.section, entry.category, entry.answers, entry.handled);
}

/** Is there enough for a complete outfit? (body piece(s) + shoes) */
export function isComplete(draft: Draft): boolean {
  const p = draftPieces(draft);
  return Boolean((p.onepiece || (p.top && p.bottom)) && p.shoes);
}

// ── Updating one slot ───────────────────────────────────────────────────────

/** Replace one slot's entry. */
function withSlot(draft: Draft, slot: Slot, patch: Partial<DraftSlot>): Draft {
  const current = draft.slots[slot];
  if (!current) return draft;
  return { ...draft, slots: { ...draft.slots, [slot]: { ...current, ...patch } } };
}

// ── Starting ────────────────────────────────────────────────────────────────

/** Start fresh from a category ("I'm building around a shirt"). */
export function startFromCategory(section: Section, category: CategoryId): Draft {
  const slot = slotOf(category);
  return {
    ...newDraft(section),
    anchor: slot,
    focus: slot,
    slots: {
      [slot]: { category, pieceId: "", answers: {}, handled: [], locked: true, origin: "user", rejected: [] },
    },
  };
}

/**
 * Start fresh from ONE specific piece (e.g. tapped on the home page). The piece
 * is fully known, so there are no questions: the engine builds the rest and
 * we land directly on the board.
 *
 * @param origin  the post it came from (default: the piece itself) — becomes
 *                the top card of the stack
 */
export function startFromPiece(section: Section, piece: Piece, taste: TasteFn = NO_TASTE, origin?: DraftOrigin): Draft {
  const slot = slotOf(piece.category);
  const chain = CATEGORIES[piece.category].chain;

  // Pre-fill the answers from the piece itself, so "Refine" shows where it sits.
  const answers: Answers = {};
  for (const key of chain) {
    const value = facetValues(piece, key)[0];
    if (value) answers[key] = value;
  }

  const base: Draft = {
    ...newDraft(section),
    anchor: slot,
    origin: origin ?? { kind: "piece", pieceId: piece.id },
    slots: {
      [slot]: {
        category: piece.category,
        pieceId: piece.id,
        answers,
        handled: [...chain],
        locked: true,
        origin: "user",
        rejected: [],
      },
    },
  };
  return recompose(base, taste);
}

// ── Answering questions ─────────────────────────────────────────────────────

/** Record an answer for the focused slot. */
export function answer(draft: Draft, key: FacetKey, value: string): Draft {
  if (!draft.focus) return draft;
  const entry = draft.slots[draft.focus];
  if (!entry) return draft;
  return withSlot(draft, draft.focus, {
    answers: { ...entry.answers, [key]: value },
    handled: [...entry.handled.filter((k) => k !== key), key],
  });
}

/** Skip a question ("no preference"). */
export function skip(draft: Draft, key: FacetKey): Draft {
  if (!draft.focus) return draft;
  const entry = draft.slots[draft.focus];
  if (!entry || entry.handled.includes(key)) return draft;
  return withSlot(draft, draft.focus, { handled: [...entry.handled, key] });
}

/**
 * Re-open an earlier question. Everything answered AFTER it is forgotten,
 * because those later options depended on the answer you're changing.
 */
export function reopen(draft: Draft, key: FacetKey): Draft {
  if (!draft.focus) return draft;
  const entry = draft.slots[draft.focus];
  if (!entry) return draft;
  const index = entry.handled.indexOf(key);
  if (index === -1) return draft;
  const dropped = entry.handled.slice(index);
  const answers = { ...entry.answers };
  for (const k of dropped) delete answers[k];
  return withSlot(draft, draft.focus, { answers, handled: entry.handled.slice(0, index) });
}

/** Undo the most recent answer. No-op if nothing has been answered. */
export function stepBack(draft: Draft): Draft {
  if (!draft.focus) return draft;
  const entry = draft.slots[draft.focus];
  if (!entry || entry.handled.length === 0) return draft;
  return reopen(draft, entry.handled[entry.handled.length - 1]);
}

/** Switch the focused slot to a different category with the same slot. */
export function changeCategory(draft: Draft, category: CategoryId): Draft {
  if (!draft.focus || slotOf(category) !== draft.focus) return draft;
  return withSlot(draft, draft.focus, { category, answers: {}, handled: [], pieceId: "" });
}

/** Re-open an existing slot for refining (restarts its questions). */
export function focusSlot(draft: Draft, slot: Slot): Draft {
  const entry = draft.slots[slot];
  if (!entry) return draft;
  return { ...withSlot(draft, slot, { answers: {}, handled: [] }), focus: slot };
}

/** Leave the question flow without committing anything. */
export function blur(draft: Draft): Draft {
  return { ...draft, focus: null };
}

// ── Building the look ───────────────────────────────────────────────────────

/**
 * Re-pick every slot that isn't locked, keeping the locked ones. This is how
 * "know one piece → build the rest" happens, and how the rest adapts when you
 * change your mind about that piece.
 */
export function recompose(draft: Draft, taste: TasteFn = NO_TASTE): Draft {
  const fixed: Partial<Record<Slot, Piece>> = {};
  const keep: Partial<Record<Slot, DraftSlot>> = {};

  for (const [slot, entry] of Object.entries(draft.slots) as [Slot, DraftSlot][]) {
    if (entry.locked && entry.pieceId) {
      const piece = getPiece(entry.pieceId);
      if (piece) {
        fixed[slot] = piece;
        keep[slot] = entry;
      }
    }
  }

  const { pieces } = composeLook({
    section: draft.section,
    fixed,
    omitted: draft.omitted,
    taste,
    seed: draft.seed,
  });

  const slots: Partial<Record<Slot, DraftSlot>> = { ...keep };
  for (const [slot, piece] of Object.entries(pieces) as [Slot, Piece][]) {
    if (fixed[slot]) continue;
    slots[slot] = {
      category: piece.category,
      pieceId: piece.id,
      answers: {},
      handled: [],
      locked: false,
      origin: "engine",
      rejected: draft.slots[slot]?.rejected ?? [],
    };
  }
  return { ...draft, slots };
}

/**
 * Finish refining the focused slot: lock the previewed piece, let the engine
 * fill/adjust the rest, and return to the board.
 */
export function commit(draft: Draft, taste: TasteFn = NO_TASTE): Draft {
  if (!draft.focus) return draft;
  const piece = previewPiece(draft, taste);
  if (!piece) return { ...draft, focus: null };
  const committed = withSlot(draft, draft.focus, {
    pieceId: piece.id,
    category: piece.category,
    locked: true,
    origin: "user",
  });
  return recompose({ ...committed, focus: null }, taste);
}

/** Re-roll the engine's picks (locked pieces stay). */
export function shuffle(draft: Draft, taste: TasteFn = NO_TASTE): Draft {
  return recompose({ ...draft, seed: draft.seed + 1 }, taste);
}

// ── Board actions ───────────────────────────────────────────────────────────

/** Result of swapping a slot, so callers can report it to the model. */
export interface SwapResult {
  draft: Draft;
  /** The piece that was replaced (undefined if nothing changed). */
  replaced?: Piece;
  /** The piece now in the slot. */
  next?: Piece;
}

/**
 * Replace one slot with the best *other* piece that suits the rest of the look.
 * Each press moves to the next-best alternative, never repeating one you
 * already rejected for that slot.
 */
export function swapSlot(draft: Draft, slot: Slot, taste: TasteFn = NO_TASTE): SwapResult {
  const entry = draft.slots[slot];
  const pieces = draftPieces(draft);
  const current = pieces[slot];
  if (!entry || !current) return { draft };

  const others = { ...pieces };
  delete others[slot];

  const rejected = new Set([...entry.rejected, current.id]);
  const next = rankAlternatives(draft.section, slot, others, taste).find((a) => !rejected.has(a.piece.id));
  if (!next) return { draft };

  return {
    draft: withSlot(draft, slot, {
      pieceId: next.piece.id,
      category: next.piece.category,
      answers: {},
      handled: [],
      rejected: [...entry.rejected, current.id],
    }),
    replaced: current,
    next: next.piece,
  };
}

/** Pin / unpin a piece so the engine does (not) leave it alone. */
export function toggleLock(draft: Draft, slot: Slot): Draft {
  const entry = draft.slots[slot];
  if (!entry || !entry.pieceId) return draft;
  return withSlot(draft, slot, { locked: !entry.locked });
}

/**
 * "Delete" a card: take that slot out of the outfit. Any slot can go — but a
 * look without a body piece or shoes isn't complete, so the board then offers
 * an "Add …" card and holds the runway until it's back. The slot is
 * remembered in `omitted`, so Shuffle and re-builds don't sneak it back in.
 */
export function omitSlot(draft: Draft, slot: Slot): Draft {
  if (!draft.slots[slot] && draft.omitted.includes(slot)) return draft;
  const slots = { ...draft.slots };
  delete slots[slot];
  return {
    ...draft,
    slots,
    omitted: draft.omitted.includes(slot) ? draft.omitted : [...draft.omitted, slot],
    focus: draft.focus === slot ? null : draft.focus,
    anchor: draft.anchor === slot ? null : draft.anchor,
  };
}

/**
 * The slots that could be ADDED to the outfit right now (for the "Add …"
 * cards): anything deleted, plus a missing top/bottom (or a dress) when the
 * body isn't covered. Never offers a dress next to separates, or vice versa.
 */
export function addableSlots(draft: Draft): Slot[] {
  const has = (s: Slot) => Boolean(draft.slots[s]?.pieceId);
  const out: Slot[] = [];
  const bodyCovered = has("onepiece") || (has("top") && has("bottom"));
  if (!bodyCovered) {
    if (!has("onepiece")) {
      if (!has("top")) out.push("top");
      if (!has("bottom")) out.push("bottom");
    }
    if (draft.section === "womenswear" && !has("top") && !has("bottom") && !has("onepiece")) out.push("onepiece");
  }
  for (const s of ["shoes", "layer", "accessory"] as Slot[]) if (!has(s)) out.push(s);
  return out;
}

/**
 * "Add" a card back: switch the slot on again and put the best-suited piece in
 * it — WITHOUT disturbing anything else already on the board.
 */
export function fillSlot(draft: Draft, slot: Slot, taste: TasteFn = NO_TASTE): Draft {
  const omitted = draft.omitted.filter((s) => s !== slot);
  const base: Draft = { ...draft, omitted };
  if (draft.slots[slot]?.pieceId) return base;

  const current = draftPieces(base);
  // A dress and separates never share a look.
  if (slot === "onepiece") {
    delete current.top;
    delete current.bottom;
  } else if (slot === "top" || slot === "bottom") {
    delete current.onepiece;
  }
  const rejected = new Set(draft.slots[slot]?.rejected ?? []);
  const best = rankAlternatives(draft.section, slot, current, taste).find((a) => !rejected.has(a.piece.id));
  if (!best) return base;

  const slots = { ...base.slots };
  if (slot === "onepiece") {
    delete slots.top;
    delete slots.bottom;
  } else if (slot === "top" || slot === "bottom") {
    delete slots.onepiece;
  }
  slots[slot] = {
    category: best.piece.category,
    pieceId: best.piece.id,
    answers: {},
    handled: [],
    locked: false,
    origin: "engine",
    rejected: [...rejected],
  };
  return { ...base, slots };
}

/**
 * "Change" → you picked a specific alternative for a slot. It becomes YOUR
 * pick (locked, so Shuffle leaves it alone) and the old piece is remembered as
 * rejected for that slot, so it isn't offered again.
 */
export function replaceSlot(draft: Draft, slot: Slot, piece: Piece): Draft {
  if (slotOf(piece.category) !== slot) return draft;
  const entry = draft.slots[slot];
  const previous = entry?.pieceId;
  return {
    ...draft,
    omitted: draft.omitted.filter((s) => s !== slot),
    slots: {
      ...draft.slots,
      [slot]: {
        category: piece.category,
        pieceId: piece.id,
        answers: {},
        handled: [],
        locked: true,
        origin: "user",
        rejected: previous && previous !== piece.id ? [...(entry?.rejected ?? []), previous] : (entry?.rejected ?? []),
      },
    },
  };
}

/**
 * The best alternatives for one slot, given the rest of the look — what the
 * "Change" panel offers. Skips the current piece and ones already rejected.
 */
export function alternativesFor(draft: Draft, slot: Slot, taste: TasteFn = NO_TASTE, limit = 8): Piece[] {
  const pieces = draftPieces(draft);
  const others = { ...pieces };
  delete others[slot];
  const skip = new Set([...(draft.slots[slot]?.rejected ?? []), pieces[slot]?.id ?? ""]);
  const seenLooks = new Set<string>();
  const out: Piece[] = [];
  for (const { piece } of rankAlternatives(draft.section, slot, others, taste)) {
    if (skip.has(piece.id) || seenLooks.has(piece.look)) continue;
    seenLooks.add(piece.look); // one per photo, so the row isn't five crops of one look
    out.push(piece);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Persistence safety ──────────────────────────────────────────────────────

/**
 * Check a draft loaded from localStorage. Drops anything that no longer makes
 * sense (a piece removed from the catalog, a slot that doesn't exist…), and
 * returns `null` if it's unusable. Never throws.
 */
export function validateDraft(raw: unknown): Draft | null {
  const d = raw as Partial<Draft> | null;
  if (!d || d.version !== 1 || (d.section !== "menswear" && d.section !== "womenswear")) return null;
  if (typeof d.slots !== "object" || d.slots === null) return null;

  const slots: Partial<Record<Slot, DraftSlot>> = {};
  for (const [slot, entry] of Object.entries(d.slots) as [Slot, DraftSlot][]) {
    if (!entry || !(entry.category in CATEGORIES)) continue;
    if (slotOf(entry.category) !== slot) continue;
    if (entry.pieceId && !getPiece(entry.pieceId)) continue;
    slots[slot] = {
      category: entry.category,
      pieceId: entry.pieceId ?? "",
      answers: entry.answers ?? {},
      handled: Array.isArray(entry.handled) ? entry.handled : [],
      locked: Boolean(entry.locked),
      origin: entry.origin === "engine" ? "engine" : "user",
      rejected: Array.isArray(entry.rejected) ? entry.rejected : [],
    };
  }

  const focus = d.focus && slots[d.focus] ? d.focus : null;
  const origin = validOrigin(d.origin);
  return {
    version: 1,
    section: d.section,
    slots,
    omitted: Array.isArray(d.omitted) ? d.omitted : [],
    seed: typeof d.seed === "number" ? d.seed : 0,
    focus,
    anchor: d.anchor && slots[d.anchor] ? d.anchor : null,
    ...(origin ? { origin } : {}),
  };
}

/** Keep a saved origin only if it still makes sense. */
function validOrigin(raw: unknown): DraftOrigin | undefined {
  const o = raw as Partial<DraftOrigin> | null | undefined;
  if (!o || typeof o !== "object") return undefined;
  if (o.kind === "look" && typeof o.lookId === "string" && getLook(o.lookId)) return { kind: "look", lookId: o.lookId };
  if (o.kind === "piece" && typeof o.pieceId === "string" && getPiece(o.pieceId)) return { kind: "piece", pieceId: o.pieceId };
  if (o.kind === "live" && o.item && typeof o.item === "object") {
    const i = o.item as Partial<LiveCover>;
    if (typeof i.id === "string" && typeof i.image === "string" && /^https:\/\//.test(i.image) && typeof i.url === "string" && /^https:\/\//.test(i.url)) {
      return {
        kind: "live",
        reason: typeof o.reason === "string" ? o.reason : undefined,
        item: {
          id: i.id,
          title: String(i.title ?? ""),
          image: i.image,
          imageLarge: typeof i.imageLarge === "string" && /^https:\/\//.test(i.imageLarge) ? i.imageLarge : undefined,
          url: i.url,
          sourceName: String(i.sourceName ?? ""),
          kind: String(i.kind ?? ""),
          video: typeof i.video === "string" && /^[\w-]{6,20}$/.test(i.video) ? i.video : undefined,
          credit: typeof i.credit === "string" ? i.credit : undefined,
        },
      };
    }
  }
  return undefined;
}
