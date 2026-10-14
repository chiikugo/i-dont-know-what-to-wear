/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/imageUrl.ts — where photos are loaded from (nothing is downloaded)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  RUNWAY LOOKS (the catalog)
 *  Every runway photo stays on Wikimedia Commons and is shown straight from
 *  Wikimedia's image servers. A look stores its address with "{w}" where the
 *  width goes; `commonsThumb()` fills in a size that suits the screen.
 *
 *  Wikimedia only serves a fixed set of thumbnail widths — anything else is
 *  refused (HTTP 400) — and never a thumbnail wider than the original. Both
 *  rules live in `pickThumbWidth()`.
 *
 *  `frameViewBox()` is the maths that crops a garment out of a photo: it turns
 *  "this garment, inside this look's frame" into an SVG viewBox over the photo.
 *
 *  LEGACY UNSPLASH IMAGES
 *  Before the runway catalog, the app used Unsplash photos. Outfits saved in
 *  someone's closet back then still point at them ("photo-…" ids), so the old
 *  helpers stay below to display those outfits.
 */

import type { Credit, CropBox, HostedPhoto, LegacyUnsplashCredit } from "../data/types";

/** Thumbnail widths Wikimedia serves (others return an error). TWEAK only if Wikimedia changes. */
export const THUMB_WIDTHS = [330, 500, 960, 1280, 1920] as const;

/**
 * The thumbnail width to request: the smallest standard width that gives at
 * least `neededPx` pixels, never wider than the original photo.
 */
export function pickThumbWidth(neededPx: number, originalWidth: number): number {
  const allowed = THUMB_WIDTHS.filter((w) => w < originalWidth);
  if (allowed.length === 0) return THUMB_WIDTHS[0];
  return allowed.find((w) => w >= neededPx) ?? allowed[allowed.length - 1];
}

/** The hot-link address of a photo at a given width. */
export function commonsThumb(photo: HostedPhoto, width: number): string {
  return photo.src.replace("{w}", String(width));
}

/**
 * The SVG viewBox that shows `crop` (a box in % of the look's frame) from the
 * photo, in the photo's own pixel units — plus how many of the photo's pixels
 * the crop is wide (used to pick a thumbnail size).
 *
 *   frame = [left, top, width, height] as fractions of the photo
 *   crop  = [x0, y0, x1, y1] in % of the frame
 */
export function frameViewBox(
  photo: HostedPhoto,
  frame: [number, number, number, number],
  crop: CropBox,
): { viewBox: string; cropWidthPx: number } {
  const [fl, ft, fw, fh] = frame;
  const [x0, y0, x1, y1] = crop;
  const W = photo.width;
  const H = photo.height;
  const x = (fl + (fw * x0) / 100) * W;
  const y = (ft + (fh * y0) / 100) * H;
  const w = ((fw * (x1 - x0)) / 100) * W;
  const h = ((fh * (y1 - y0)) / 100) * H;
  const r = (n: number) => Math.round(n);
  return { viewBox: `${r(x)} ${r(y)} ${r(w)} ${r(h)}`, cropWidthPx: w };
}

/** Is this image id an old Unsplash photo (from an outfit saved before the switch)? */
export function isLegacyImage(image: string): boolean {
  return image.startsWith("photo-");
}

/** Is this credit the old Unsplash shape? */
export function isLegacyCredit(credit: Credit): credit is LegacyUnsplashCredit {
  return "unsplashId" in credit;
}

// ── Legacy Unsplash helpers ─────────────────────────────────────────────────

const UTM = "utm_source=what-to-wear&utm_medium=referral";

/** URL for one rendition of an Unsplash photo. */
export function imageSrc(image: string, width: number, quality = 75): string {
  return `https://images.unsplash.com/${image}?auto=format&fit=max&w=${width}&q=${quality}`;
}

/** A `srcset` string so the browser can pick the best size for the screen. */
export function imageSrcSet(image: string, widths: number[] = [360, 600, 900, 1300]): string {
  return widths.map((w) => `${imageSrc(image, w)} ${w}w`).join(", ");
}

/** Link to an Unsplash photographer's profile. */
export function authorUrl(credit: LegacyUnsplashCredit): string {
  return `https://unsplash.com/@${credit.handle}?${UTM}`;
}

/** Link to a photo's page on Unsplash. */
export function photoUrl(credit: LegacyUnsplashCredit): string {
  return `https://unsplash.com/photos/${credit.unsplashId}?${UTM}`;
}
