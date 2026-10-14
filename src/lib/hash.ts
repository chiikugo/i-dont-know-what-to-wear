/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/hash.ts — tiny deterministic "randomness"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHY NOT Math.random()?
 *  React may render a component several times, and the outfit engine should
 *  give the SAME answer for the same inputs (otherwise photos would flicker and
 *  tests could not be written). So wherever the app needs "a bit of variety"
 *  it uses a *seeded* value: same seed + same text → same number, every time.
 *  Pressing "Shuffle" simply changes the seed.
 */

/**
 * FNV-1a string hash → a non-negative 32-bit integer.
 * Fast, tiny, and plenty good enough for shuffling photos.
 */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A repeatable number in [0, 1) derived from a seed and a label. */
export function seededUnit(seed: number, label: string): number {
  return hashString(`${seed}:${label}`) / 0x100000000;
}

/** Pick one item from a list, deterministically, from a seed + label. */
export function seededPick<T>(items: readonly T[], seed: number, label: string): T {
  return items[Math.floor(seededUnit(seed, label) * items.length) % items.length];
}
