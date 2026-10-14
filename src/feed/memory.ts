/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  feed/memory.ts — the feed remembers where you were
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Open a post, play with its stack of cards, come back: the home feed should
 *  be exactly as you left it — same posts, same place. React forgets a
 *  component's state when you leave the page, so the feed keeps its state here,
 *  in plain module variables that live as long as the browser tab.
 *
 *  One memory per (section × filter × mood), so switching chips doesn't lose
 *  your place in "Everything". Nothing here is saved to disk: reload the page
 *  and you get a fresh feed (with the newest posts).
 *
 *  Also here: the HANDOFF — when you open a post, its on-screen position is
 *  noted so the stack page can fly the picture from exactly there.
 */

import type { FeedCursor, Post } from "./posts";
import { newCursor } from "./posts";

export interface FeedMemory {
  posts: Post[];
  cursor: FeedCursor;
  /** A filtered view ran out of posts. */
  exhausted: boolean;
  /** Real picture shapes measured on load (for pins & museum photos), by post key. */
  aspects: Map<string, number>;
  /** Posts you said "not for me" to (shown as a small "hidden" tile, by key). */
  hidden: Set<string>;
  /** Where the page was scrolled to when you left. */
  scrollY: number;
}

const memories = new Map<string, FeedMemory>();

/** The memory for one view of the feed (created on first use). */
export function feedMemory(id: string): FeedMemory {
  let memory = memories.get(id);
  if (!memory) {
    memory = { posts: [], cursor: newCursor(), exhausted: false, aspects: new Map(), hidden: new Set(), scrollY: 0 };
    memories.set(id, memory);
  }
  return memory;
}

/** True if this view has been scrolled before (so the page shouldn't jump to the top). */
export function hasFeedPosition(id: string): boolean {
  return (memories.get(id)?.scrollY ?? 0) > 0;
}

/** The id of the view the home page shows right now (set by Feed.tsx). */
let activeId = "";
export function setActiveFeed(id: string): void {
  activeId = id;
}
export function activeFeedHasPosition(): boolean {
  return activeId !== "" && hasFeedPosition(activeId);
}

// ── The handoff ─────────────────────────────────────────────────────────────

export interface Handoff {
  /** Where the post's picture was on screen (viewport pixels). */
  rect: { left: number; top: number; width: number; height: number };
  /** When it was recorded (a stale handoff is ignored). */
  at: number;
}

let handoff: Handoff | null = null;

export function setHandoff(rect: Handoff["rect"]): void {
  handoff = { rect, at: Date.now() };
}

/** Read the handoff once (it's cleared after reading, and ignored if older than 4 s). */
export function takeHandoff(): Handoff | null {
  const h = handoff;
  handoff = null;
  return h && Date.now() - h.at < 4000 ? h : null;
}
