/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  state/StashContext.tsx — the stacks you've set aside ("Your stacks")
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT IT IS
 *  Open a post, tweak its stack of cards, press "Add to your stacks" — and the
 *  whole stack is put aside in the little pile in the bottom-left corner
 *  (components/StackTray.tsx) while you go back to browsing. From that pile you
 *  can re-open any stack, send it down the runway, or remove it.
 *
 *  It is deliberately lighter than the Closet: no names to type, no sync —
 *  just a holding pile on this device, like cards on the corner of a desk.
 *
 *  WHAT IS STORED
 *  Each stack is the complete draft (state/draft.ts) exactly as it was when
 *  you added it — every garment, what you kept, the post it started from — so
 *  re-opening it shows the very same cards. It lives in localStorage under
 *  STORAGE_KEYS.stash and is re-checked on load (a garment that has left the
 *  catalog is simply dropped, like everywhere else).
 *
 *  TWEAK
 *    MAX_STACKS   how many stacks the pile holds (the oldest falls off)
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { describeLook } from "../engine/copy";
import { loadJSON, saveJSON, STORAGE_KEYS } from "../lib/storage";
import { draftPieces, validateDraft, type Draft } from "./draft";

/** How many stacks the pile keeps. TWEAK */
export const MAX_STACKS = 24;

/** One stack set aside. */
export interface StashedStack {
  /** Stable id (also what makes "the same stack" — see `signatureOf`). */
  id: string;
  /** The generated look name at the time it was added ("Quiet Brutalism"). */
  name: string;
  /** The whole outfit, exactly as it was. */
  draft: Draft;
  /** When it was added (ISO time). */
  addedAt: string;
}

interface StashApi {
  /** Newest first. */
  stacks: StashedStack[];
  /** Put a stack aside. Returns false if that exact stack was already there (it moves to the top). */
  add: (draft: Draft) => boolean;
  remove: (id: string) => void;
  /** Is this exact outfit already in the pile? */
  has: (draft: Draft) => boolean;
}

/**
 * Two stacks are "the same" when they hold the same garments and started from
 * the same post. (Moving a card or re-adding never makes a duplicate.)
 */
function signatureOf(draft: Draft): string {
  const ids = Object.values(draftPieces(draft))
    .map((p) => p!.id)
    .sort();
  const o = draft.origin;
  const from = !o ? "" : o.kind === "live" ? `live:${o.item.id}` : o.kind === "look" ? `look:${o.lookId}` : `piece:${o.pieceId}`;
  return `${draft.section}|${from}|${ids.join(",")}`;
}

/** Read the pile back from storage, dropping anything that no longer makes sense. */
function load(): StashedStack[] {
  const raw = loadJSON<unknown>(STORAGE_KEYS.stash, []);
  if (!Array.isArray(raw)) return [];
  const out: StashedStack[] = [];
  for (const item of raw as Partial<StashedStack>[]) {
    const draft = validateDraft(item?.draft);
    if (!draft || Object.keys(draftPieces(draft)).length === 0) continue;
    out.push({
      id: signatureOf(draft),
      name: typeof item.name === "string" ? item.name : "Untitled look",
      draft,
      addedAt: typeof item.addedAt === "string" ? item.addedAt : new Date().toISOString(),
    });
  }
  return out.slice(0, MAX_STACKS);
}

const StashContext = createContext<StashApi | null>(null);

export function StashProvider({ children }: { children: ReactNode }) {
  const [stacks, setStacks] = useState<StashedStack[]>(load);

  useEffect(() => saveJSON(STORAGE_KEYS.stash, stacks), [stacks]);

  // The newest list, readable inside callbacks (React applies setState later).
  const stacksRef = useRef(stacks);
  stacksRef.current = stacks;

  const add = useCallback((draft: Draft) => {
    const id = signatureOf(draft);
    const isNew = !stacksRef.current.some((s) => s.id === id);
    // Put aside a settled copy: no question half-answered, nothing focused.
    const clean: Draft = { ...draft, focus: null };
    const entry: StashedStack = { id, name: describeLook(draftPieces(clean), clean.seed).name, draft: clean, addedAt: new Date().toISOString() };
    setStacks((list) => [entry, ...list.filter((s) => s.id !== id)].slice(0, MAX_STACKS));
    return isNew;
  }, []);

  const remove = useCallback((id: string) => setStacks((list) => list.filter((s) => s.id !== id)), []);

  const has = useCallback((draft: Draft) => stacks.some((s) => s.id === signatureOf(draft)), [stacks]);

  const api = useMemo<StashApi>(() => ({ stacks, add, remove, has }), [stacks, add, remove, has]);
  return <StashContext.Provider value={api}>{children}</StashContext.Provider>;
}

/** Access the pile. Must be used under <StashProvider>. */
export function useStash(): StashApi {
  const ctx = useContext(StashContext);
  if (!ctx) throw new Error("useStash must be used inside <StashProvider>");
  return ctx;
}
