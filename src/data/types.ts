/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/types.ts — the shared vocabulary of the whole app
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS FILE IS
 *  Every other file talks about "a piece", "a fit", "a vibe", "a slot"… This file
 *  is where those words are defined once, so TypeScript can catch typos
 *  everywhere else (e.g. writing "baggie" instead of "baggy" is a compile error).
 *
 *  HOW TO READ IT
 *  - `type Foo = "a" | "b"` means "a Foo is exactly one of these strings".
 *  - `interface Foo { x: number }` describes the shape of an object.
 *  - Anything marked `// TWEAK` is something you can safely change/extend.
 *
 *  THE BIG IDEAS (a 60-second glossary)
 *  - Section   : menswear | womenswear. The very first choice on the home page.
 *  - Category  : a kind of garment the user can start from (Shirts, Pants, …).
 *  - Slot      : the *place* on the body a garment fills (top, bottom, shoes…).
 *                An outfit is "one piece per slot". Several categories can share
 *                a slot (shirts + t-shirts + sweaters are all `top`).
 *  - Runway look : one real photo (a model on a runway, a stylish person at
 *                fashion week, or a museum piece). See data/looks.generated.ts.
 *  - Piece     : one concrete garment in the catalog = one crop of a runway
 *                look + its tags. A single runway look gives several pieces.
 *  - Facet     : a question we can ask about a piece (fit, tone, vibe, type…).
 *  - Look      : a complete outfit the user builds (one piece in each slot).
 *
 *  If you add a new value (say a new colour), add it here first, then the
 *  compiler will point you at every other place that needs updating.
 */

// ── Sections ────────────────────────────────────────────────────────────────

/** The two worlds the user can start in. */
export type Section = "menswear" | "womenswear";

/**
 * Which section(s) a catalog piece appears in.
 * `unisex` pieces (sneakers, watches, beanies…) show up for both sections.
 */
export type PieceSection = Section | "unisex";

// ── Slots & categories ──────────────────────────────────────────────────────

/**
 * The place on the body a garment goes. An outfit needs:
 *   (top + bottom) OR (onepiece), plus shoes. `layer` and `accessory` are
 *   optional extras.
 */
export type Slot = "layer" | "top" | "onepiece" | "bottom" | "shoes" | "accessory";

/**
 * The order slots are drawn in, head-to-toe. Used by the look board and the
 * runway line-up so they always read like a person standing up.
 */
export const SLOT_ORDER: Slot[] = ["layer", "top", "onepiece", "bottom", "shoes", "accessory"];

/** The garment categories a user can start from. (Skirts/dresses = womenswear.) */
export type CategoryId =
  | "shirts"
  | "tshirts"
  | "sweaters"
  | "hoodies"
  | "jackets"
  | "pants"
  | "skirts"
  | "dresses"
  | "shoes"
  | "accessories";

// ── Piece attributes ────────────────────────────────────────────────────────

/**
 * How a garment sits on the body. Deliberately only three values so that
 * different categories can be compared with each other:
 *   slim    = close to the body   (fitted, skinny, tailored)
 *   regular = straight / classic  (boxy, straight-leg, A-line)
 *   baggy   = loose or oversized  (wide-leg, flowy, oversized)
 */
export type Fit = "slim" | "regular" | "baggy";

/** Display / matching order for fits. */
export const FIT_ORDER: Fit[] = ["slim", "regular", "baggy"];

/**
 * Colour families. Matching uses these (not individual colours) because
 * "does olive go with cream?" is really "does earth go with light?".
 */
export type Tone = "light" | "dark" | "earth" | "bold" | "denim";

/** Display order for tones in the "which tone?" question. */
export const TONE_ORDER: Tone[] = ["light", "dark", "earth", "bold", "denim"];

/**
 * Every colour name used by the catalog. Add a new one here AND in COLORS below.
 * (Keeping this a closed list means a typo in catalog.ts is caught instantly.)
 */
export type ColorName =
  | "white" | "ivory" | "cream" | "beige" | "grey" | "pale-blue" | "blush" | "silver" | "mint"
  | "black" | "charcoal" | "navy" | "forest"
  | "camel" | "tan" | "brown" | "olive" | "sage" | "rust" | "khaki" | "taupe" | "mustard"
  | "burgundy" | "red" | "cobalt" | "purple" | "lavender" | "orange" | "yellow" | "pink" | "teal" | "green"
  | "periwinkle" | "turquoise" | "gold" | "print"
  | "denim" | "light-denim";

