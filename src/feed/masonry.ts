/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  feed/masonry.ts — where every post sits on the home page (pure maths)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The home feed is an ASYMMETRICAL wall of posts: columns of cards that are
 *  all different heights, columns that start at staggered heights, and the odd
 *  card that spans two columns. This file works out each card's position.
 *
 *  HOW IT PLACES CARDS ("shortest column first")
 *      1. Every column remembers how far down it is filled.
 *      2. The next card goes into the column that is filled the LEAST (so the
 *         wall grows evenly). A two-column card goes into the pair of
 *         neighbouring columns whose lower edge is highest up.
 *      3. The card's height = its picture's height (width ÷ aspect ratio)
 *         + its caption. Because every picture's shape is decided up front
 *         (feed/posts.ts), the whole layout is known before any image loads —
 *         nothing jumps around while you scroll.
 *
 *  Because positions are computed (not left to CSS), the page only has to draw
 *  the cards that are on screen — the feed can run forever without slowing
 *  down (see components/feed/Feed.tsx).
 *
 *  TWEAK
 *    COLUMN_BREAKPOINTS  how many columns at which screen width
 *    STAGGER             how far down each column starts (the "asymmetry")
 *    GAP                 space between cards
 */

/** What the layout needs to know about one post. */
export interface MasonryItem {
  key: string;
  /** Picture width ÷ height (e.g. 2/3 for a tall runway photo). */
  aspect: number;
  /** 1 column, or 2 (a "feature" card) — 2 falls back to 1 on narrow screens. */
  span: 1 | 2;
  /** Height of the caption under the picture, in px (0 = none). */
  captionH: number;
}

/** Where one post ended up. All numbers are CSS pixels inside the feed. */
export interface Placed {
  key: string;
  x: number;
  y: number;
  w: number;
  /** Height of the picture part. */
  imageH: number;
  /** Total height (picture + caption). */
  h: number;
  /** Which column it starts in (handy for tests and stagger effects). */
  column: number;
  span: 1 | 2;
}

export interface MasonryResult {
  placed: Placed[];
  /** Total height of the wall (the tallest column). */
  height: number;
  columns: number;
  columnWidth: number;
}

/** Space between cards, in px. TWEAK */
export const GAP = 18;

/** [minimum feed width, columns] — the first row whose width fits wins. TWEAK */
export const COLUMN_BREAKPOINTS: [number, number][] = [
  [1380, 5],
  [1040, 4],
  [700, 3],
  [0, 2],
];

/**
 * How far down each column starts, in px — the staggered, editorial look.
 * (Column 1 starts at the top, column 2 a little lower, and so on.) TWEAK
 */
export const STAGGER = [0, 64, 22, 104, 40, 86];

/** How many columns fit a feed this wide. */
export function columnCount(width: number): number {
  for (const [min, cols] of COLUMN_BREAKPOINTS) if (width >= min) return cols;
  return 2;
}

/** Keep picture shapes sensible (a broken image could report 1×4000). */
export function clampAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 3 / 4;
  return Math.min(2.2, Math.max(0.42, aspect));
}

/**
 * Place every item. Pure: same input → same output.
 *
 * @param items    in feed order
 * @param width    the feed's width in px
 * @param options  override GAP / STAGGER / columns (tests use these)
 */
export function layoutMasonry(
  items: MasonryItem[],
  width: number,
  options: { gap?: number; stagger?: number[]; columns?: number } = {},
): MasonryResult {
  const gap = options.gap ?? GAP;
  const columns = Math.max(1, options.columns ?? columnCount(width));
  const stagger = options.stagger ?? STAGGER;
  const columnWidth = Math.max(40, (width - gap * (columns - 1)) / columns);
  // How far down each column is filled so far (starting at its stagger).
  const bottoms = Array.from({ length: columns }, (_, c) => (columns > 1 ? (stagger[c] ?? 0) : 0));

  const placed: Placed[] = [];
  for (const item of items) {
    const aspect = clampAspect(item.aspect);
    const wide = item.span === 2 && columns >= 3;

    let column = 0;
    let top = 0;
    let w = columnWidth;
    if (wide) {
      // The neighbouring pair whose lower edge is highest up.
      let best = Infinity;
      for (let c = 0; c < columns - 1; c++) {
        const y = Math.max(bottoms[c], bottoms[c + 1]);
        if (y < best - 0.5) {
          best = y;
          column = c;
        }
      }
      top = best;
      w = columnWidth * 2 + gap;
    } else {
      // The shortest column (leftmost on ties, so the layout never flickers).
      for (let c = 1; c < columns; c++) if (bottoms[c] < bottoms[column] - 0.5) column = c;
      top = bottoms[column];
    }

    // A wide card on a 2-column phone layout would be a full-width banner of a
    // portrait image — it's simply shown as a normal card instead.
    const imageH = Math.round(w / aspect);
    const h = imageH + item.captionH;
    placed.push({
      key: item.key,
      x: Math.round(column * (columnWidth + gap)),
      y: Math.round(top),
      w: Math.round(w),
      imageH,
      h,
      column,
      span: wide ? 2 : 1,
    });

    const nextBottom = top + h + gap;
    bottoms[column] = nextBottom;
    if (wide) bottoms[column + 1] = nextBottom;
  }

  return { placed, height: Math.round(Math.max(0, ...bottoms) - (placed.length ? gap : 0)), columns, columnWidth };
}

/**
 * The posts that overlap the visible window (plus a margin), so only those are
 * drawn. `placed` is in feed order, which is roughly top-to-bottom, so this is
 * a simple scan — fast enough for thousands of posts.
 */
export function visibleRange(placed: Placed[], top: number, bottom: number): Placed[] {
  return placed.filter((p) => p.y < bottom && p.y + p.h > top);
}
