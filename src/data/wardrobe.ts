/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/wardrobe.ts — the taxonomy: sections, categories, and the questions
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE IS
 *  catalog.ts holds the *garments* (cut from runway photos). This file holds the *structure and wording*
 *  around them:
 *
 *    1. SECTIONS   – menswear / womenswear and their taglines.
 *    2. CATEGORIES – Shirts, Pants, Shoes… which slot each fills, which
 *                    section lists it, and WHICH QUESTIONS to ask, in order.
 *    3. COPY       – the labels and one-line blurbs shown on each option card
 *                    ("Slim fit — close to the body").
 *
 *  HOW THE QUESTION FLOW USES IT
 *  When you tap "Shirts", the builder walks that category's `chain`:
 *      chain: ["fit", "tone", "vibe", "house"]
 *  and for each facet shows one question ("Slim fit or baggy?" … "Whose
 *  runway?"). The *options* offered are not typed
 *  in here — they are discovered from the catalog (so you can never be offered
 *  a choice that has no photo). This file only supplies the wording.
 *
 *  COMMON CHANGES
 *  - Reword a label            → edit FIT_COPY / TYPE_COPY / TONE_COPY below.
 *  - Ask questions in another order, or ask fewer → edit a category's `chain`.
 *  - Add a whole new category  → add its id to CategoryId in types.ts, add an
 *                                 entry in CATEGORIES, then tag garments with
 *                                 it in tools/looks/looks.src.txt.
 */

import { houseInfo } from "./shows";
import type { Answers, CategoryId, FacetKey, Fit, Section, Slot, Tone, Vibe } from "./types";
import { VIBES } from "./types";

// ── Sections ────────────────────────────────────────────────────────────────

export interface SectionDef {
  id: Section;
  /** Big label on the gate and top bar. */
  label: string;
  /** Short form for tight spaces (the phone header). */
  short: string;
  /** One line under the label on the gate. */
  tagline: string;
  /** Used inside sentences: "for menswear". */
  noun: string;
}

/** The two starting points. */
export const SECTIONS: Record<Section, SectionDef> = {
  menswear: {
    id: "menswear",
    label: "Menswear",
    short: "Men",
    tagline: "Shirts, tailoring, denim & street",
    noun: "menswear",
  },
  womenswear: {
    id: "womenswear",
    label: "Womenswear",
    short: "Women",
    tagline: "Dresses, tailoring, knits & more",
    noun: "womenswear",
  },
};

/** Convenience: ["menswear", "womenswear"]. */
export const SECTION_IDS: Section[] = ["menswear", "womenswear"];

// ── Option wording ──────────────────────────────────────────────────────────

/** The label + one-line blurb shown on an option card. */
export interface OptionCopy {
  label: string;
  blurb: string;
}

/**
 * Wording for the "tone" question. Shared by all categories.
 * (The swatches shown next to these come from the real pieces' colours.)
 */
export const TONE_COPY: Record<Tone, OptionCopy> = {
  light: { label: "Light & airy", blurb: "Whites, creams and soft pastels" },
  dark: { label: "Dark & sharp", blurb: "Black, navy and charcoal" },
  earth: { label: "Earthy", blurb: "Camel, olive, brown and rust" },
  bold: { label: "Bold", blurb: "One proper statement colour" },
  denim: { label: "Denim blue", blurb: "Washed, faded or indigo" },
};

/**
 * Wording for the "fit" question, per category.
 * The three values map to Fit = slim | regular | baggy, but each garment has
 * its own vocabulary ("fitted tee" vs "slim jeans" vs "flowy dress").
 */
export const FIT_COPY: Record<CategoryId, Record<Fit, OptionCopy>> = {
  shirts: {
    slim: { label: "Slim fit", blurb: "Close to the body, sharp through the shoulder" },
    regular: { label: "Regular", blurb: "Classic cut with room to move" },
    baggy: { label: "Baggy", blurb: "Loose, boxy and relaxed" },
  },
  tshirts: {
    slim: { label: "Fitted", blurb: "Follows your shape" },
    regular: { label: "Classic", blurb: "Straight and easy" },
    baggy: { label: "Oversized", blurb: "Dropped shoulders, extra room" },
  },
  sweaters: {
    slim: { label: "Slim knit", blurb: "Trim and tidy" },
    regular: { label: "Relaxed", blurb: "Soft with a little give" },
    baggy: { label: "Oversized", blurb: "Chunky and slouchy" },
  },
  hoodies: {
    slim: { label: "Fitted", blurb: "Streamlined and neat" },
    regular: { label: "Regular", blurb: "True to size" },
    baggy: { label: "Oversized", blurb: "Heavyweight and slouchy" },
  },
  jackets: {
    slim: { label: "Tailored", blurb: "Sharp, fitted lines" },
    regular: { label: "Regular", blurb: "Easy structure" },
    baggy: { label: "Oversized", blurb: "Roomy statement layer" },
  },
  pants: {
    slim: { label: "Slim", blurb: "Tapered and close to the leg" },
    regular: { label: "Straight", blurb: "Classic straight leg" },
    baggy: { label: "Wide & baggy", blurb: "Loose through the leg" },
  },
  skirts: {
    slim: { label: "Fitted", blurb: "Follows the body" },
    regular: { label: "A-line", blurb: "Skims, then flares" },
    baggy: { label: "Flowy", blurb: "Full and swishy" },
  },
  dresses: {
    slim: { label: "Fitted", blurb: "Hugs your shape" },
    regular: { label: "Easy", blurb: "Skims the body" },
    baggy: { label: "Flowy", blurb: "Volume and movement" },
  },
  shoes: {
    slim: { label: "Sleek", blurb: "Low-profile and refined" },
    regular: { label: "Classic", blurb: "Everyday proportions" },
    baggy: { label: "Chunky", blurb: "Bold, substantial sole" },
  },
  accessories: {
    slim: { label: "Delicate", blurb: "Fine and understated" },
    regular: { label: "Classic", blurb: "Everyday proportions" },
    baggy: { label: "Statement", blurb: "Big and bold" },
  },
};

/**
 * Wording for the "type" question. Keyed by the `type` string used in
 * tools/looks/looks.src.txt. A value missing here still works — it just falls back to a
 * capitalised version of the raw value (see `typeCopy` below).
 */
export const TYPE_COPY: Record<string, OptionCopy> = {
  // jackets & coats
  blazer: { label: "Blazer", blurb: "Tailored polish" },
  coat: { label: "Coat", blurb: "Long and structured" },
  // (`leather` and `denim` are used by jackets AND pants — one entry covers both.)
  leather: { label: "Leather", blurb: "Instant edge" },
  bomber: { label: "Bomber", blurb: "Easy and sporty" },
  utility: { label: "Utility", blurb: "Field jackets & technical shells" },
  denim: { label: "Denim", blurb: "Worn-in and versatile" },
  cape: { label: "Cape", blurb: "Drama from the shoulders" },
  puffer: { label: "Puffer", blurb: "Quilted volume" },
  fur: { label: "Fur & shearling", blurb: "Plush texture" },
  vest: { label: "Vest", blurb: "A sleeveless layer" },
  // pants
  tailored: { label: "Trousers", blurb: "Cut and pressed" },
  leggings: { label: "Leggings", blurb: "Close and streamlined" },
  track: { label: "Track pants", blurb: "Sporty and relaxed" },
  cargo: { label: "Cargo", blurb: "Utility pockets" },
  shorts: { label: "Shorts", blurb: "Above the knee" },
  // hoodies
  pullover: { label: "Pullover", blurb: "The classic" },
  zip: { label: "Zip-up", blurb: "Open or closed" },
  // dresses
  jumpsuit: { label: "Jumpsuit", blurb: "One piece, head to toe" },
  // shoes
  boots: { label: "Boots", blurb: "Ground the look" },
  heels: { label: "Heels", blurb: "Height and drama" },
  sneakers: { label: "Sneakers", blurb: "Walkable and easy" },
  loafers: { label: "Loafers", blurb: "Smart without trying" },
  dress: { label: "Dress shoes", blurb: "Polished brogues & derbies" },
  sandals: { label: "Sandals", blurb: "Open and easy" },
  // accessories
  bag: { label: "Bag", blurb: "Carry it well" },
  belt: { label: "Belt", blurb: "Define the waist" },
  hat: { label: "Hat", blurb: "Beanies, fedoras & wide brims" },
  sunglasses: { label: "Sunglasses", blurb: "Instant finish" },
  scarf: { label: "Scarf", blurb: "Texture at the neck" },
  tights: { label: "Tights", blurb: "Colour on the legs" },
};

/** Wording for the "length" question (skirts and dresses). */
export const LENGTH_COPY: Record<string, OptionCopy> = {
  mini: { label: "Mini", blurb: "Above the knee" },
  midi: { label: "Midi", blurb: "Mid-calf, endlessly wearable" },
  maxi: { label: "Maxi", blurb: "Floor-skimming drama" },
};

/** Prompt (the question text) for each facet. Some depend on the category. */
export function questionPrompt(key: FacetKey, category: CategoryId): string {
  switch (key) {
    case "fit":
      return "Slim fit or baggy?";
    case "tone":
      return "Which tone feels right?";
    case "vibe":
      return "What's the mood?";
    case "house":
      return "Whose runway?";
    case "length":
      return category === "skirts" ? "Mini, midi or maxi?" : "How long do you want it?";
    case "type":
      switch (category) {
        case "jackets":
          return "Which kind of layer?";
        case "pants":
          return "Which kind of pant?";
        case "hoodies":
          return "Pullover or zip-up?";
        case "shoes":
          return "What's on your feet?";
        case "accessories":
          return "Which finishing touch?";
        default:
          return "Which kind?";
      }
  }
}

/** A short word for the progress chips: "Baggy", "Earthy", "Denim"… */
export function answerLabel(key: FacetKey, value: string, category: CategoryId): string {
  return optionCopy(key, value, category).label;
}

/**
 * The label/blurb for ANY facet value. This is the one function the UI calls
 * when it needs wording for an option.
 */
export function optionCopy(key: FacetKey, value: string, category: CategoryId): OptionCopy {
  switch (key) {
    case "fit":
      return FIT_COPY[category][value as Fit] ?? fallbackCopy(value);
    case "tone":
      return TONE_COPY[value as Tone] ?? fallbackCopy(value);
    case "vibe":
      return VIBES[value as Vibe] ?? fallbackCopy(value);
    case "length":
      return LENGTH_COPY[value] ?? fallbackCopy(value);
    case "type":
      return TYPE_COPY[value] ?? fallbackCopy(value);
    case "house": {
      // The value is a house slug ("michael-kors"); the wording comes from data/shows.ts.
      const info = houseInfo(value);
      return { label: info.house, blurb: info.seasons };
    }
  }
}

function fallbackCopy(value: string): OptionCopy {
  return { label: value.charAt(0).toUpperCase() + value.slice(1), blurb: "" };
}

// ── Categories ──────────────────────────────────────────────────────────────

export interface CategoryDef {
  id: CategoryId;
  /** Which slot of the outfit it fills. */
  slot: Slot;
  /** Which sections list this category as a starting point. */
  sections: Section[];
  /** Default label (pills, headings). */
  label: string;
  /** Per-section label override, e.g. womenswear "Shirts" → "Shirts & tops". */
  labelBySection?: Partial<Record<Section, string>>;
  /** One-liner under the label. */
  hint: string;
  /**
   * The questions to ask, in order. Each facet is skipped automatically if the
   * catalog has only one possible answer left (nothing to choose between).
   * TWEAK: reorder or shorten to change how long the flow is.
   */
  chain: FacetKey[];
  /**
   * Default "focus" for cropping photos in tall cards (CSS object-position).
   * Runway pieces are cropped exactly (data/crops.ts); this is only used for
   * outfits saved before the runway catalog, whose photos are whole images.
   */
  focus: string;
}

/** Every category the app knows. */
export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  shirts: {
    id: "shirts",
    slot: "top",
    sections: ["menswear", "womenswear"],
    label: "Shirts",
    labelBySection: { womenswear: "Shirts & tops" },
    hint: "Shirts, blouses & bustiers",
    chain: ["fit", "tone", "vibe", "house"],
    focus: "50% 28%",
  },
  tshirts: {
    id: "tshirts",
    slot: "top",
    sections: ["menswear", "womenswear"],
    label: "Tees & tanks",
    hint: "Jersey, henleys & tanks",
    chain: ["fit", "tone", "vibe", "house"],
    focus: "50% 30%",
  },
  sweaters: {
    id: "sweaters",
    slot: "top",
    sections: ["menswear", "womenswear"],
    label: "Knitwear",
    hint: "Knits & cardigans",
    chain: ["fit", "tone", "vibe", "house"],
    focus: "50% 30%",
  },
  hoodies: {
    id: "hoodies",
    slot: "top",
    sections: ["menswear", "womenswear"],
    label: "Hoodies & sweats",
    hint: "Runway sportswear",
    chain: ["type", "fit", "tone", "house"],
    focus: "50% 30%",
  },
  jackets: {
    id: "jackets",
    slot: "layer",
    sections: ["menswear", "womenswear"],
    label: "Jackets & coats",
    hint: "Outer layers",
    chain: ["type", "fit", "tone", "house"],
    focus: "50% 35%",
  },
  pants: {
    id: "pants",
    slot: "bottom",
    sections: ["menswear", "womenswear"],
    label: "Pants & jeans",
    hint: "Trousers, denim & shorts",
    chain: ["type", "fit", "tone", "house"],
    focus: "50% 68%",
  },
  skirts: {
    id: "skirts",
    slot: "bottom",
    sections: ["womenswear"],
    label: "Skirts",
    hint: "Mini to maxi",
    chain: ["length", "fit", "tone", "house"],
    focus: "50% 62%",
  },
  dresses: {
    id: "dresses",
    slot: "onepiece",
    sections: ["womenswear"],
    label: "Dresses",
    hint: "One-and-done",
    chain: ["length", "fit", "tone", "house"],
    focus: "50% 45%",
  },
  shoes: {
    id: "shoes",
    slot: "shoes",
    sections: ["menswear", "womenswear"],
    label: "Shoes",
    hint: "Start from the ground up",
    chain: ["type", "tone", "house"],
    focus: "50% 50%",
  },
  accessories: {
    id: "accessories",
    slot: "accessory",
    sections: ["menswear", "womenswear"],
    label: "Accessories",
    hint: "Bags, hats & more",
    chain: ["type", "tone", "house"],
    focus: "50% 50%",
  },
};

