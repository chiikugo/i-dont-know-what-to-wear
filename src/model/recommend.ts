/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  model/recommend.ts — building the personalised home screen
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE DOES
 *  Turns "the model's opinion about every piece" into the *rows* (rails) shown
 *  on the home page:
 *
 *      Off the runway        ← whole runway LOOKS (photos), ranked by how
 *                              much you'd like the pieces in them
 *      Picked for you        ← highest taste score (with some variety)
 *      Because you like …    ← more of your single strongest preference
 *      Try something new     ← things the model is least sure about (explore)
 *      Popular right now     ← the community prior (or Editor's picks until
 *                              there is any community data)
 *
 *  Each recommendation also carries a *reason* in plain English
 *  ("Because you like baggy, oversized fits"), generated from the model's
 *  own score breakdown — there is no separate hand-written explanation.
 *
 *  It is pure: give it a model state, get rails back. The page re-calls it
 *  whenever your taste changes, which is why the home screen visibly adapts
 *  after a few taps.
 */

import { LOOKS, type Look } from "../data/catalog";
import type { Piece, Section, Vibe } from "../data/types";
import { VIBES } from "../data/types";
import { piecesForSection } from "../engine/resolver";
import { featureLabel, featuresOf } from "./features";
import type { CrowdPrior, TasteState } from "./tasteModel";
import { EDITORIAL_PRIOR, explain, rankScore, taste, topFeatures, uncertainty } from "./tasteModel";

// ── Types ───────────────────────────────────────────────────────────────────

/** One recommended piece plus the "why". */
export interface RecItem {
  piece: Piece;
  /** The sentence shown on the card. */
  reason: string;
  /** The score it was ranked by (useful for debugging / tests). */
  score: number;
}

/** A horizontal row on the home page. */
export interface Rail {
  id: "picks" | "because" | "explore" | "community" | "editor";
  title: string;
  subtitle: string;
  items: RecItem[];
}

/** One recommended runway look (a whole photo) plus the "why". */
export interface LookRec {
  look: Look;
  reason: string;
  score: number;
}

/** The whole personalised home screen. */
export interface HomeFeed {
  /** One line summarising what the model has learned so far. */
  headline: string;
  /** Whole runway looks, best first (the "Off the runway" row). */
  looks: LookRec[];
  rails: Rail[];
}

