/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  feed/posts.ts — what goes into the never-ending home feed, in what order
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The home page is one endless wall of posts. There are four kinds:
 *
 *      live    the newest looks online — Vogue Runway, Pinterest, the houses'
 *              YouTube shows, museum archives… (live/useLiveFeed.ts)
 *      look    a whole runway look from the app's own catalog
 *      piece   one garment cut from a runway look
 *      prompt  a "Start with a coat →" tile (begins the question flow)
 *
 *  THE ORDER
 *  Each kind has its own queue, already sorted best-first by Muse (the taste
 *  model). Posts are dealt from the queues following a repeating BEAT —
 *  live, look, live, piece, … — so the wall stays varied. When a queue is
 *  empty the next one steps in. When EVERYTHING has been shown, the feed starts
 *  a new "cycle" in a different order (that's what makes it endless).
 *
 *  Only FUTURE posts follow your latest taste: what's already on screen never
 *  reshuffles under you.
 *
 *  THE SHAPES (the asymmetry)
 *  Every post gets a picture shape — tall, square, wide… — chosen from its id,
 *  so the same post always looks the same. Pinterest pins and museum photos are
 *  never cropped: they keep the picture's own shape (Pinterest's rules say pins
 *  mustn't be altered or covered).
 *
 *  TWEAK
 *    BEAT            the rhythm of kinds
 *    CAPTION_H       the caption height under each picture (must match CSS)
 *    shapeFor()      which shapes each kind can take
 */

import type { Look } from "../data/catalog";
import type { CategoryId, Piece } from "../data/types";
import { hashString } from "../lib/hash";
import type { LiveItem } from "../live/feedCore";

export type PostType = "live" | "look" | "piece" | "prompt";

/** A "Start with a coat →" tile. */
export interface PromptTile {
  category: CategoryId;
  /** "Coats", "Shirts & tops"… */
  label: string;
  /** One line, e.g. "Trench, wool, puffer". */
  hint: string;
  /** The garment Muse likes best in that category (shown behind the words). */
  piece?: Piece;
}

interface PostBase {
  /** Unique within the feed (an item can come back in a later cycle with a new key). */
  key: string;
  /** Picture width ÷ height. */
  aspect: number;
  /** 2 = a wide "feature" card (on screens with 3+ columns). */
  span: 1 | 2;
  /** Caption height in px (0 = no caption). */
  captionH: number;
  /** True = show the picture's own shape uncropped (its real aspect is measured on load). */
  natural: boolean;
}

export type Post =
  | (PostBase & { type: "live"; item: LiveItem })
  | (PostBase & { type: "look"; look: Look; reason?: string })
  | (PostBase & { type: "piece"; piece: Piece; reason?: string })
  | (PostBase & { type: "prompt"; prompt: PromptTile });

/** The queues posts are dealt from — each sorted best-first. */
export interface FeedPools {
  live: LiveItem[];
  looks: { look: Look; reason?: string }[];
  pieces: { piece: Piece; reason?: string }[];
  prompts: PromptTile[];
}

/** Where the dealer is: what has been used, and how many posts so far. */
export interface FeedCursor {
  /** "<type>:<id>" of everything dealt in the current cycle. */
  used: Set<string>;
  /** Posts dealt so far (drives the BEAT). */
  count: number;
  /** How many times everything has been shown (0 = first time round). */
  cycle: number;
}

/** Caption height under a picture, in px. Keep in step with `.feed-card-caption` in styles/feed.css. */
export const CAPTION_H = 64;

/** The rhythm of kinds. TWEAK — e.g. add more "live" for a newsier wall. */
export const BEAT: PostType[] = [
  "live", "look", "live", "piece",
  "live", "look", "prompt", "live",
  "piece", "live", "look", "live",
  "piece", "live", "look", "piece",
];

/** If a kind's queue is empty, try these instead (in order). */
const FALLBACK: Record<PostType, PostType[]> = {
  live: ["look", "piece"],
  look: ["live", "piece"],
  piece: ["look", "live"],
  prompt: ["piece", "look", "live"],
};

/** The feed's filter chips. */
export type FeedFilter = "all" | "runway" | "shows" | "street" | "pinterest" | "archive" | "garments";

export const FILTER_ORDER: FeedFilter[] = ["all", "runway", "shows", "street", "pinterest", "archive", "garments"];

export const FILTER_LABEL: Record<FeedFilter, string> = {
  all: "Everything",
  runway: "Runway",
  shows: "Shows",
  street: "Street style",
  pinterest: "Pinterest",
  archive: "Archive",
  garments: "Garments",
};

/** A fresh cursor (start of the feed). */
export function newCursor(): FeedCursor {
  return { used: new Set(), count: 0, cycle: 0 };
}

/** Keep only what a filter chip asks for. */
export function filterPools(pools: FeedPools, filter: FeedFilter): FeedPools {
  const none = { live: [], looks: [], pieces: [], prompts: [] };
  switch (filter) {
    case "all":
      return pools;
    case "runway":
      return {
        ...none,
        live: pools.live.filter((i) => i.kind === "runway"),
        looks: pools.looks.filter((l) => l.look.kind === "runway" || l.look.kind === "couture"),
      };
    case "shows":
      return { ...none, live: pools.live.filter((i) => i.kind === "show") };
    case "street":
      return { ...none, live: pools.live.filter((i) => i.kind === "street"), looks: pools.looks.filter((l) => l.look.kind === "street") };
    case "pinterest":
      return { ...none, live: pools.live.filter((i) => i.kind === "pinterest") };
    case "archive":
      return { ...none, live: pools.live.filter((i) => i.kind === "archive"), looks: pools.looks.filter((l) => l.look.kind === "archive") };
    case "garments":
      return { ...none, pieces: pools.pieces, prompts: pools.prompts };
  }
}

/** A repeatable number in [0, 1) for an id — the same id always gets the same shape. */
function unit(id: string, salt: string): number {
  return hashString(`${salt}:${id}`) / 0x100000000;
}

/** Shapes a magazine/runway story can take: tall, square, wide (a 2-column feature). */
const STORY_SHAPES: { aspect: number; span: 1 | 2 }[] = [
  { aspect: 4 / 5, span: 1 },
  { aspect: 3 / 4, span: 1 },
  { aspect: 1, span: 1 },
  { aspect: 2 / 3, span: 1 },
  { aspect: 4 / 5, span: 1 },
  { aspect: 3 / 2, span: 2 },
  { aspect: 3 / 4, span: 1 },
];

/** Decide a post's picture shape. See the file header. */
export function shapeFor(post: Pick<Post, "type"> & Partial<{ item: LiveItem; look: Look; piece: Piece; prompt: PromptTile }>): Omit<PostBase, "key"> {
  switch (post.type) {
    case "live": {
      const item = post.item!;
      if (item.video) return { aspect: 16 / 9, span: 2, captionH: CAPTION_H, natural: false };
      // The picture's real size is known (Openverse, the Pinterest API): use it.
      if (item.width && item.height) return { aspect: item.width / item.height, span: 1, captionH: CAPTION_H, natural: true };
      // Pins and museum photos keep their own shape — measured once they load.
      if (item.kind === "pinterest") return { aspect: 2 / 3, span: 1, captionH: CAPTION_H, natural: true };
      if (item.kind === "archive") return { aspect: 4 / 5, span: 1, captionH: CAPTION_H, natural: true };
      const shape = STORY_SHAPES[Math.floor(unit(item.id, "story") * STORY_SHAPES.length)];
      return { ...shape, captionH: CAPTION_H, natural: false };
    }
    case "look":
      // Mostly the full figure; sometimes a closer, top-anchored crop.
      return { aspect: unit(post.look!.id, "look") < 0.72 ? 2 / 3 : 3 / 4, span: 1, captionH: CAPTION_H, natural: false };
    case "piece":
      return { aspect: unit(post.piece!.id, "piece") < 0.5 ? 3 / 4 : 4 / 5, span: 1, captionH: CAPTION_H, natural: false };
    case "prompt":
      return { aspect: unit(post.prompt!.category, "prompt") < 0.5 ? 1 : 4 / 5, span: 1, captionH: 0, natural: false };
  }
}

/** The id an item is known by inside its queue. */
function idOf(type: PostType, pools: FeedPools, index: number): string {
  switch (type) {
    case "live":
      return pools.live[index].id;
    case "look":
      return pools.looks[index].look.id;
    case "piece":
      return pools.pieces[index].piece.id;
    case "prompt":
      return pools.prompts[index].category;
  }
}

function poolSize(type: PostType, pools: FeedPools): number {
  return type === "live" ? pools.live.length : type === "look" ? pools.looks.length : type === "piece" ? pools.pieces.length : pools.prompts.length;
}

/** Turn queue entry `index` of `type` into a post. */
function makePost(type: PostType, pools: FeedPools, index: number, cycle: number): Post {
  const suffix = cycle > 0 ? `~${cycle}` : "";
  switch (type) {
    case "live": {
      const item = pools.live[index];
      return { type, item, key: `live:${item.id}${suffix}`, ...shapeFor({ type, item }) };
    }
    case "look": {
      const { look, reason } = pools.looks[index];
      return { type, look, reason, key: `look:${look.id}${suffix}`, ...shapeFor({ type, look }) };
    }
    case "piece": {
      const { piece, reason } = pools.pieces[index];
      return { type, piece, reason, key: `piece:${piece.id}${suffix}`, ...shapeFor({ type, piece }) };
    }
    case "prompt": {
      const prompt = pools.prompts[index];
      return { type, prompt, key: `prompt:${prompt.category}${suffix}`, ...shapeFor({ type, prompt }) };
    }
  }
}

/**
 * Take the best not-yet-used entry of one kind. In later cycles the queue is
 * read from a different starting point, so a repeat pass doesn't look identical.
 */
function take(type: PostType, pools: FeedPools, cursor: FeedCursor): Post | null {
  const size = poolSize(type, pools);
  if (size === 0) return null;
  const start = cursor.cycle === 0 ? 0 : (cursor.cycle * 7) % size;
  for (let step = 0; step < size; step++) {
    const index = (start + step) % size;
    const usedKey = `${type}:${idOf(type, pools, index)}`;
    if (cursor.used.has(usedKey)) continue;
    cursor.used.add(usedKey);
    return makePost(type, pools, index, cursor.cycle);
  }
  return null;
}

/**
 * Deal the next `count` posts. Returns the posts and the moved-on cursor (the
 * cursor passed in is not changed).
 *
 * @param recycle  when everything has been shown: start a new cycle (true, the
 *                 endless home feed) or stop (false — a filtered view just ends)
 */
export function nextPosts(
  pools: FeedPools,
  cursor: FeedCursor,
  count: number,
  recycle = true,
): { posts: Post[]; cursor: FeedCursor; exhausted: boolean } {
  const next: FeedCursor = { used: new Set(cursor.used), count: cursor.count, cycle: cursor.cycle };
  const posts: Post[] = [];
  const total = poolSize("live", pools) + poolSize("look", pools) + poolSize("piece", pools) + poolSize("prompt", pools);
  if (total === 0) return { posts, cursor: next, exhausted: true };

  // With fewer than 3 items a repeat next to itself can't be avoided.
  const allowNeighbourRepeat = total < 3;
  let exhausted = false;
  let cyclesWithoutPosts = 0;
  while (posts.length < count) {
    const want = BEAT[next.count % BEAT.length];
    let post = take(want, pools, next);
    for (const alt of FALLBACK[want]) post ??= take(alt, pools, next);
    if (!post) {
      // Everything has been dealt once.
      if (!recycle || ++cyclesWithoutPosts > 2) {
        exhausted = true;
        break;
      }
      next.cycle += 1;
      next.used = new Set();
      continue;
    }
    // Never two identical items side by side across a cycle boundary.
    const prev = posts[posts.length - 1];
    if (!allowNeighbourRepeat && prev && baseKey(prev.key) === baseKey(post.key)) continue;
    posts.push(post);
    next.count += 1;
    cyclesWithoutPosts = 0;
  }
  return { posts, cursor: next, exhausted };
}

/** A post's key without its cycle suffix ("live:abc~2" → "live:abc"). */
export function baseKey(key: string): string {
  return key.replace(/~\d+$/, "");
}
