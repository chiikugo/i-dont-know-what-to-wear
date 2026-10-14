/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  live/useLiveFeed.ts — the continuously refreshing live feed (React hook)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  HOW "CONTINUOUSLY REFRESHING" WORKS
 *   • On first use, every source is fetched at once (fetchers.ts).
 *   • Then every REFRESH_MINUTES (sources.ts) it fetches again — new stories
 *     slide into the row with a "New" tag; known ones stay put.
 *   • It pauses while the tab is hidden (no point refreshing a page nobody is
 *     looking at) and refreshes as soon as you come back, if it's been a minute.
 *   • The items live in a small shared store outside React, so leaving the
 *     home page and coming back doesn't refetch or lose anything.
 *
 *  NEVER RUNNING DRY
 *  The home feed is endless. When it runs low on live posts it calls
 *  loadMoreArchive(), which fetches the next page of Creative Commons runway
 *  photos (Openverse → Wikimedia Commons) and of the V&A archive — politely: at
 *  most one request every ARCHIVE_COOLDOWN_MS, ARCHIVE_MAX_CALLS per visit.
 *
 *  WHAT IS (AND ISN'T) KEPT
 *  Items are kept in memory only — titles, links and image ADDRESSES. Nothing
 *  is downloaded or saved; reloading the page fetches everything fresh. The
 *  only thing saved is the list of items you dismissed ("not for me").
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { loadJSON, saveJSON, STORAGE_KEYS } from "../lib/storage";
import type { LiveItem } from "./feedCore";
import { mergeItems } from "./feed";
import { fetchDirect, fetchOpenverse, fetchRelay, fetchVam, type SourceResult } from "./fetchers";
import { DIRECT_SOURCES, OPENVERSE_QUERIES, REFRESH_MINUTES, VAM_DESIGNERS } from "./sources";

/** A source's status for the line under the live row. */
export interface SourceStatus {
  id: string;
  name: string;
  ok: boolean;
  count: number;
  error?: string;
}

export interface LiveFeedSnapshot {
  /** Everything fetched so far, newest first (all sections). */
  items: LiveItem[];
  statuses: SourceStatus[];
  /** When the last refresh finished (ms), or null before the first one. */
  updatedAt: number | null;
  loading: boolean;
  /** Items that arrived after the first load (shown with a "New" tag). */
  freshIds: ReadonlySet<string>;
  /** Items the user dismissed. */
  dismissed: ReadonlySet<string>;
}

// ── The shared store ────────────────────────────────────────────────────────

let snapshot: LiveFeedSnapshot = {
  items: [],
  statuses: [],
  updatedAt: null,
  loading: false,
  freshIds: new Set(),
  dismissed: new Set(loadJSON<string[]>(STORAGE_KEYS.liveDismissed, [])),
};
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let vamTurn = 0;
/** Statuses of the "load more" archive sources (kept across refreshes). */
const archiveStatuses = new Map<string, SourceStatus>();

function statusOf({ id, name, ok, items, error }: SourceResult): SourceStatus {
  return { id, name, ok, count: items.length, error };
}

function update(patch: Partial<LiveFeedSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((l) => l());
}

/**
 * Fetch every source once and merge the results in. Safe to call often.
 * Each source is merged AS SOON AS IT ANSWERS (Vogue's feed takes about a
 * second, the relay a couple), so the feed can start with live posts instead
 * of waiting for the slowest source.
 */
export function refreshLiveFeed(): Promise<void> {
  if (inflight) return inflight;
  update({ loading: true });
  inflight = (async () => {
    // Two V&A designers per refresh, taking turns through the list.
    const designers = [VAM_DESIGNERS[vamTurn % VAM_DESIGNERS.length], VAM_DESIGNERS[(vamTurn + 1) % VAM_DESIGNERS.length]];
    vamTurn += 2;
    const known = new Set(snapshot.items.map((i) => i.id));
    const isFirstLoad = snapshot.updatedAt === null;
    const results: SourceResult[] = [];

    const arrive = (batch: SourceResult[]) => {
      results.push(...batch);
      const merged = mergeItems(snapshot.items, batch.flatMap((r) => r.items));
      // "New" tags only for items that arrive after the first load.
      const freshIds = isFirstLoad ? snapshot.freshIds : new Set([...snapshot.freshIds, ...merged.filter((i) => !known.has(i.id)).map((i) => i.id)]);
      const answered = new Set(batch.map((r) => r.id));
      const statuses = [...snapshot.statuses.filter((st) => !answered.has(st.id)), ...batch.map(statusOf)];
      update({ items: merged, freshIds, statuses });
    };

    const tasks: Promise<SourceResult | SourceResult[]>[] = [...DIRECT_SOURCES.map(fetchDirect), fetchVam(designers), fetchRelay()];
    await Promise.all(tasks.map((t) => t.then((r) => arrive(Array.isArray(r) ? r : [r]))));

    update({
      statuses: [...results.map(statusOf), ...archiveStatuses.values()],
      updatedAt: Date.now(),
      loading: false,
    });
  })().finally(() => {
    inflight = null;
    if (snapshot.loading) update({ loading: false });
  });
  return inflight;
}

// ── "Load more" for the endless feed ────────────────────────────────────────

/** At most one archive request this often (ms). TWEAK */
const ARCHIVE_COOLDOWN_MS = 20_000;
/** At most this many archive requests per visit (Openverse allows 200 a day). TWEAK */
const ARCHIVE_MAX_CALLS = 40;

const archive = {
  busy: false,
  lastAt: 0,
  calls: 0,
  turn: 0,
  /** Last page fetched, per search. */
  pages: new Map<string, number>(),
  /** Searches with no pages left. */
  done: new Set<string>(),
  vamTurn: 0,
  vamPages: new Map<string, number>(),
};

/**
 * Fetch one more page of open-licence looks — Creative Commons runway photos
 * (Openverse) and V&A archive pieces — and add them to the feed. Called by the
 * home feed when it runs low; safe to call often (it rate-limits itself).
 */
export async function loadMoreArchive(section: "womenswear" | "menswear"): Promise<void> {
  const now = Date.now();
  if (archive.busy || now - archive.lastAt < ARCHIVE_COOLDOWN_MS || archive.calls >= ARCHIVE_MAX_CALLS) return;
  archive.busy = true;
  archive.lastAt = now;
  archive.calls += 1;
  try {
    const tasks: Promise<SourceResult>[] = [];
    const queries = OPENVERSE_QUERIES[section].filter((q) => !archive.done.has(q));
    if (queries.length) {
      const query = queries[archive.turn++ % queries.length];
      const page = (archive.pages.get(query) ?? 0) + 1;
      archive.pages.set(query, page);
      tasks.push(
        fetchOpenverse(query, page, section).then((r) => {
          if (!r.ok || page >= r.pages) archive.done.add(query);
          return r;
        }),
      );
    }
    const designer = VAM_DESIGNERS[archive.vamTurn++ % VAM_DESIGNERS.length];
    const vamPage = (archive.vamPages.get(designer) ?? 1) + 1;
    archive.vamPages.set(designer, vamPage);
    tasks.push(fetchVam([designer], { page: vamPage, perDesigner: 8 }));

    const results = await Promise.all(tasks);
    for (const r of results) {
      // The V&A also answers every refresh; keep "more pages" as its own line.
      const id = r.id === "vam" ? "vam-more" : r.id;
      const before = archiveStatuses.get(id);
      archiveStatuses.set(id, {
        ...statusOf(r),
        id,
        name: r.id === "vam" ? "V&A archive (more pages)" : r.name,
        count: (before?.count ?? 0) + r.items.length,
      });
    }
    const merged = mergeItems(snapshot.items, results.flatMap((r) => r.items));
    const others = snapshot.statuses.filter((st) => !archiveStatuses.has(st.id));
    update({ items: merged, statuses: [...others, ...archiveStatuses.values()] });
  } finally {
    archive.busy = false;
  }
}

/** Hide an item for good ("not for me"). */
export function dismissLiveItem(id: string): void {
  const dismissed = new Set(snapshot.dismissed);
  dismissed.add(id);
  saveJSON(STORAGE_KEYS.liveDismissed, [...dismissed].slice(-500));
  update({ dismissed });
}

// ── The polling loop (runs while at least one component is listening) ──────

let timer: number | undefined;
const REFRESH_MS = REFRESH_MINUTES * 60_000;

function onVisible(): void {
  if (document.visibilityState === "visible" && Date.now() - (snapshot.updatedAt ?? 0) > 60_000) void refreshLiveFeed();
}

function startPolling(): void {
  if (timer !== undefined) return;
  if (snapshot.updatedAt === null || Date.now() - snapshot.updatedAt > REFRESH_MS) void refreshLiveFeed();
  timer = window.setInterval(() => {
    if (document.visibilityState === "visible") void refreshLiveFeed();
  }, REFRESH_MS);
  document.addEventListener("visibilitychange", onVisible);
}

function stopPolling(): void {
  window.clearInterval(timer);
  timer = undefined;
  document.removeEventListener("visibilitychange", onVisible);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling();
  };
}

/**
 * The live feed, kept fresh automatically while a component uses it.
 * Returns the snapshot plus `refresh()` for a manual "refresh now".
 */
export function useLiveFeed(): LiveFeedSnapshot & { refresh: () => void } {
  const snap = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  // Re-render once a minute so "updated 3 min ago" stays truthful.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 60_000);
    return () => window.clearInterval(t);
  }, []);
  const refresh = useCallback(() => void refreshLiveFeed(), []);
  return { ...snap, refresh };
}
