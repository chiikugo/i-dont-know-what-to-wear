/**
 * Tests for the endless home feed: where posts sit (feed/masonry.ts) and what
 * comes next (feed/posts.ts).
 */
import { describe, expect, it } from "vitest";
import { LOOKS } from "../data/catalog";
import type { LiveItem } from "../live/feedCore";
import { clampAspect, columnCount, layoutMasonry, visibleRange, type MasonryItem } from "./masonry";
import { baseKey, BEAT, CAPTION_H, filterPools, newCursor, nextPosts, shapeFor, type FeedPools } from "./posts";

const item = (key: string, aspect = 3 / 4, span: 1 | 2 = 1, captionH = 0): MasonryItem => ({ key, aspect, span, captionH });

describe("masonry layout", () => {
  it("picks more columns on wider screens", () => {
    expect(columnCount(390)).toBe(2);
    expect(columnCount(800)).toBe(3);
    expect(columnCount(1200)).toBe(4);
    expect(columnCount(1600)).toBe(5);
  });

  it("puts each card in the shortest column, starting from staggered heights", () => {
    const { placed } = layoutMasonry([item("a"), item("b"), item("c")], 640, { columns: 3, gap: 10, stagger: [0, 40, 20] });
    expect(placed.map((p) => p.column)).toEqual([0, 2, 1]); // column 0 starts highest, then 2 (20), then 1 (40)
    expect(placed[1].y).toBe(20);
    expect(placed[2].y).toBe(40);
  });

  it("derives height from the picture's shape plus its caption", () => {
    const { placed, columnWidth } = layoutMasonry([item("a", 1 / 2, 1, 50)], 300, { columns: 1, gap: 0 });
    expect(placed[0].imageH).toBe(Math.round(columnWidth * 2));
    expect(placed[0].h).toBe(placed[0].imageH + 50);
  });

  it("never lets two cards overlap", () => {
    const items = Array.from({ length: 60 }, (_, i) => item(`k${i}`, [2 / 3, 1, 4 / 5, 3 / 2, 16 / 9][i % 5], i % 7 === 3 ? 2 : 1, i % 2 ? 64 : 0));
    const { placed } = layoutMasonry(items, 1200);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        const overlapX = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1;
        const overlapY = a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(overlapX && overlapY, `${a.key} overlaps ${b.key}`).toBe(false);
      }
    }
  });

  it("spans two columns only where there's room (3+ columns)", () => {
    expect(layoutMasonry([item("w", 3 / 2, 2)], 1200).placed[0].span).toBe(2);
    expect(layoutMasonry([item("w", 3 / 2, 2)], 390).placed[0].span).toBe(1);
  });

  it("keeps silly picture shapes in bounds", () => {
    expect(clampAspect(0)).toBeCloseTo(0.75);
    expect(clampAspect(50)).toBe(2.2);
    expect(clampAspect(0.01)).toBe(0.42);
  });

  it("only draws what's near the screen", () => {
    const { placed } = layoutMasonry(Array.from({ length: 100 }, (_, i) => item(`k${i}`)), 600, { columns: 2 });
    const visible = visibleRange(placed, 1000, 2000);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(20);
    expect(visible.every((p) => p.y < 2000 && p.y + p.h > 1000)).toBe(true);
  });
});

// ── posts ──────────────────────────────────────────────────────────────────

let n = 0;
function live(over: Partial<LiveItem> = {}): LiveItem {
  n++;
  return {
    id: `t:${n}`,
    source: "vogue-runway",
    sourceName: "Vogue Runway",
    kind: "runway",
    title: `Story ${n}`,
    url: `https://www.vogue.com/a/${n}`,
    image: `https://assets.vogue.com/${n}.jpg`,
    published: new Date().toISOString(),
    section: "both",
    ...over,
  };
}

const womens = LOOKS.filter((l) => l.section !== "menswear");
const pools = (liveCount = 10, looks = 6, pieces = 6): FeedPools => ({
  live: Array.from({ length: liveCount }, () => live()),
  looks: womens.slice(0, looks).map((look) => ({ look })),
  pieces: womens.slice(10, 10 + pieces).map((l) => ({ piece: l.pieces[0] })),
  prompts: [],
});

