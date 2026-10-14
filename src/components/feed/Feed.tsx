/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/feed/Feed.tsx — the endless, slowly drifting home wall
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT YOU SEE
 *  An asymmetrical wall of posts — live looks from Vogue Runway, Pinterest, the
 *  houses' YouTube shows and museum archives, mixed with the app's own runway
 *  looks and garments — that slowly scrolls itself downward and never ends.
 *  Hover a post (or click it) and it opens as a stack of cards on the next
 *  page, ready to pick pieces from.
 *
 *  HOW IT WORKS (one job per file)
 *    feed/posts.ts        what comes next — the queues and the rhythm
 *    feed/masonry.ts      where each post sits (all positions known up front)
 *    feed/useAutoScroll   the slow drift, and getting out of your way
 *    feed/memory.ts       remembering your place when you come back
 *    FeedCard.tsx         one post
 *  This file glues them together:
 *    1. builds the queues from the live feed + the catalog, ranked by Muse
 *    2. deals posts in batches of BATCH whenever you get near the bottom
 *    3. draws ONLY the posts near the screen (so it can run for hours)
 *    4. runs the hover-to-open timer and hands the post to the outfit builder
 *
 *  TWEAK
 *    BATCH            posts added each time you near the bottom
 *    HOVER_OPEN_MS    how long to rest on a post before it opens (null = off)
 *    DRAW_ABOVE/BELOW how far off-screen posts are still drawn
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Section, Vibe } from "../../data/types";
import { categoriesFor, categoryLabel } from "../../data/wardrobe";
import { useRoute } from "../../lib/router";
import { inLiveSection, rankLive } from "../../live/feed";
import { liveFeatures, liveVibes } from "../../live/tags";
import { dismissLiveItem, loadMoreArchive, useLiveFeed } from "../../live/useLiveFeed";
import { clampAspect, layoutMasonry, type Placed } from "../../feed/masonry";
import { feedMemory, setActiveFeed, setHandoff } from "../../feed/memory";
import { filterPools, FILTER_LABEL, nextPosts, type FeedFilter, type FeedPools, type Post } from "../../feed/posts";
import { RESUME_AFTER_POINTER_MS, useAutoScroll } from "../../feed/useAutoScroll";
import { rankLooks, rankPieces } from "../../model/recommend";
import { useApp } from "../../state/AppContext";
import { useTaste } from "../../state/TasteContext";
import { useToast } from "../../state/ToastContext";
import { FeedCard } from "./FeedCard";

/** Posts added each time you get near the bottom. TWEAK */
const BATCH = 24;
/** Rest the pointer on a post this long (ms) to open it. `null` turns hover-to-open off. TWEAK */
export const HOVER_OPEN_MS: number | null = 1100;
/** How far above / below the screen posts are still drawn, in px. */
const DRAW_ABOVE = 900;
const DRAW_BELOW = 1500;
/** If fewer than this many live posts are left to show, fetch more archive pages. */
const LOW_WATER = 12;

interface FeedProps {
  section: Section;
  filter: FeedFilter;
  vibe: Vibe | null;
}