/**
 * Each colour → a display hex (used for swatches and the runway palette) and
 * the tone family it belongs to (used for outfit matching).
 *
 * TWEAK: to re-classify a colour, change its `tone`. Everything that reasons
 * about colour (engine, taste model, filters) updates automatically.
 */
export const COLORS: Record<ColorName, { hex: string; tone: Tone; label: string }> = {
  white:        { hex: "#F7F5F0", tone: "light", label: "white" },
  ivory:        { hex: "#EEE6D4", tone: "light", label: "ivory" },
  cream:        { hex: "#E9DFC8", tone: "light", label: "cream" },
  beige:        { hex: "#D6C3A3", tone: "light", label: "beige" },
  grey:         { hex: "#A9A9A8", tone: "light", label: "grey" },
  "pale-blue":  { hex: "#B9CBE0", tone: "light", label: "pale blue" },
  blush:        { hex: "#E8C4BE", tone: "light", label: "blush" },
  silver:       { hex: "#C4C7CC", tone: "light", label: "silver" },
  mint:         { hex: "#AEE3C6", tone: "light", label: "mint" },

  black:        { hex: "#151515", tone: "dark", label: "black" },
  charcoal:     { hex: "#3D3D40", tone: "dark", label: "charcoal" },
  navy:         { hex: "#1E2A47", tone: "dark", label: "navy" },
  forest:       { hex: "#2B4437", tone: "dark", label: "forest green" },

  camel:        { hex: "#B98B5A", tone: "earth", label: "camel" },
  tan:          { hex: "#C9A27A", tone: "earth", label: "tan" },
  brown:        { hex: "#6B4A2E", tone: "earth", label: "brown" },
  olive:        { hex: "#6B6B3A", tone: "earth", label: "olive" },
  sage:         { hex: "#A3AD8F", tone: "earth", label: "sage" },
  rust:         { hex: "#A4512D", tone: "earth", label: "rust" },
  khaki:        { hex: "#B7A57C", tone: "earth", label: "khaki" },
  taupe:        { hex: "#9C8A7D", tone: "earth", label: "taupe" },
  mustard:      { hex: "#C8961E", tone: "earth", label: "mustard" },

  burgundy:     { hex: "#5E1F2B", tone: "bold", label: "burgundy" },
  red:          { hex: "#C8372D", tone: "bold", label: "red" },
  cobalt:       { hex: "#2E5BBA", tone: "bold", label: "cobalt" },
  purple:       { hex: "#6D4BB0", tone: "bold", label: "purple" },
  lavender:     { hex: "#A794D8", tone: "bold", label: "lavender" },
  orange:       { hex: "#E8772E", tone: "bold", label: "orange" },
  yellow:       { hex: "#E9C33B", tone: "bold", label: "yellow" },
  pink:         { hex: "#E0749F", tone: "bold", label: "pink" },
  teal:         { hex: "#1E7F86", tone: "bold", label: "teal" },
  green:        { hex: "#2E8B57", tone: "bold", label: "green" },
  periwinkle:   { hex: "#7E8CCF", tone: "bold", label: "periwinkle" },
  turquoise:    { hex: "#22A5D8", tone: "bold", label: "turquoise" },
  gold:         { hex: "#C9A44C", tone: "bold", label: "gold" },
  // "print" = a multi-colour pattern (florals, animal, graphic) with no single
  // base colour. It counts as a statement (bold) for matching; swatches for it
  // are drawn as a little striped chip (see `.chip-dot.is-print` in base.css).
  print:        { hex: "#8E6F8A", tone: "bold", label: "print" },

  denim:        { hex: "#4C6A92", tone: "denim", label: "denim" },
  "light-denim":{ hex: "#8FA8C8", tone: "denim", label: "light denim" },
};

/**
 * The "mood" of a piece. A piece can have several. These are what the home page
 * vibe chips are made of, and what the taste model learns about most quickly.
 */
export type Vibe = "minimal" | "classic" | "relaxed" | "street" | "edgy" | "romantic" | "sporty";