describe("dealing posts", () => {
  it("follows the beat: live, look, live, piece…", () => {
    const { posts } = nextPosts(pools(), newCursor(), 4);
    expect(posts.map((p) => p.type)).toEqual(BEAT.slice(0, 4));
  });

  it("never repeats an item within a cycle, and keys are unique", () => {
    const { posts } = nextPosts(pools(), newCursor(), 22);
    const keys = posts.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("continues where it left off", () => {
    const p = pools();
    const first = nextPosts(p, newCursor(), 8);
    const second = nextPosts(p, first.cursor, 8);
    const keys = [...first.posts, ...second.posts].map((x) => x.key);
    expect(new Set(keys).size).toBe(16);
  });

  it("fills in from another queue when one runs dry", () => {
    const { posts } = nextPosts(pools(1, 6, 6), newCursor(), 10);
    expect(posts.filter((p) => p.type === "live")).toHaveLength(1);
    expect(posts).toHaveLength(10);
  });

  it("is endless: after everything has been shown it starts a new cycle", () => {
    const p = pools(3, 2, 2); // 7 items
    const { posts, cursor } = nextPosts(p, newCursor(), 30);
    expect(posts).toHaveLength(30);
    expect(cursor.cycle).toBeGreaterThan(2);
    expect(new Set(posts.map((x) => x.key)).size).toBe(30); // later cycles get new keys
    for (let i = 1; i < posts.length; i++) expect(baseKey(posts[i].key)).not.toBe(baseKey(posts[i - 1].key));
  });

  it("a filtered view ends instead of repeating", () => {
    const { posts, exhausted } = nextPosts(pools(3, 0, 0), newCursor(), 10, false);
    expect(posts).toHaveLength(3);
    expect(exhausted).toBe(true);
  });

  it("copes with nothing at all", () => {
    expect(nextPosts({ live: [], looks: [], pieces: [], prompts: [] }, newCursor(), 5).posts).toEqual([]);
  });

  it("filters by chip", () => {
    const p = pools();
    p.live.push(live({ kind: "show", video: "abcdefghijk" }), live({ kind: "pinterest" }));
    expect(filterPools(p, "shows").live.every((i) => i.kind === "show")).toBe(true);
    expect(filterPools(p, "shows").looks).toHaveLength(0);
    expect(filterPools(p, "garments").live).toHaveLength(0);
    expect(filterPools(p, "garments").pieces.length).toBeGreaterThan(0);
  });
});

describe("post shapes (the asymmetry)", () => {
  it("is stable for the same item", () => {
    const it1 = live();
    expect(shapeFor({ type: "live", item: it1 })).toEqual(shapeFor({ type: "live", item: it1 }));
  });

  it("varies across items", () => {
    const aspects = new Set(Array.from({ length: 40 }, () => shapeFor({ type: "live", item: live() }).aspect));
    expect(aspects.size).toBeGreaterThan(2);
  });

  it("never crops a Pinterest pin or a museum photo", () => {
    expect(shapeFor({ type: "live", item: live({ kind: "pinterest" }) }).natural).toBe(true);
    expect(shapeFor({ type: "live", item: live({ kind: "archive" }) }).natural).toBe(true);
  });

  it("uses a picture's real size when the source gives it", () => {
    const s = shapeFor({ type: "live", item: live({ width: 1000, height: 1500 }) });
    expect(s.aspect).toBeCloseTo(2 / 3);
    expect(s.natural).toBe(true);
  });

  it("shows films wide", () => {
    expect(shapeFor({ type: "live", item: live({ kind: "show", video: "abcdefghijk" }) })).toMatchObject({ aspect: 16 / 9, span: 2 });
  });

  it("gives captions to everything but the 'start with' tiles", () => {
    expect(shapeFor({ type: "look", look: womens[0] }).captionH).toBe(CAPTION_H);
    expect(shapeFor({ type: "prompt", prompt: { category: "jackets", label: "Jackets", hint: "" } }).captionH).toBe(0);
  });
});
