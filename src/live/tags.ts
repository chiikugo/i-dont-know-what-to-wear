/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  live/tags.ts — reading a live look's caption so Muse can learn from it
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Catalog pieces are hand-tagged (fit, colour, mood…). Live looks arrive with
 *  only a headline or caption, e.g.
 *
 *     "Petals blossom … at the Dior Summer 2027 Women's Show"
 *
 *  This file turns that text into the same "feature strings" the taste model
 *  uses for catalog pieces (model/features.ts), so tapping or dismissing a live
 *  look teaches Muse exactly like tapping a catalog piece:
 *
 *     → ["house:dior", "vibe:romantic", "kind:pinterest"]
 *
 *  It's deliberately simple word-spotting: a designer's name, a few mood words,
 *  a few colours. When it finds nothing, the look still shows — Muse just learns
 *  less from it.
 *
 *  TWEAK: add mood words to VIBE_WORDS or colours to COLOUR_WORDS.
 */

import { fold, housesIn } from "../data/houses";
import type { ColorName, Vibe } from "../data/types";
import { COLORS } from "../data/types";
import type { LiveItem } from "./feedCore";

/** Words that suggest a mood (checked as whole words, case-insensitive). */
const VIBE_WORDS: Record<Vibe, RegExp> = {
  minimal: /\b(minimal\w*|clean lines?|pared[- ]back|understated|monochrome|quiet luxury|the row|jil sander)\b/,
  classic: /\b(tailor\w*|suit(s|ing)?|blazers?|trench\w*|classic|timeless|heritage|tweed|camel coat)\b/,
  relaxed: /\b(relaxed|slouchy|oversized|knitwear|cashmere|cozy|cosy|easy|loungewear)\b/,
  street: /\b(street ?style|streetwear|sneakers?|hoodies?|skate|drops?|graphic tees?|denim)\b/,
  edgy: /\b(leather|punk|goth\w*|biker|rock|studs?|latex|dark|subversive|sheer|corset\w*)\b/,
  romantic: /\b(romantic|lace|flor(al|als)|petals?|flowers?|ruffles?|bows?|tulle|chiffon|silk|couture|gowns?|bridal|sequin\w*|feathers?)\b/,
  sporty: /\b(sport\w*|athletic|track ?suits?|activewear|running|tennis|ski|technical)\b/,
};

/** Colour words → the app's colour names (only clear, common ones). */
const COLOUR_WORDS: [RegExp, ColorName][] = [
  [/\bblack\b/, "black"],
  [/\bwhite\b/, "white"],
  [/\b(ivory|cream)\b/, "ivory"],
  [/\bcamel\b/, "camel"],
  [/\b(brown|chocolate)\b/, "brown"],
  [/\b(grey|gray)\b/, "grey"],
  [/\bnavy\b/, "navy"],
  [/\bred\b/, "red"],
  [/\b(pink|fuchsia)\b/, "pink"],
  [/\b(purple|violet|lilac)\b/, "purple"],
  [/\bgreen\b/, "green"],
  [/\b(yellow|butter)\b/, "yellow"],
  [/\borange\b/, "orange"],
  [/\b(burgundy|oxblood)\b/, "burgundy"],
  [/\b(silver|metallic)\b/, "silver"],
  [/\bgold(en)?\b/, "gold"],
  [/\bdenim\b/, "denim"],
];

/**
 * Words that make a story about LOOKS (collections, shows, street style…)
 * rather than news, beauty or shopping. TWEAK to widen or narrow what the
 * magazines' feeds contribute.
 */
const LOOK_WORDS = /\b(runway|collections?|(fashion|runway|couture|menswear|womenswear) shows?|street style|looks?|couture|ready-to-wear|resort|cruise|fashion week|lookbook|campaign|spring|summer|fall|autumn|winter|(ss|fw|aw) ?\d\d|catwalk|best dressed|red carpet)\b/;

/** Is this a story about looks? (look words, or a designer's name) */
export function isLookStory(text: string): boolean {
  const t = fold(text);
  return LOOK_WORDS.test(t) || housesIn(t).length > 0;
}

/** The searchable text of an item: title + its categories / board names. */
function textOf(item: Pick<LiveItem, "title" | "categories" | "sourceName">): string {
  return fold([item.title, ...(item.categories ?? []), item.sourceName].join(" · "));
}

/** Designers named in an item (catalog slugs where they overlap, see data/houses.ts). */
export function liveHouses(item: Pick<LiveItem, "title" | "categories" | "sourceName">): string[] {
  return housesIn(textOf(item));
}

/** Moods suggested by an item's words. */
export function liveVibes(item: Pick<LiveItem, "title" | "categories" | "sourceName">): Vibe[] {
  const text = textOf(item);
  return (Object.keys(VIBE_WORDS) as Vibe[]).filter((v) => VIBE_WORDS[v].test(text));
}

/** Colours named in an item. */
export function liveColours(item: Pick<LiveItem, "title" | "categories" | "sourceName">): ColorName[] {
  const text = textOf(item);
  return COLOUR_WORDS.filter(([re]) => re.test(text)).map(([, c]) => c);
}

/**
 * The feature strings for a live item — the same vocabulary as catalog pieces
 * (model/features.ts), so Muse's weights apply to both.
 */
export function liveFeatures(item: LiveItem): string[] {
  const features = new Set<string>();
  for (const h of liveHouses(item)) features.add(`house:${h}`);
  for (const v of liveVibes(item)) features.add(`vibe:${v}`);
  for (const c of liveColours(item)) {
    features.add(`color:${c}`);
    features.add(`tone:${COLORS[c].tone}`);
  }
  // Plain runway coverage is the default; street style, archive… are tastes of their own.
  if (item.kind === "street" || item.kind === "archive") features.add(`kind:${item.kind}`);
  if (/couture/i.test(item.title)) features.add("kind:couture");
  return [...features];
}
