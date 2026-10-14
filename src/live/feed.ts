/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  live/feed.ts — merging and ranking the live looks (pure logic, tested)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Every few minutes new items arrive from each source. This file decides:
 *    • which items are the SAME story (so a refresh never shows duplicates),
 *    • the ORDER of the live row: fresh things first, nudged by your taste,
 *    • that no single source floods the row.
 *
 *  THE ORDER, IN ONE LINE
 *      score = freshness + TASTE_WEIGHT × Muse's opinion of its tags + a small
 *              bonus for actual looks (runway, show, street style)
 *  where freshness halves over a time that depends on the kind of item
 *  (HALF_LIFE_BY_KIND — show films stay fresh for weeks, magazine stories a day). So a brand-new Vogue
 *  story leads, but if you keep opening Chanel, yesterday's Chanel show can
 *  outrank today's story about a house you always dismiss.
 *
 *  TWEAK the three constants below to change how the row behaves.
 */

import type { CrowdPrior, TasteState } from "../model/tasteModel";
import { taste } from "../model/tasteModel";
import type { LiveItem } from "./feedCore";
import type { LiveSection } from "./sources";
import { liveFeatures } from "./tags";

/** Freshness halves every this many hours (when the kind isn't known). */
const FRESH_HALF_LIFE_HOURS = 36;
/**
 * …but each kind ages at its own pace (TWEAK): a show film stays relevant for
 * weeks after fashion month, a magazine story is yesterday's news in a day.
 */
const HALF_LIFE_BY_KIND: Record<LiveItem["kind"], number> = {
  show: 240,
  runway: 72,
  street: 72,
  pinterest: 48,
  archive: 48,
  editorial: 36,
};
/** How much Muse's opinion counts against freshness (0 = pure newest-first). */
const TASTE_WEIGHT = 0.8;
/** Never more than this many items in a row from the same source. */
const MAX_IN_A_ROW = 2;
/** At most this many items from one source among the first ROW_WINDOW (then the rest follow). */
const PER_SOURCE_CAP = 3;
const ROW_WINDOW = 24;
/**
 * Looks beat articles: a designer's runway picture from yesterday should still
 * come before this morning's magazine story (TWEAK).
 */
const KIND_BONUS: Record<LiveItem["kind"], number> = {
  runway: 0.3,
  show: 0.3,
  street: 0.25,
  pinterest: 0.25,
  archive: 0.15,
  editorial: -0.1,
};
/** The most items kept in memory (the endless feed keeps adding archive pages). */
export const MAX_ITEMS = 600;

/** A key that identifies the same story/picture across sources and refreshes. */
function sameKey(item: LiveItem): string {
  // The image path without size bits ("/236x/", "w_640") is the most reliable.
  const img = item.image.replace(/\/(\d+x|originals)\//, "/").replace(/\/master\/[^/]+\//, "/master/").replace(/[?#].*$/, "");
  return img || item.url;
}

/**
 * Add a fresh batch to what we already have: new stories are added, known ones
 * keep their place (and are updated), duplicates of the same picture collapse.
 * Newest first, capped at MAX_ITEMS.
 */
export function mergeItems(existing: LiveItem[], incoming: LiveItem[]): LiveItem[] {
  const byId = new Map<string, LiveItem>();
  const seenPictures = new Set<string>();
  for (const item of [...incoming, ...existing]) {
    if (byId.has(item.id)) continue;
    const pic = sameKey(item);
    if (seenPictures.has(pic)) continue;
    seenPictures.add(pic);
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((a, b) => b.published.localeCompare(a.published)).slice(0, MAX_ITEMS);
}

/** Is this item for the chosen section? ("both" shows everywhere.) */
export function inLiveSection(item: LiveItem, section: LiveSection): boolean {
  return item.section === "both" || section === "both" || item.section === section;
}

export interface RankArgs {
  items: LiveItem[];
  section: LiveSection;
  state: TasteState;
  crowd: CrowdPrior | null;
  dismissed: ReadonlySet<string>;
  /** Only this kind of item ("runway", "show"…), or all. */
  kind?: LiveItem["kind"] | null;
  /** "Now" (handy for tests). */
  now?: number;
}

/** Freshness: 1 for brand new, 0.5 after one half-life (per kind), → 0 for old items. */
export function freshness(published: string, now: number, kind?: LiveItem["kind"]): number {
  const ageHours = Math.max(0, (now - Date.parse(published)) / 3_600_000);
  const halfLife = kind ? HALF_LIFE_BY_KIND[kind] : FRESH_HALF_LIFE_HOURS;
  return Number.isFinite(ageHours) ? Math.pow(0.5, ageHours / halfLife) : 0;
}

/** The live row, best first. See the file header for the formula. */
export function rankLive(args: RankArgs): LiveItem[] {
  const { items, section, state, crowd, dismissed, kind = null, now = Date.now() } = args;
  const scored = items
    .filter((i) => !dismissed.has(i.id) && inLiveSection(i, section) && (!kind || i.kind === kind))
    .map((item) => {
      const features = liveFeatures(item);
      const opinion = features.length ? taste(state, features, crowd) : 0;
      return { item, score: freshness(item.published, now, item.kind) + TASTE_WEIGHT * opinion + KIND_BONUS[item.kind] };
    })
    .sort((a, b) => b.score - a.score || b.item.published.localeCompare(a.item.published));

  // Spread sources out: within the first ROW_WINDOW, no source more than
  // PER_SOURCE_CAP times and never MAX_IN_A_ROW+1 in a row; overflow follows after.
  const out: LiveItem[] = [];
  const overflow: LiveItem[] = [];
  const perSource = new Map<string, number>();
  const queue = scored.map((s) => s.item);
  while (queue.length) {
    const recent = out.slice(-MAX_IN_A_ROW).map((i) => i.source);
    const crowded = recent.length === MAX_IN_A_ROW && recent.every((s) => s === recent[0]);
    let idx = crowded ? queue.findIndex((i) => i.source !== recent[0]) : 0;
    if (idx === -1) idx = 0;
    const next = queue.splice(idx, 1)[0];
    const count = perSource.get(next.source) ?? 0;
    if (out.length < ROW_WINDOW && count >= PER_SOURCE_CAP) {
      overflow.push(next);
      continue;
    }
    perSource.set(next.source, count + 1);
    out.push(next);
  }
  return [...out, ...overflow];
}

/** "just now", "12 min ago", "3 h ago", "2 d ago" */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const mins = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(mins)) return "";
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days < 30 ? `${days} d ago` : new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