export function Feed({ section, filter, vibe }: FeedProps) {
  const app = useApp();
  const taste = useTaste();
  const toast = useToast();
  const live = useLiveFeed();
  const route = useRoute();

  // ── 0. This view's memory (posts, place) ─────────────────────────────────
  const viewId = `${section}|${filter}|${vibe ?? "any"}`;
  const memory = feedMemory(viewId);
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => setActiveFeed(viewId), [viewId]);

  // ── 1. The queues, best first ────────────────────────────────────────────
  const pools = useMemo<FeedPools>(() => {
    const args = { section, state: taste.state, crowd: taste.crowd, dismissed: taste.dismissed, vibe };
    const liveRanked = rankLive({ items: live.items, section, state: taste.state, crowd: taste.crowd, dismissed: live.dismissed }).filter(
      (i) => !vibe || liveVibes(i).includes(vibe),
    );
    const looks = rankLooks({ ...args, limit: 999, perShow: 99 }).map(({ look, reason }) => ({ look, reason }));
    const pieces = rankPieces(args).map(({ piece }) => ({ piece }));
    const prompts = categoriesFor(section)
      .map((c) => ({
        category: c.id,
        label: categoryLabel(c.id, section),
        hint: c.hint,
        piece: pieces.find((p) => p.piece.category === c.id)?.piece,
      }))
      .filter((p) => p.piece);
    return filterPools({ live: liveRanked, looks, pieces, prompts }, filter);
  }, [live.items, live.dismissed, section, taste.state, taste.crowd, taste.dismissed, vibe, filter]);

  // A filtered view that ran out may have new posts once the live feed refreshes.
  useEffect(() => {
    if (memory.exhausted) {
      memory.exhausted = false;
      bump();
    }
  }, [pools, memory]);

  // Wait (briefly) for the first live posts, so the top of the wall isn't all
  // catalog: start as soon as a dozen have arrived (sources answer one by one),
  // when every source has answered, or after 5 s at most.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setWaited(true), 5000);
    return () => window.clearTimeout(t);
  }, []);
  const sectionLiveCount = useMemo(() => live.items.filter((i) => inLiveSection(i, section)).length, [live.items, section]);
  const ready = live.updatedAt !== null || sectionLiveCount >= 12 || waited || memory.posts.length > 0;

  // ── 2. Dealing posts ─────────────────────────────────────────────────────
  const deal = useCallback(
    (count: number) => {
      if (memory.exhausted) return;
      const result = nextPosts(pools, memory.cursor, count, filter === "all");
      memory.posts = [...memory.posts, ...result.posts];
      memory.cursor = result.cursor;
      memory.exhausted = result.exhausted;
      bump();
    },
    [pools, filter, memory],
  );

  // Running low on live posts → ask the open archives (the Met, Openverse) for another page.
  useEffect(() => {
    if (!ready || (filter !== "all" && filter !== "archive" && filter !== "runway")) return;
    const unshown = pools.live.filter((i) => !memory.cursor.used.has(`live:${i.id}`)).length;
    if (unshown < LOW_WATER) void loadMoreArchive(section);
  }, [ready, pools, version, filter, section, memory]);

  // ── 3. Measuring the wall and laying it out ──────────────────────────────
  const wallRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = wallRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.round(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const postsByKey = useMemo(() => new Map(memory.posts.map((p) => [p.key, p])), [memory.posts]);

  const layout = useMemo(
    () =>
      layoutMasonry(
        memory.posts.map((p) => ({ key: p.key, aspect: memory.aspects.get(p.key) ?? p.aspect, span: p.span, captionH: p.captionH })),
        Math.max(width, 1),
      ),
    // `version` changes whenever posts or measured shapes change.
    [version, width, memory],
  );

  // ── 4. Which part of the wall is on screen ───────────────────────────────
  const [view, setView] = useState({ top: -DRAW_ABOVE, bottom: 1600 });
  const leaving = useRef(false);
  // Which view's scroll position has been put back (so it isn't overwritten first).
  const restored = useRef<string | null>(null);
  const onHome = route === "home";
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = wallRef.current;
      if (!el) return;
      const rectTop = el.getBoundingClientRect().top;
      const step = 150; // only re-render every 150 px of scrolling
      const top = Math.floor((-rectTop - DRAW_ABOVE) / step) * step;
      const bottom = Math.ceil((-rectTop + window.innerHeight + DRAW_BELOW) / step) * step;
      setView((v) => (v.top === top && v.bottom === bottom ? v : { top, bottom }));
      // Remember the place — but not while leaving (the next page scrolls to the
      // top), and not before the saved place has been put back.
      if (onHome && !leaving.current && restored.current === viewId) memory.scrollY = window.scrollY;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [memory, onHome, viewId]);

  // Keep the wall topped up: deal more whenever the bottom comes within reach.
  useEffect(() => {
    if (!ready || width === 0 || memory.exhausted) return;
    if (memory.posts.length === 0 || layout.height < view.bottom + window.innerHeight) deal(BATCH);
  }, [ready, width, view.bottom, layout.height, deal, memory]);

  // Coming back to the home page: return to where you were.
  useLayoutEffect(() => {
    if (width === 0 || restored.current === viewId) return;
    const first = restored.current === null;
    restored.current = viewId;
    leaving.current = false;
    if (memory.scrollY > 0 && memory.posts.length) {
      window.scrollTo(0, memory.scrollY);
    } else if (!first) {
      // Switched chips: bring the top of this (new) view into sight, if we're below it.
      const top = (wallRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 140;
      if (window.scrollY > top) window.scrollTo(0, Math.max(0, top));
    }
  }, [width, viewId, memory, layout.height]);

  // ── 5. The slow drift ────────────────────────────────────────────────────
  const auto = useAutoScroll(ready && memory.posts.length > 0 && onHome);
  // Give people a moment to read the top of the page before it starts moving.
  const { holdFor } = auto;
  useEffect(() => holdFor(2500), [holdFor]);

  // ── 6. Opening a post (click, or rest the pointer on it) ─────────────────
  const open = useCallback(
    (post: Post, card: HTMLElement) => {
      const media = card.querySelector(".feed-card-media") ?? card;
      const r = media.getBoundingClientRect();
      setHandoff({ left: r.left, top: r.top, width: r.width, height: r.height });
      memory.scrollY = window.scrollY;
      leaving.current = true;
      switch (post.type) {
        case "live":
          if (!app.startFromLive(post.item)) leaving.current = false;
          break;
        case "look":
          app.startFromLook(post.look);
          break;
        case "piece":
          app.startFromPiece(post.piece);
          break;
        case "prompt":
          app.startFromCategory(post.prompt.category);
          break;
      }
    },
    [app, memory],
  );

  const [dwellKey, setDwellKey] = useState<string | null>(null);
  const dwell = useRef<{ key: string; timer: number } | null>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const cancelDwell = useCallback(() => {
    if (!dwell.current) return;
    window.clearTimeout(dwell.current.timer);
    dwell.current = null;
    setDwellKey(null);
    auto.release(1500);
  }, [auto]);

  // Scrolling while resting on a post moves a different post under the pointer: start over.
  useEffect(() => {
    const onWheel = () => cancelDwell();
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      if (dwell.current) window.clearTimeout(dwell.current.timer);
    };
  }, [cancelDwell]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "mouse") return; // touch & pen: tap to open
      // Browsers send a "move" when the page scrolls under a still mouse — ignore
      // those, so the drift never opens a post on its own.
      const last = lastPointer.current;
      if (last && last.x === e.clientX && last.y === e.clientY) return;
      lastPointer.current = { x: e.clientX, y: e.clientY };
      auto.holdFor(RESUME_AFTER_POINTER_MS);

      const target = e.target as Element;
      const card = target.closest<HTMLElement>("[data-post-key]");
      const key = card && !target.closest("[data-no-dwell]") ? (card.dataset.postKey ?? null) : null;
      if (key === (dwell.current?.key ?? null)) return;
      cancelDwell();
      if (!key || !card || HOVER_OPEN_MS === null) return;
      const post = postsByKey.get(key);
      if (!post || memory.hidden.has(key)) return;
      auto.hold();
      const timer = window.setTimeout(() => {
        dwell.current = null;
        setDwellKey(null);
        auto.release(0);
        open(post, card);
      }, HOVER_OPEN_MS);
      dwell.current = { key, timer };
      setDwellKey(key);
    },
    [auto, cancelDwell, open, postsByKey, memory],
  );

  // ── 7. "Not for me" and measured picture shapes ──────────────────────────
  const dismiss = useCallback(
    (post: Post) => {
      if (post.type === "live") {
        dismissLiveItem(post.item.id);
        taste.record("home-dismiss", section, liveFeatures(post.item));
      } else if (post.type === "piece") {
        taste.dismissPiece(post.piece, section);
      } else return;
      cancelDwell();
      memory.hidden.add(post.key);
      bump();
      toast.push({ message: "Noted — Muse will show fewer like that." });
    },
    [taste, section, toast, memory, cancelDwell],
  );

  const pending = useRef(new Map<string, number>());
  const pendingRaf = useRef(0);
  const measure = useCallback(
    (key: string, aspect: number) => {
      const next = clampAspect(aspect);
      const now = memory.aspects.get(key) ?? postsByKey.get(key)?.aspect ?? next;
      if (Math.abs(next - now) / now < 0.03) return;
      pending.current.set(key, next);
      // Many pictures load at once: re-lay out once per frame, not once per picture.
      if (!pendingRaf.current) {
        pendingRaf.current = requestAnimationFrame(() => {
          pendingRaf.current = 0;
          for (const [k, v] of pending.current) memory.aspects.set(k, v);
          pending.current.clear();
          bump();
        });
      }
    },
    [memory, postsByKey],
  );
  useEffect(() => () => cancelAnimationFrame(pendingRaf.current), []);

  // ── 8. Drawing ───────────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const out: { place: Placed; index: number }[] = [];
    layout.placed.forEach((place, index) => {
      if (place.y < view.bottom && place.y + place.h > view.top) out.push({ place, index });
    });
    return out;
  }, [layout, view]);

  const sectionLive = sectionLiveCount > 0;

  return (
    <section className="feed" aria-label="The feed">
      <div
        ref={wallRef}
        className={`feed-wall${auto.moving ? " is-drifting" : ""}`}
        role="feed"
        aria-busy={!ready || live.loading}
        style={{ height: Math.max(layout.height, ready ? 0 : 900) }}
        onPointerMove={onPointerMove}
        onPointerLeave={cancelDwell}
      >
        {!ready && <Skeletons width={width} />}
        {visible.map(({ place, index }) => {
          const post = postsByKey.get(place.key);
          if (!post) return null;
          return (
            <FeedCard
              key={place.key}
              post={post}
              place={place}
              index={index}
              section={section}
              hidden={memory.hidden.has(post.key)}
              fresh={post.type === "live" && live.freshIds.has(post.item.id)}
              dwelling={dwellKey === post.key}
              dwellMs={HOVER_OPEN_MS ?? 0}
              onOpen={open}
              onDismiss={dismiss}
              onMeasure={measure}
            />
          );
        })}
      </div>

      {memory.exhausted && (
        <p className="feed-end">
          {memory.posts.length === 0
            ? `Nothing in ${FILTER_LABEL[filter]} right now${sectionLive ? "" : " — the live sources are still loading"}.`
            : `That's everything in ${FILTER_LABEL[filter]} for now — new posts arrive on their own every few minutes.`}
        </p>
      )}

      {onHome &&
        createPortal(
          <button
            type="button"
            className={`feed-drift${auto.enabled ? "" : " is-off"}`}
            onClick={auto.toggle}
            aria-pressed={auto.enabled}
            title={auto.enabled ? "Stop the page scrolling by itself" : "Let the page scroll slowly by itself"}
          >
            <span className="feed-drift-icon" aria-hidden="true">
              {auto.enabled ? "❚❚" : "▶"}
            </span>
            {auto.enabled ? "Pause scroll" : "Auto-scroll"}
          </button>,
          document.body,
        )}
    </section>
  );
}

/** Grey placeholder tiles while the first posts load. */
function Skeletons({ width }: { width: number }) {
  const { placed } = layoutMasonry(
    Array.from({ length: 10 }, (_, i) => ({ key: `s${i}`, aspect: [2 / 3, 1, 4 / 5, 3 / 4, 3 / 2][i % 5], span: 1 as const, captionH: 64 })),
    Math.max(width, 1),
  );
  return (
    <>
      {placed.map((p) => (
        <div
          key={p.key}
          className="feed-card feed-card--skeleton"
          aria-hidden="true"
          style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)`, width: p.w, height: p.h }}
        />
      ))}
    </>
  );
}
