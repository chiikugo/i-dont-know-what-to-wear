/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  state/AppContext.tsx — the outfit builder's brain, wired into React
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE IS
 *  state/draft.ts holds the *rules* of building an outfit (pure functions).
 *  This file holds the *current outfit* in React state and exposes friendly
 *  actions to the screens: `pick`, `finish`, `swap`, `shuffle`, `toRunway`,
 *  `resume` (pick a set-aside stack back up)…
 *
 *  Each action does up to three things:
 *      1. update the draft         (via a pure function in draft.ts)
 *      2. tell the taste model     (via useTaste().record — this is the
 *                                    "learn from people's choices" part)
 *      3. navigate / show a toast
 *
 *  PERSISTENCE
 *  The draft is written to localStorage on every change and validated on load,
 *  so refreshing the page — or leaving for the Closet tab and coming back —
 *  resumes exactly where you were.
 *
 *  REACT CONCEPT: WHY THE `draftRef`?
 *  Event handlers sometimes run twice in the same tick (e.g. record an event,
 *  then update the draft). React state only updates *after* the handler
 *  finishes, so a second read would see stale data. The ref always holds the
 *  newest value, and `apply()` keeps the ref and the state in step.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Look } from "../data/catalog";
import type { CategoryId, FacetKey, LookSlots, Outfit, Piece, Section, Slot } from "../data/types";
import { SLOT_LABEL } from "../data/wardrobe";
import { bestFor, getPiece, slotOfPiece, type Step } from "../engine/resolver";
import { loadJSON, removeKey, saveJSON, STORAGE_KEYS } from "../lib/storage";
import { navigate } from "../lib/router";
import type { LiveItem } from "../live/feedCore";
import { inspiredPiece } from "../live/inspire";
import { liveFeatures } from "../live/tags";
import { optionFeatures } from "../model/features";
import {
  addableSlots,
  alternativesFor,
  answer,
  blur,
  changeCategory,
  commit,
  currentStep,
  draftPieces,
  fillSlot,
  focusSlot,
  isComplete,
  newDraft,
  omitSlot,
  previewPiece,
  recompose,
  reopen,
  replaceSlot,
  shuffle,
  skip,
  startFromCategory,
  startFromPiece,
  stepBack,
  swapSlot,
  toggleLock,
  validateDraft,
  type Draft,
  type DraftOrigin,
  type LiveCover,
} from "./draft";
import { snapshotOf } from "./ClosetContext";
import { useSection } from "./SectionContext";
import { useTaste } from "./TasteContext";
import { useToast } from "./ToastContext";

// ── The public API ──────────────────────────────────────────────────────────

export interface AppApi {
  /** The outfit in progress (null before you've started one). */
  draft: Draft | null;
  /** Committed pieces by slot. */
  pieces: Partial<Record<Slot, Piece>>;
  /** The piece currently previewed while refining a slot. */
  preview: Piece | undefined;
  /** The question currently being asked (null when finished / on the board). */
  step: Step | null;
  /** True when there's a body piece (or dress) and shoes. */
  complete: boolean;
  /** Slots that could be added back right now ("Add shoes", "Add a top"…). */
  addable: Slot[];

  // — choosing where to start —
  chooseSection: (section: Section) => void;
  startFromCategory: (category: CategoryId) => void;
  /** Build around one garment. `origin` = the post it came from (top card of the stack). */
  startFromPiece: (piece: Piece, origin?: DraftOrigin) => void;
  /**
   * Build a look inspired by a live post (Vogue, Pinterest, a show…): picks the
   * closest catalog garment (live/inspire.ts) and builds around it, with the
   * post itself as the top card. Returns false if nothing suitable was found.
   */
  startFromLive: (item: LiveItem) => boolean;
  /**
   * "Wear it as shown": open a whole runway look as the current outfit (every
   * piece from the photo, locked), then tweak it on the look board.
   */
  startFromLook: (look: Look) => void;

  // — the question flow —
  pick: (key: FacetKey, value: string) => void;
  surprise: () => void;
  skipQuestion: (key: FacetKey) => void;
  reopenQuestion: (key: FacetKey) => void;
  back: () => void;
  switchCategory: (category: CategoryId) => void;
  finish: () => void;

  // — the look board (the stack of cards) —
  refine: (slot: Slot) => void;
  swap: (slot: Slot) => void;
  /** "Change" → put this specific piece in its slot (becomes your pick). */
  replace: (slot: Slot, piece: Piece) => void;
  /** The best alternatives for a slot (what "Change" offers). */
  alternatives: (slot: Slot, limit?: number) => Piece[];
  toggleLock: (slot: Slot) => void;
  /** "Delete" a card (with an Undo toast). */
  omit: (slot: Slot) => void;
  /** "Add" a card back. */
  restore: (slot: Slot) => void;
  shuffle: () => void;
  discard: () => void;