export interface FeedArgs {
  section: Section;
  state: TasteState;
  crowd: CrowdPrior | null;
  /** Piece ids the user said "not for me" to. */
  dismissed: ReadonlySet<string>;
  /** When set, only pieces with this mood are shown. */
  vibe?: Vibe | null;
  /** Items per rail (default 8). */
  limit?: number;
  /** Most looks from one show (rankLooks only; default 2 — the endless feed allows more). */
  perShow?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Up to three candidate sentences explaining a recommendation, best first,
 * built from the model's own score breakdown (model/tasteModel.ts → explain).
 */
function reasonCandidates(piece: Piece, state: TasteState, crowd: CrowdPrior | null): string[] {
  return explain(state, featuresOf(piece), crowd)
    // Only positive reasons, and only ones that read well in a sentence.
    .filter((c) => c.amount > 0.01 && !/^(dress|color|fitcat):/.test(c.feature))
    .slice(0, 3)
    .map((c) => {
      const label = featureLabel(c.feature);
      switch (c.source) {
        case "you":
          return `Because you like ${label}`;
        case "community":
          return `Popular with the community: ${label}`;
        case "editor":
          return `Editor's pick: ${label}`;
      }
    });
}

/**
 * Give every item in a rail a reason, preferring one that hasn't been used yet
 * in that rail. Without this, a cold-start rail says "Editor's pick: minimal
 * style" under every single card, which reads as filler.
 */
function varyReasons(items: RecItem[], state: TasteState, crowd: CrowdPrior | null): RecItem[] {
  const used = new Map<string, number>();
  return items.map((item) => {
    const options = reasonCandidates(item.piece, state, crowd);
    if (options.length === 0) return { ...item, reason: "A fresh option to try" };
    const choice = options.find((o) => (used.get(o) ?? 0) === 0) ?? options[0];
    used.set(choice, (used.get(choice) ?? 0) + 1);
    return { ...item, reason: choice };
  });
}

/** For the "explore" rail: name the thing the model knows least about. */
function noveltyReason(piece: Piece, state: TasteState): string {
  const unseen = featuresOf(piece)
    .filter((f) => !/^(dress|color|fitcat|cat):/.test(f))
    .map((f) => ({ f, n: state.n[f] ?? 0 }))
    .sort((a, b) => a.n - b.n)[0];
  return unseen ? `New to you: ${featureLabel(unseen.f)}` : "New to you";
}

/**
 * Keep the order of `items` but make sure nothing crowds the row:
 *   • at most `maxPerCategory` of each category (no eight shirts in a row),
 *   • at most MAX_PER_SHOW pieces from the same show (no row of only Michael Kors),
 *   • at most ONE piece from the same runway photo (no coat AND dress from one look),
 *   • no two pieces with the same name (a show often repeats one shoe in every look).
 * If the rules leave the row short, the best of the skipped items fill it up.
 * TWEAK MAX_PER_SHOW to allow more (or fewer) pieces from one collection per row.
 */
const MAX_PER_SHOW = 2;
function diversify<T extends { piece: Piece }>(items: T[], limit: number, maxPerCategory = 2): T[] {
  const perCategory = new Map<string, number>();
  const perShow = new Map<string, number>();
  const looks = new Set<string>();
  const titles = new Set<string>();
  const out: T[] = [];
  const skipped: T[] = [];
  for (const item of items) {
    const { category, show, look, title } = item.piece;
    if (
      (perCategory.get(category) ?? 0) >= maxPerCategory ||
      (perShow.get(show) ?? 0) >= MAX_PER_SHOW ||
      looks.has(look) ||
      titles.has(title)
    ) {
      if (!titles.has(title)) skipped.push(item);
      continue;
    }
    perCategory.set(category, (perCategory.get(category) ?? 0) + 1);
    perShow.set(show, (perShow.get(show) ?? 0) + 1);
    looks.add(look);
    titles.add(title);
    out.push(item);
    if (out.length >= limit) return out;
  }
  // Not enough variety in this pool (e.g. a narrow mood filter): top up with the best of the rest.
  for (const item of skipped) {
    if (out.length >= limit) break;
    if (!out.some((o) => o.piece.look === item.piece.look || o.piece.title === item.piece.title)) out.push(item);
  }
  return out;
}

/** "Leaning baggy fits, minimal style & earthy tones" — or an invitation. */
function headlineFor(state: TasteState): string {
  if (state.picks < 3) {
    return "Tap a mood or start with a piece — I'll learn your taste as you go.";
  }
  const { likes } = topFeatures(state, 8);
  // Skip very specific features so the headline stays readable.
  const readable = likes
    .map(([f]) => f)
    .filter((f) => /^(fit|vibe|tone|house):/.test(f))
    .slice(0, 3)
    .map(featureLabel);
  if (readable.length === 0) return "Still learning — keep picking and I'll sharpen up.";
  const last = readable.pop()!;
  const list = readable.length ? `${readable.join("; ")} and ${last}` : last;
  return `Leaning toward ${list}.`;
}

// ── The feed ────────────────────────────────────────────────────────────────

/** Build every rail for the home page. */
export function buildHomeFeed(args: FeedArgs): HomeFeed {
  const { section, state, crowd, dismissed, vibe = null, limit = 8 } = args;

  // Candidate pool: this section, not dismissed, optionally one mood.
  const pool = piecesForSection(section).filter(
    (p) => !dismissed.has(p.id) && (!vibe || p.vibes.includes(vibe)),
  );

  // Pre-compute features once per piece.
  const featureMap = new Map(pool.map((p) => [p.id, featuresOf(p)]));
  const feats = (p: Piece) => featureMap.get(p.id)!;

  const used = new Set<string>();
  const take = (items: RecItem[]) => {
    items.forEach((i) => used.add(i.piece.id));
    return items;
  };
  // The reason is filled in per rail by `varyReasons` once the rail is final.
  const toItem = (piece: Piece, score: number): RecItem => ({ piece, score, reason: "" });

  const rails: Rail[] = [];

  // 1 ── Picked for you: highest taste (+ a touch of exploration).
  // Garments lead: a look is built AROUND the piece you tap, and a tote or a
  // belt makes a weaker starting point than a jacket. (Other rails still mix
  // everything in.)
  const isGarment = (p: Piece) => p.category !== "accessories" && p.category !== "shoes";
  const garments = pool.filter(isGarment);
  const picks = diversify(
    (garments.length >= limit ? garments : pool)
      .map((p) => toItem(p, rankScore(state, feats(p), crowd, 0.3)))
      .sort((a, b) => b.score - a.score),
    limit,
  );
  rails.push({
    id: "picks",
    title: vibe ? `${VIBES[vibe].label}, picked for you` : "Picked for you",
    subtitle: state.picks < 3 ? "A curated start — it gets personal as you pick" : "Ranked by what you've been choosing",
    items: take(varyReasons(picks, state, crowd)),
  });

  // 2 ── Because you like …: more of the single strongest preference.
  if (state.picks >= 3) {
    // (`house:` included, so this can become "More Max Mara" once you keep picking one designer.)
    const top = topFeatures(state, 12).likes.find(([f]) => /^(fit|vibe|tone|type|house):/.test(f));
    if (top) {
      const [feature] = top;
      const items = diversify(
        pool
          .filter((p) => !used.has(p.id) && feats(p).includes(feature))
          .map((p) => toItem(p, taste(state, feats(p), crowd)))
          .sort((a, b) => b.score - a.score),
        limit,
        3,
      );
      if (items.length >= 3) {
        rails.push({
          id: "because",
          title: `More ${featureLabel(feature)}`,
          subtitle: "Because it keeps showing up in your picks",
          items: take(varyReasons(items, state, crowd)),
        });
      }
    }
  }

  // 3 ── Try something new: what the model knows least about.
  const explore = diversify(
    pool
      .filter((p) => !used.has(p.id))
      .map((p) => {
        const f = feats(p);
        // Mostly "unfamiliar", with a little taste so it isn't random noise.
        const score = 2 * uncertainty(state, f) + 0.3 * taste(state, f, crowd);
        return { piece: p, score, reason: noveltyReason(p, state) } satisfies RecItem;
      })
      .sort((a, b) => b.score - a.score),
    limit,
    2,
  );
  if (explore.length) {
    rails.push({
      id: "explore",
      title: "Try something new",
      subtitle: "Outside your usual — this is how the model keeps learning",
      items: take(explore),
    });
  }

  // 4 ── Community popularity, or editor's picks until there is any.
  if (crowd && crowd.users > 0) {
    const items = diversify(
      pool
        .filter((p) => !used.has(p.id))
        .map((p) => {
          const f = feats(p);
          const score = f.reduce((s, x) => s + (crowd.w[x] ?? 0), 0) / Math.sqrt(f.length);
          return { piece: p, score, reason: "" } satisfies RecItem;
        })
        .sort((a, b) => b.score - a.score),
      limit,
      2,
    );
    if (items.length) {
      rails.push({
        id: "community",
        title: "Popular right now",
        subtitle: `From ${crowd.users} ${crowd.users === 1 ? "person" : "people"} using the app`,
        items: take(varyReasons(items, state, crowd)),
      });
    }
  } else {
    const items = diversify(
      pool
        .filter((p) => !used.has(p.id))
        .map((p) => {
          const f = feats(p);
          const score = f.reduce((s, x) => s + (EDITORIAL_PRIOR[x] ?? 0), 0) / Math.sqrt(f.length);
          return { piece: p, score, reason: "" } satisfies RecItem;
        })
        .sort((a, b) => b.score - a.score),
      limit,
      2,
    );
    if (items.length) {
      rails.push({
        id: "editor",
        title: "Editor's picks",
        subtitle: "Timeless pieces to begin with",
        items: take(varyReasons(items, state, crowd)),
      });
    }
  }

  return { headline: headlineFor(state), looks: rankLooks(args), rails };
}

/**
 * Whole runway looks for the "Off the runway" row.
 * A look's score = the average taste score of its garments (accessories left
 * out — a bag shouldn't decide whether you like an outfit). At most two looks
 * per show, so one collection can't fill the row.
 */
export function rankLooks(args: FeedArgs): LookRec[] {
  const { section, state, crowd, dismissed, vibe = null, limit = 10, perShow = 2 } = args;
  const candidates = LOOKS.filter(
    (l) =>
      (l.section === section || l.section === "unisex") &&
      (!vibe || l.vibes.includes(vibe)) &&
      !l.pieces.every((p) => dismissed.has(p.id)),
  );
  const scored = candidates
    .map((look) => {
      const garments = look.pieces.filter((p) => p.category !== "accessories");
      const counted = garments.length ? garments : look.pieces;
      const score = counted.reduce((sum, p) => sum + rankScore(state, featuresOf(p), crowd, 0.2), 0) / counted.length;
      return { look, score, best: [...counted].sort((a, b) => taste(state, featuresOf(b), crowd) - taste(state, featuresOf(a), crowd))[0] };
    })
    .sort((a, b) => b.score - a.score);

  const shown = new Map<string, number>();
  const out: { look: Look; score: number; best: Piece }[] = [];
  for (const item of scored) {
    const n = shown.get(item.look.show) ?? 0;
    if (n >= perShow) continue;
    shown.set(item.look.show, n + 1);
    out.push(item);
    if (out.length >= limit) break;
  }

  // Reasons: borrow the best garment's explanation, varied across the row.
  const used = new Set<string>();
  return out.map(({ look, score, best }) => {
    const options = reasonCandidates(best, state, crowd);
    const reason = options.find((o) => !used.has(o)) ?? options[0] ?? "Straight from the runway";
    used.add(reason);
    return { look, score, reason };
  });
}

/**
 * Every garment, best first, for the endless home feed (feed/posts.ts deals
 * them out between live posts and runway looks). Accessories are left out (a
 * belt is a weak place to start a look), and the order is spread so the same
 * show never comes up twice in a row and no photo appears twice.
 */
export function rankPieces(args: FeedArgs): RecItem[] {
  const { section, state, crowd, dismissed, vibe = null } = args;
  const scored = piecesForSection(section)
    .filter((p) => p.category !== "accessories" && !dismissed.has(p.id) && (!vibe || p.vibes.includes(vibe)))
    .map((piece) => ({ piece, score: rankScore(state, featuresOf(piece), crowd, 0.3), reason: "" }))
    .sort((a, b) => b.score - a.score || a.piece.id.localeCompare(b.piece.id));

  const out: RecItem[] = [];
  const looks = new Set<string>();
  const queue = [...scored];
  while (queue.length) {
    const recentShows = out.slice(-3).map((r) => r.piece.show);
    let index = queue.findIndex((r) => !looks.has(r.piece.look) && !recentShows.includes(r.piece.show));
    if (index === -1) index = queue.findIndex((r) => !looks.has(r.piece.look));
    if (index === -1) break; // only repeats of used photos are left
    const [next] = queue.splice(index, 1);
    looks.add(next.piece.look);
    out.push(next);
  }
  return out;
}
