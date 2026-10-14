/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/CategoryStart.tsx — "What are we building around?"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Shown on the Build page when there's no outfit in progress. A grid of the
 *  section's categories; each card's photo is the piece the taste model likes
 *  best in that category (so even this screen reflects your taste).
 */

import { motion } from "motion/react";
import { useMemo } from "react";
import { categoriesFor, categoryLabel, SECTIONS } from "../../data/wardrobe";
import { bestFor } from "../../engine/resolver";
import type { AppApi } from "../../state/AppContext";
import { useSection } from "../../state/SectionContext";
import { useTaste } from "../../state/TasteContext";
import { Photo } from "../Photo";

export function CategoryStart({ app }: { app: AppApi }) {
  const taste = useTaste();
  const { section } = useSection();
  const sec = section!;

  const cards = useMemo(
    () =>
      categoriesFor(sec).map((category) => ({
        category,
        piece: bestFor(sec, category.id, {}, taste.scorePiece),
      })),
    [sec, taste.scorePiece],
  );

  return (
    <div className="start">
      <header className="start-head">
        <p className="eyebrow is-accent">{SECTIONS[sec].label} · step 1</p>
        <h1 className="display">
          What are we building <em>around?</em>
        </h1>
        <p className="start-lede">
          Choose any one piece you know you want to wear. You&apos;ll answer a few quick questions about it — slim or
          baggy, light or dark — and I&apos;ll build the whole outfit from there.
        </p>
      </header>

      <div className="start-grid">
        {cards.map(({ category, piece }, i) => (
          <motion.button
            key={category.id}
            type="button"
            className="start-card"
            onClick={() => app.startFromCategory(category.id)}
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 26, delay: 0.045 * i }}
            whileHover={{ y: -6 }}
            whileTap={{ scale: 0.975 }}
          >
            <span className="start-card-photo">
              {piece && <Photo image={piece.image} crop={piece.crop} alt="" px={240} focus={category.focus} sizes="(max-width: 760px) 44vw, 240px" />}
            </span>
            <span className="start-card-label">{categoryLabel(category.id, sec)}</span>
            <span className="start-card-hint">{category.hint}</span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