  // — leaving the builder —
  toRunway: () => void;
  /** Re-open a saved outfit as the current look, on the runway or the board. */
  openOutfit: (outfit: Outfit, to?: "runway" | "build", origin?: DraftOrigin) => void;
  /**
   * Pick a stack back up from "Your stacks" (state/StashContext.tsx) exactly as
   * it was — onto the board ("build") or straight down the runway.
   */
  resume: (draft: Draft, to?: "runway" | "build") => void;
}

const AppContext = createContext<AppApi | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { section, setSection } = useSection();
  const taste = useTaste();
  const toast = useToast();

  // ── Load (and validate) the saved draft once ────────────────────────────
  const [draft, setDraftState] = useState<Draft | null>(() => {
    const restored = validateDraft(loadJSON<unknown>(STORAGE_KEYS.draft, null));
    return restored && restored.section === section ? restored : null;
  });

  // Refs that always hold the newest value (see header note).
  const draftRef = useRef(draft);
  const scoreRef = useRef(taste.scorePiece);
  scoreRef.current = taste.scorePiece;
  const sectionRef = useRef(section);
  sectionRef.current = section;

  /** Apply a pure draft transformation, keeping ref and state in step. */
  const apply = useCallback((fn: (d: Draft) => Draft, base?: Draft | null) => {
    const current = base ?? draftRef.current;
    if (!current) return;
    const next = fn(current);
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const set = useCallback((next: Draft | null) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  // Persist the draft.
  useEffect(() => {
    if (draft) saveJSON(STORAGE_KEYS.draft, draft);
    else removeKey(STORAGE_KEYS.draft);
  }, [draft]);

  // Switching/clearing the section invalidates the draft.
  useEffect(() => {
    if (draftRef.current && draftRef.current.section !== section) set(null);
  }, [section, set]);

  // ── Derived values ──────────────────────────────────────────────────────
  const pieces = useMemo(() => (draft ? draftPieces(draft) : {}), [draft]);
  const preview = useMemo(
    () => (draft ? previewPiece(draft, taste.scorePiece) : undefined),
    [draft, taste.scorePiece],
  );
  const step = useMemo(() => (draft ? currentStep(draft) : null), [draft]);
  const complete = useMemo(() => (draft ? isComplete(draft) : false), [draft]);
  const addable = useMemo(() => (draft ? addableSlots(draft) : []), [draft]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const { record, recordPiece, recordPieces } = taste;

  const chooseSection = useCallback(
    (next: Section) => {
      if (sectionRef.current !== next) set(null);
      setSection(next);
      navigate("home");
    },
    [set, setSection],
  );

  const startCategory = useCallback(
    (category: CategoryId) => {
      const sec = sectionRef.current;
      if (!sec) return;
      set(startFromCategory(sec, category));
      navigate("build");
    },
    [set],
  );

  const startPiece = useCallback(
    (piece: Piece, origin?: DraftOrigin) => {
      const sec = sectionRef.current;
      if (!sec) return;
      recordPiece("home-open", sec, piece);
      set(startFromPiece(sec, piece, scoreRef.current, origin));
      navigate("build");
    },
    [recordPiece, set],
  );

  const startLive = useCallback(
    (item: LiveItem) => {
      const sec = sectionRef.current;
      if (!sec) return false;
      const match = inspiredPiece(item, sec, scoreRef.current);
      if (!match) {
        toast.push({ message: "Couldn't find a garment to match that one — try another." });
        return false;
      }
      record("home-open", sec, liveFeatures(item)); // teach Muse about the post itself
      const cover: LiveCover = {
        id: item.id,
        title: item.title,
        image: item.image,
        imageLarge: item.imageLarge,
        url: item.url,
        sourceName: item.sourceName,
        kind: item.kind,
        video: item.video,
        credit: item.credit,
      };
      set(startFromPiece(sec, match.piece, scoreRef.current, { kind: "live", item: cover, reason: match.reason }));
      navigate("build");
      return true;
    },
    [record, set, toast],
  );

  const pick = useCallback(
    (key: FacetKey, value: string) => {
      const d = draftRef.current;
      if (!d || !d.focus) return;
      const entry = d.slots[d.focus];
      const stepNow = currentStep(d);
      if (!entry) return;

      // Teach the model: the chosen option is a "yes", the others a gentle "no".
      record("option", d.section, optionFeatures(key, value, entry.category));
      for (const other of stepNow?.options ?? []) {
        if (other.value !== value) record("option-skip", d.section, optionFeatures(key, other.value, entry.category));
      }
      apply((x) => answer(x, key, value));
    },
    [apply, record],
  );

  /**
   * "Surprise me": let the model choose the answer. We do NOT record this as a
   * user preference — otherwise the model would just be agreeing with itself.
   */
  const surprise = useCallback(() => {
    const d = draftRef.current;
    if (!d || !d.focus) return;
    const entry = d.slots[d.focus];
    const stepNow = currentStep(d);
    if (!entry || !stepNow) return;

    const score = scoreRef.current;
    let bestValue = stepNow.options[0].value;
    let bestScore = -Infinity;
    for (const option of stepNow.options) {
      const piece = bestFor(d.section, entry.category, { ...entry.answers, [stepNow.key]: option.value }, score);
      const s = piece ? score(piece) : -Infinity;
      if (s > bestScore) {
        bestScore = s;
        bestValue = option.value;
      }
    }
    apply((x) => answer(x, stepNow.key, bestValue));
  }, [apply]);

  const skipQuestion = useCallback((key: FacetKey) => apply((d) => skip(d, key)), [apply]);
  const reopenQuestion = useCallback((key: FacetKey) => apply((d) => reopen(d, key)), [apply]);
  const switchCategory = useCallback((category: CategoryId) => apply((d) => changeCategory(d, category)), [apply]);

  /** Back one question; if there's nothing to undo, leave the flow. */
  const back = useCallback(() => {
    const d = draftRef.current;
    if (!d) return;
    const entry = d.focus ? d.slots[d.focus] : undefined;
    if (entry && entry.handled.length > 0) {
      apply((x) => stepBack(x));
    } else if (d.focus && d.anchor === d.focus && !entry?.pieceId) {
      // Backing out of the very first question → abandon this draft.
      set(null);
    } else {
      apply((x) => blur(x));
    }
  }, [apply, set]);

  const finish = useCallback(() => {
    const d = draftRef.current;
    if (!d) return;
    const piece = previewPiece(d, scoreRef.current);
    if (piece) recordPiece("piece-keep", d.section, piece);
    apply((x) => commit(x, scoreRef.current));
  }, [apply, recordPiece]);

  const refine = useCallback((slot: Slot) => apply((d) => focusSlot(d, slot)), [apply]);

  const swap = useCallback(
    (slot: Slot) => {
      const d = draftRef.current;
      if (!d) return;
      const result = swapSlot(d, slot, scoreRef.current);
      if (!result.replaced) {
        toast.push({ message: "No other options fit this look — try Refine instead." });
        return;
      }
      recordPiece("piece-swap", d.section, result.replaced);
      apply(() => result.draft);
    },
    [apply, recordPiece, toast],
  );

  const replace = useCallback(
    (slot: Slot, piece: Piece) => {
      const d = draftRef.current;
      if (!d) return;
      const old = draftPieces(d)[slot];
      if (old && old.id !== piece.id) recordPiece("piece-swap", d.section, old);
      recordPiece("piece-keep", d.section, piece);
      apply((x) => replaceSlot(x, slot, piece));
    },
    [apply, recordPiece],
  );

  const alternatives = useCallback(
    (slot: Slot, limit = 8) => (draftRef.current ? alternativesFor(draftRef.current, slot, scoreRef.current, limit) : []),
    [],
  );

  const lock = useCallback((slot: Slot) => apply((d) => toggleLock(d, slot)), [apply]);

  /** Delete a card — and offer Undo for a few seconds. */
  const omit = useCallback(
    (slot: Slot) => {
      const before = draftRef.current;
      if (!before) return;
      const piece = draftPieces(before)[slot];
      const after = omitSlot(before, slot);
      set(after);
      if (piece) recordPiece("piece-swap", before.section, piece); // a gentle "not this one"
      toast.push({
        message: `Removed ${piece ? `the ${piece.title.toLowerCase()}` : SLOT_LABEL[slot].toLowerCase()}.`,
        actionLabel: "Undo",
        // Only undo if nothing else has changed since.
        onAction: () => {
          if (draftRef.current === after) set(before);
        },
      });
    },
    [recordPiece, set, toast],
  );
  const restore = useCallback((slot: Slot) => apply((d) => fillSlot(d, slot, scoreRef.current)), [apply]);
  const reshuffle = useCallback(() => apply((d) => shuffle(d, scoreRef.current)), [apply]);
  const discard = useCallback(() => set(null), [set]);

  const toRunway = useCallback(() => {
    const d = draftRef.current;
    if (!d || !isComplete(d)) return;
    recordPieces("look-runway", d.section, Object.values(draftPieces(d)));
    navigate("runway");
  }, [recordPieces]);

  /** Re-open a saved outfit as the current draft (all pieces locked). */
  const openOutfit = useCallback(
    (outfit: Outfit, to: "runway" | "build" = "runway", origin?: DraftOrigin) => {
      // Outfits saved before the runway catalog point at pieces that no longer
      // exist. They still display in the closet (from their snapshots), but
      // can't be reopened for editing — say so instead of building a random look.
      const known = Object.values(outfit.slots).filter((snap) => snap && getPiece(snap.id));
      if (known.length === 0) {
        toast.push({ message: "This look was saved before the runway catalog, so its pieces can't be edited any more." });
        return;
      }
      if (sectionRef.current !== outfit.section) setSection(outfit.section);
      let d = newDraft(outfit.section);
      for (const [slot, snap] of Object.entries(outfit.slots) as [Slot, { id: string } | undefined][]) {
        const piece = snap ? getPiece(snap.id) : undefined;
        if (!piece) continue;
        d = {
          ...d,
          slots: {
            ...d.slots,
            [slot]: {
              category: piece.category,
              pieceId: piece.id,
              answers: {},
              handled: [],
              locked: true,
              origin: "user",
              rejected: [],
            },
          },
        };
      }
      // Optional slots the outfit didn't have stay switched OFF — otherwise the
      // engine would helpfully "complete" it with a layer or accessory the
      // saved look never contained.
      d = { ...d, omitted: (["layer", "accessory"] as Slot[]).filter((s) => !outfit.slots[s]), ...(origin ? { origin } : {}) };
      set(recompose(d, scoreRef.current));
      navigate(to);
    },
    [set, setSection, toast],
  );

  const resume = useCallback(
    (d: Draft, to: "runway" | "build" = "build") => {
      if (sectionRef.current !== d.section) setSection(d.section);
      set({ ...d, focus: null });
      if (to === "runway" && isComplete(d)) {
        recordPieces("look-runway", d.section, Object.values(draftPieces(d)));
        navigate("runway");
      } else {
        navigate("build");
      }
    },
    [recordPieces, set, setSection],
  );

  const startLook = useCallback(
    (look: Look) => {
      // (The draft's origin — the top card of the stack — is set below.)
      const sec = look.section === "unisex" ? (sectionRef.current ?? "womenswear") : look.section;
      // One piece per slot: the first garment listed for that slot wins (a look
      // with a bag AND sunglasses keeps the bag — the other is one swap away).
      const slots: LookSlots = {};
      for (const piece of look.pieces) {
        const slot = slotOfPiece(piece);
        if (!slots[slot]) slots[slot] = snapshotOf(piece);
      }
      recordPieces("home-open", sec, look.pieces);
      const now = new Date().toISOString();
      openOutfit({ id: look.id, name: "", section: sec, slots, createdAt: now, updatedAt: now }, "build", { kind: "look", lookId: look.id });
    },
    [openOutfit, recordPieces],
  );

  // NOTE: only explicit actions are reported to the taste model. Merely
  // opening the app or viewing a look never changes what it has learned.

  const api = useMemo<AppApi>(
    () => ({
      draft,
      pieces,
      preview,
      step,
      complete,
      addable,
      chooseSection,
      startFromCategory: startCategory,
      startFromPiece: startPiece,
      startFromLive: startLive,
      startFromLook: startLook,
      pick,
      surprise,
      skipQuestion,
      reopenQuestion,
      back,
      switchCategory,
      finish,
      refine,
      swap,
      replace,
      alternatives,
      toggleLock: lock,
      omit,
      restore,
      shuffle: reshuffle,
      discard,
      toRunway,
      openOutfit,
      resume,
    }),
    [
      draft,
      pieces,
      preview,
      step,
      complete,
      addable,
      chooseSection,
      startCategory,
      startPiece,
      startLive,
      startLook,
      pick,
      surprise,
      skipQuestion,
      reopenQuestion,
      back,
      switchCategory,
      finish,
      refine,
      swap,
      replace,
      alternatives,
      lock,
      omit,
      restore,
      reshuffle,
      discard,
      toRunway,
      openOutfit,
      resume,
    ],
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

/** Access the builder. Must be used under <AppProvider>. */
export function useApp(): AppApi {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}
