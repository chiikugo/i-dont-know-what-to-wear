/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/crops.ts — cutting single garments out of a full runway photo
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  THE IDEA IN ONE PARAGRAPH
 *  Every look in the app is ONE real photo: a model on a runway, a stylish person
 *  at fashion week, or a museum piece. The photo stays on Wikimedia's servers
 *  (nothing is downloaded); the app draws it inside a 2:3 "frame" with the
 *  person standing head-to-toe in it. One frame holds several garments — a coat,
 *  trousers, boots, a bag — so instead of needing a separate photo per garment we
 *  *crop* each garment out of the frame on the fly. This file does that maths.
 *
 *  THE NUMBERS
 *  - A frame is always 2:3 (FRAME_ASPECT). Where it sits in the photo is worked
 *    out by tools/build-looks.mjs and stored per look as `frame`.
 *  - `fig` (stored per look) says where the person is inside the frame, in % of
 *    the frame: [head-top, soles, body-centre-x]. e.g. [5, 93, 50].
 *  - A garment's vertical extent is described relative to the FIGURE, not the
 *    frame: 0 = top of the head, 100 = the soles. A top usually spans 9 → 56,
 *    trousers 36 → 101, shoes 70 → 103. Because it's relative to the figure,
 *    one rule works for every photo, however it was framed.
 *  - The result of `cropBox` is a box in % of the frame: [x0, y0, x1, y1].
 *    The UI (components/Photo.tsx) turns that box into an SVG viewBox.
 *
 *  HOW TO TUNE IT
 *  - Shoes cut off too tight? Change PRESETS.shoes, e.g. [66, 104].
 *  - One particular garment framed badly? Don't touch the presets — give that
 *    garment its own span in tools/looks/looks.src.txt with "@y0-y1" (see the
 *    notes at the top of that file), then run `npm run looks`.
 *  - Want wider crops everywhere? Change CROP_ASPECT (3/4 = portrait card).
 */

/** Width ÷ height of every frame (2:3, a tall portrait). */
export const FRAME_ASPECT = 2 / 3;

/** Shape of a garment crop, width ÷ height (3:4 = a portrait card). TWEAK */
export const CROP_ASPECT = 3 / 4;

/** A box in % of the frame: [left, top, right, bottom]. */
export type Box = [number, number, number, number];

/** The whole frame (used for full looks and for museum pieces shot alone). */
export const FULL_BOX: Box = [0, 0, 100, 100];

/** The fields of a garment that decide its crop. */
export interface CropSpec {
  category: string;
  type?: string;
  length?: string;
  /** Hand-tuned vertical span in % of the figure (overrides the preset). */
  span?: [number, number];
  /** Hand-tuned horizontal centre in % of the frame (bags held to one side…). */
  xc?: number;
  /** Make the crop wider than usual (1.3 = 30% wider). */
  widen?: number;
  /** Use the whole frame (a museum garment photographed on its own). */
  full?: boolean;
}

/**
 * Default vertical span of each kind of garment, in % of the figure's height
 * (0 = head-top, 100 = soles; values outside 0–100 are fine, they're clamped).
 * TWEAK these to re-frame every garment of that kind at once.
 */
export const PRESETS: Record<string, [number, number]> = {
  top: [9, 56],
  "layer:short": [8, 60],
  "layer:long": [6, 84],
  bottom: [36, 101],
  "bottom:shorts": [36, 76],
  "skirt:mini": [36, 70],
  "skirt:midi": [36, 88],
  "skirt:maxi": [36, 101],
  "dress:mini": [8, 72],
  "dress:midi": [8, 90],
  "dress:maxi": [6, 101],
  "dress:jumpsuit": [8, 101],
  shoes: [70, 103],
  "acc:hat": [-4, 16],
  "acc:sunglasses": [0, 16],
  "acc:scarf": [8, 34],
  "acc:jewelry": [10, 30],
  "acc:belt": [28, 50],
  "acc:bag": [40, 68],
  "acc:gloves": [38, 64],
  "acc:tights": [55, 98],
  acc: [20, 60],
};

/** Layers that usually reach the knee or below (they get the long crop). */
const LONG_LAYERS = new Set(["coat", "cape", "puffer", "fur"]);

/** Which preset a garment uses. */
export function presetKey(g: CropSpec): string {
  switch (g.category) {
    case "shirts":
    case "tshirts":
    case "sweaters":
    case "hoodies":
      return "top";
    case "jackets":
      return g.type && LONG_LAYERS.has(g.type) ? "layer:long" : "layer:short";
    case "pants":
      return g.type === "shorts" ? "bottom:shorts" : "bottom";
    case "skirts":
      return `skirt:${g.length ?? "midi"}`;
    case "dresses":
      return g.type === "jumpsuit" ? "dress:jumpsuit" : `dress:${g.length ?? "midi"}`;
    case "shoes":
      return "shoes";
    case "accessories":
      return g.type && PRESETS[`acc:${g.type}`] ? `acc:${g.type}` : "acc";
    default:
      return "top";
  }
}

/** Round to one decimal place (keeps generated data readable). */
const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The crop box for one garment, in % of its frame.
 *
 * @param fig  where the person stands in the frame: [head-top, soles, centre-x] (%)
 * @param g    the garment (category/type/length + optional hand-tuned overrides)
 *
 * The box is CROP_ASPECT-shaped in pixels, tall enough to cover the garment's
 * span, and centred on the body (or on `g.xc`), kept inside the frame.
 */
export function cropBox(fig: [number, number, number], g: CropSpec): Box {
  if (g.full) return FULL_BOX;
  const [figTop, figBottom, figX] = fig;
  const span = g.span ?? PRESETS[presetKey(g)];
  const toPlate = (p: number) => figTop + ((figBottom - figTop) * p) / 100;
  const y0 = Math.max(0, toPlate(span[0]));
  const y1 = Math.min(100, toPlate(span[1]));
  const h = y1 - y0;
  // Width (in % of the frame's width) that makes the box CROP_ASPECT in pixels.
  let w = (h * CROP_ASPECT) / FRAME_ASPECT;
  if (g.widen) w *= g.widen;
  if (w > 100) w = 100;
  const xc = g.xc ?? figX;
  const x0 = Math.max(0, Math.min(100 - w, xc - w / 2));
  return [r1(x0), r1(y0), r1(x0 + w), r1(y1)];
}
