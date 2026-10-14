/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/deckLayout.ts — where each card of the stack sits
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  On the look board the outfit is a STACK OF CARDS: the post you opened on top,
 *  then one card per garment (head to toe). This file is the geometry, kept
 *  separate (and pure) so it can be tested and tweaked without touching React.
 *
 *    STACKED  a neat pile: each card a little lower/right and turned a few
 *             degrees, so you can see there's more underneath.
 *    FANNED   hover the pile (or tap it on a phone) and the cards spread out
 *             like a hand of playing cards. The card under your pointer lifts
 *             up — that's how you "pick" a piece.
 *
 *  Every pose is { x, y, rotate, scale, z } relative to the centre of the deck.
 *  CardDeck.tsx hands these to the `motion` library, which springs each card
 *  smoothly from pose to pose.
 *
 *  TWEAK
 *    STACK_TILT    the angles of the pile
 *    STACK_STEP    how far each card peeks out from under the one above
 *    FAN_MAX_TURN  the most a fanned card is turned, in degrees
 *    LIFT          how far the picked card rises
 */

export interface Pose {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  /** Stacking order (higher = in front). */
  z: number;
}

/** The angle of each card in the pile (top card first). TWEAK */
export const STACK_TILT = [-1.2, 3.4, -4.2, 2.4, -2.8, 4.6, -3.6, 1.8];
/** How far each lower card peeks out, in px [right, down]. TWEAK */
export const STACK_STEP: [number, number] = [9, 8];
/** The most a fanned card is turned, in degrees. TWEAK */
export const FAN_MAX_TURN = 9;
/** How far the picked card rises, in px. TWEAK */
export const LIFT = 34;

/**
 * A card's place in the neat pile. `index` 0 = the top card.
 */
export function stackPose(index: number, count: number): Pose {
  return {
    x: index * STACK_STEP[0],
    y: index * STACK_STEP[1],
    rotate: STACK_TILT[index % STACK_TILT.length],
    scale: 1 - Math.min(index, 6) * 0.014,
    z: count - index,
  };
}

/**
 * A card's place in the fan.
 *
 * @param index    position left → right (0 = leftmost)
 * @param count    how many cards
 * @param width    room the fan may use, in px (the deck's width)
 * @param cardW    one card's width, in px
 * @param picked   the card under the pointer (lifted), or null
 */
export function fanPose(index: number, count: number, width: number, cardW: number, picked: number | null): Pose {
  if (count <= 1) return { x: 0, y: picked === index ? -LIFT / 2 : 0, rotate: 0, scale: picked === index ? 1.04 : 1, z: 1 };

  const mid = (count - 1) / 2;
  const t = index - mid; // -mid … +mid, 0 in the middle
  // Distance between card centres: as wide as the room allows, but always
  // overlapping a little (like a real hand of cards). The outer cards are
  // turned and nudged, so a little extra room is kept at both ends.
  const step = Math.max(cardW * 0.24, Math.min(cardW * 0.8, (width - cardW * 1.3) / (count - 1)));
  const turn = Math.min(FAN_MAX_TURN, 34 / count);

  let x = t * step;
  // The arc: outer cards sit a little lower.
  let y = Math.abs(t) * 6 + t * t * 3.5;
  let rotate = t * turn;
  let scale = 1;
  let z = index + 1;

  if (picked !== null) {
    if (index === picked) {
      y -= LIFT;
      rotate *= 0.2;
      scale = 1.07;
      z = 100;
    } else {
      // Nudge the neighbours aside so the picked card stands clear.
      x += Math.sign(index - picked) * step * 0.22;
    }
  }
  return { x: Math.round(x), y: Math.round(y), rotate: +rotate.toFixed(2), scale, z };
}

/** Card size for a deck of a given width (keeps a 3:4 garment card). */
export function cardSize(deckWidth: number): { w: number; h: number } {
  const w = Math.round(Math.max(150, Math.min(280, deckWidth * 0.42)));
  return { w, h: Math.round((w * 4) / 3) };
}