/** Categories listed on the home page for a section, in display order. */
export const CATEGORY_ORDER: CategoryId[] = [
  "shirts",
  "tshirts",
  "sweaters",
  "hoodies",
  "jackets",
  "pants",
  "skirts",
  "dresses",
  "shoes",
  "accessories",
];

/** The categories a section can start from (in display order). */
export function categoriesFor(section: Section): CategoryDef[] {
  return CATEGORY_ORDER.map((id) => CATEGORIES[id]).filter((c) => c.sections.includes(section));
}

/** The display label for a category within a section. */
export function categoryLabel(category: CategoryId, section: Section): string {
  const def = CATEGORIES[category];
  return def.labelBySection?.[section] ?? def.label;
}

/** Which slot a category fills. */
export function slotOf(category: CategoryId): Slot {
  return CATEGORIES[category].slot;
}

/** Friendly slot names for the look board. */
export const SLOT_LABEL: Record<Slot, string> = {
  layer: "Layer",
  top: "Top",
  onepiece: "One-piece",
  bottom: "Bottom",
  shoes: "Shoes",
  accessory: "Finishing touch",
};

/** Type helper: the `Answers` of a facet chain as a readable list of [key, value]. */
export function answerEntries(answers: Answers): [FacetKey, string][] {
  return (Object.entries(answers) as [FacetKey, string | undefined][])
    .filter((entry): entry is [FacetKey, string] => typeof entry[1] === "string");
}