/** Display order + friendly copy for vibes. TWEAK the blurbs freely. */
export const VIBES: Record<Vibe, { label: string; blurb: string }> = {
  minimal:  { label: "Minimal",  blurb: "Clean lines, quiet colour" },
  classic:  { label: "Classic",  blurb: "Tailored, timeless, polished" },
  relaxed:  { label: "Relaxed",  blurb: "Soft, easy, weekend-ready" },
  street:   { label: "Street",   blurb: "Oversized, graphic, urban" },
  edgy:     { label: "Edgy",     blurb: "Dark, sharp, a little rebellious" },
  romantic: { label: "Romantic", blurb: "Flowy, soft, expressive" },
  sporty:   { label: "Sporty",   blurb: "Athletic-leaning and easy" },
};

/** Display order of vibes. */
export const VIBE_ORDER: Vibe[] = ["minimal", "classic", "relaxed", "street", "edgy", "romantic", "sporty"];

/**
 * How dressed-up a piece is: 1 = loungewear … 3 = smart casual … 5 = black tie.
 * The engine keeps every piece in a look within about one step of the others.
 */
export type Formality = 1 | 2 | 3 | 4 | 5;

/** Human names for the formality scale (used on the runway card). */
export const FORMALITY_LABEL: Record<Formality, string> = {
  1: "Loungewear easy",
  2: "Everyday casual",
  3: "Smart casual",
  4: "Dressed up",
  5: "Black-tie sharp",
};

// ── Facets (the "questions") ────────────────────────────────────────────────

/**
 * A facet is one attribute we can ask the user about. The order they are asked
 * in is defined per category in data/wardrobe.ts (see `chain`).
 *   type   = the kind of thing (denim / blazer / sneakers / bag …)
 *   length = mini / midi / maxi (skirts and dresses)
 *   fit    = slim / regular / baggy
 *   tone   = light / dark / earth / bold / denim
 *   vibe   = the mood
 *   house  = whose runway it came from ("Michael Kors", "Max Mara", "Street style"…)
 */
export type FacetKey = "type" | "length" | "fit" | "tone" | "vibe" | "house";

/**
 * The user's answers so far for one garment, e.g. `{ fit: "baggy", tone: "light" }`.
 * Each key is optional because the user can skip a question.
 */
export type Answers = Partial<Record<FacetKey, string>>;

// ── The catalog item ────────────────────────────────────────────────────────

/**
 * Who took a photo and under which licence — shown under every large image.
 *
 * Our runway photos come from Wikimedia Commons under Creative Commons licences
 * (CC BY / CC BY-SA / CC0). Those licences require naming the author, the
 * licence (with a link), the source, and saying if we changed the image (we crop
 * it). `CommonsCredit` holds exactly that.
 */
export interface CommonsCredit {
  /** The author as Commons lists them, e.g. "Christopher Macsurak". */
  author: string;
  /** The original file title, e.g. "Michael Kors Fall-Winter 2010 016.jpg". */
  title: string;
  /** Short licence name, e.g. "CC BY 2.0". */
  license: string;
  /** Link to the licence text. */
  licenseUrl: string;
  /** Link to the file's page on Wikimedia Commons. */
  source: string;
}

/**
 * The credit shape of the PREVIOUS catalog (Unsplash photos). The app no longer
 * uses Unsplash, but outfits saved in someone's closet before the switch still
 * carry this shape, so we keep it to display them correctly.
 */
export interface LegacyUnsplashCredit {
  by: string;
  handle: string;
  unsplashId: string;
}

/** Any photo credit the app can display. */
export type Credit = CommonsCredit | LegacyUnsplashCredit;

/** What kind of photo a look is. */
export type LookKind = "runway" | "couture" | "street" | "archive";

/**
 * A crop box in % of a look's frame: [left, top, right, bottom].
 * (Same as `Box` in data/crops.ts — repeated here so this file has no imports.)
 */
export type CropBox = [number, number, number, number];

/**
 * ONE garment in the catalog = one crop of a runway photo + the tags describing it.
 * The rows are built in data/catalog.ts from the looks in data/looks.generated.ts.
 */
