/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  data/media.ts — the few big "editorial" photos that set the mood
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  These are whole runway looks (from the same catalog as everything else)
 *  used large: behind the Menswear / Womenswear gate, and very dimly behind
 *  the runway stage. To swap one, put a different look id from
 *  tools/looks/looks.src.txt in `look` — the photo, its credit and licence come
 *  along automatically.
 */

import { getLook } from "./catalog";
import type { CommonsCredit, Section } from "./types";

export interface MediaPhoto {
  /** A look id, e.g. "mcq18-09". */
  look: string;
  /** Describes the photo for screen readers. */
  alt: string;
}

/** The big photo behind each half of the gate. TWEAK: any look id works. */
export const GATE_PHOTOS: Record<Section, MediaPhoto> = {
  menswear: {
    look: "os14-01",
    alt: "Oliver Spencer, Spring 2014: a coral linen blazer and paint-splattered trousers on the runway",
  },
  womenswear: {
    look: "mcq18-09",
    alt: "Alexander McQueen, Fall 2018: a black tuxedo jacket and trousers on the runway",
  },
};

/** Atmospheric runway shots used (very dimly) behind the runway stage. */
export const RUNWAY_BACKDROPS: MediaPhoto[] = [
  { look: "y310-163", alt: "Y-3 Fall 2010: a grey cape on a dark wooden runway" },
  { look: "jill10-093", alt: "Jill Stuart Fall 2010: a red belted coat between rows of guests" },
  { look: "mm19-2542", alt: "Max Mara Fall 2019: an ivory teddy coat on a glossy runway" },
];

/** The licence credit for a media photo (comes from its look). */
export function mediaCredit(photo: MediaPhoto): CommonsCredit | undefined {
  return getLook(photo.look)?.credit;
}
