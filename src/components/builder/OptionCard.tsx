/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/OptionCard.tsx — one answer in the question flow
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A tall photo with a label under it. Shows what you'd GET if you pick it:
 *  the photo is the best catalog piece that satisfies "your answers so far +
 *  this option" (computed by the parent with engine/resolver.ts).
 *
 *  For colour-tone options we also show 2–4 real colour swatches from the
 *  pieces behind the option, so "Earthy" isn't just a word.
 *
 *  ANIMATION
 *  Options enter staggered (each `index` waits a little longer). `whileHover`
 *  lifts the card; `whileTap` presses it. These props are all `motion` needs.
 */

import { motion } from "motion/react";
import type { Piece } from "../../data/types";
import { Photo } from "../Photo";

interface OptionCardProps {
  label: string;
  blurb: string;
  /** The piece that would result from this option. */
  piece?: Piece;
  /** Colour dots (used for tone options). */
  swatches?: string[];
  /** How many pieces have this answer. */
  count: number;
  /** CSS object-position for the photo. */
  focus: string;
  index: number;
  onPick: () => void;
}

export function OptionCard({ label, blurb, piece, swatches, count, focus, index, onPick }: OptionCardProps) {
  return (
    <motion.button
      type="button"
      className="option-card"
      onClick={onPick}
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -14, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.06 * index }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.975 }}
    >
      <span className="option-card-photo">
        {piece && <Photo image={piece.image} crop={piece.crop} alt={piece.title} px={260} focus={focus} sizes="(max-width: 760px) 44vw, 260px" />}
        {swatches && swatches.length > 0 && (
          <span className="option-card-swatches" aria-hidden="true">
            {swatches.map((hex) => (
              <span key={hex} className="swatch" style={{ background: hex }} />
            ))}
          </span>
        )}
      </span>
      <span className="option-card-label">{label}</span>
      <span className="option-card-blurb">{blurb}</span>
      <span className="option-card-count">
        {count} {count === 1 ? "style" : "styles"}
      </span>
    </motion.button>
  );
}