export interface Piece {
  /** Stable unique id, e.g. "kors10-016/jackets-blazer". Saved outfits reference this. */
  id: string;
  /** The look (photo) this garment was cut from, e.g. "kors10-016". */
  look: string;
  /** The show it walked in (a key of SHOWS in data/shows.ts), e.g. "kors-fw10". */
  show: string;
  /** Where in the look's photo the garment is (see data/crops.ts). */
  crop: CropBox;
  /** Where it appears. `unisex` shows in both sections. */
  section: PieceSection;
  /** Which category it belongs to. */
  category: CategoryId;
  /** Short editorial name shown under the photo. */
  title: string;
  /** slim / regular / baggy. (Accessories just use "regular".) */
  fit: Fit;
  /** One of the colour names above (its tone is looked up from COLORS). */
  color: ColorName;
  /** One or more moods. */
  vibes: Vibe[];
  /** 1 (loungewear) … 5 (black tie). */
  formality: Formality;
  /** Category-specific kind: "denim", "blazer", "sneakers", "bag", "pullover"… */
  type?: string;
  /** Skirts & dresses only: "mini" | "midi" | "maxi". */
  length?: string;
  /** The look (photo) to show = the look id; components/Photo.tsx finds its hot-link. */
  image: string;
  /** Photographer + licence. */
  credit: CommonsCredit;
}

// ── Runway looks (the photos the catalog is cut from) ───────────────────────

/** One garment as listed in a runway look, before it becomes a `Piece`. */
export interface GarmentSource {
  category: CategoryId;
  /** Kind within the category ("blazer", "boots", "bag"…). */
  type?: string;
  /** Skirts & dresses: "mini" | "midi" | "maxi". */
  length?: string;
  fit: Fit;
  color: ColorName;
  title: string;
  /** Optional hand-tuned crop (see data/crops.ts). */
  span?: [number, number];
  xc?: number;
  widen?: number;
  full?: boolean;
}

/**
 * Where a photo lives online. The app shows it straight from Wikimedia's
 * servers ("hot-linking") — nothing is downloaded into this project.
 */
export interface HostedPhoto {
  /**
   * Thumbnail address with "{w}" where the width goes, e.g.
   * ".../thumb/f/fb/X.jpg/{w}px-X.jpg". Only Wikimedia's standard widths work
   * (see THUMB_WIDTHS in lib/imageUrl.ts).
   */
  src: string;
  /** The original photo's size in pixels. */
  width: number;
  height: number;
}

/** One real photo and what's in it. Generated into data/looks.generated.ts. */
export interface LookSource {
  /** e.g. "kors10-016". Pieces are named after it ("kors10-016/shoes-boots"). */
  id: string;
  /** Key of the show in data/shows.ts. */
  show: string;
  section: PieceSection;
  vibes: Vibe[];
  formality: Formality;
  /** The photo, hot-linked from Wikimedia Commons. */
  photo: HostedPhoto;
  /**
   * The 2:3 "frame" around the person, as FRACTIONS of the photo:
   * [left, top, width, height]. May overhang the photo's sides for narrow photos.
   */
  frame: [number, number, number, number];
  /** Where the person stands inside the frame (%): [head-top, soles, centre-x]. */
  fig: [number, number, number];
  credit: CommonsCredit;
  garments: GarmentSource[];
}

// ── Looks and saved outfits ─────────────────────────────────────────────────

/**
 * What we store about a piece inside a saved outfit. It is a *snapshot*
 * (copy) rather than just an id, so a closet entry still looks right even if
 * you later edit or remove that piece from catalog.ts.
 */
export interface PieceSnapshot {
  id: string;
  title: string;
  category: CategoryId;
  fit: Fit;
  color: ColorName;
  tone: Tone;
  vibes: Vibe[];
  formality: Formality;
  type?: string;
  length?: string;
  /**
   * A look id for runway pieces, or an Unsplash id ("photo-…") for outfits saved
   * before the runway catalog. components/Photo.tsx handles both.
   */
  image: string;
  /** Where the garment sits in its look's frame (runway pieces only). */
  crop?: CropBox;
  /** The look / show it came from (runway pieces only). */
  look?: string;
  show?: string;
  credit: Credit;
}

/** A complete outfit: one snapshot per filled slot. */
export type LookSlots = Partial<Record<Slot, PieceSnapshot>>;

/** A saved outfit, as stored in the Closet (locally and/or in Supabase). */
export interface Outfit {
  /** UUID generated in the browser. */
  id: string;
  /** User-editable name, defaults to the generated look name. */
  name: string;
  section: Section;
  /** The pieces. */
  slots: LookSlots;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  /**
   * Local-only bookkeeping: false means "not yet confirmed in Supabase".
   * (It is never sent to the database.)
   */
  synced?: boolean;
}
