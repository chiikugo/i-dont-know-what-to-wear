/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/SectionGate.tsx — "Menswear or womenswear?"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  This is the first thing you see (until you've chosen once). A full-screen
 *  split: two editorial photos, one per section.
 *
 *  THE INTERACTION
 *    idle      both halves equal width, photos in black & white
 *    hover     the hovered half grows and fades into colour, the other shrinks
 *    click     the chosen half sweeps open to fill the screen, the other
 *              collapses away — THEN we actually switch (so the animation
 *              gets to finish).
 *
 *  HOW THE "GROW" WORKS
 *  Each half is a flex child. `flexGrow` is how much of the leftover space it
 *  claims. We animate that single number with a spring (`motion`), and the
 *  browser re-flows the layout every frame. Easy to read, silky to watch.
 *
 *  KEYBOARD / TOUCH
 *  Both halves are real <button>s, so Tab + Enter works; on touch screens the
 *  halves stack vertically and "hover" never happens (CSS handles the layout).
 */

import { motion } from "motion/react";
import { useState } from "react";
import { GATE_PHOTOS, mediaCredit } from "../data/media";
import type { Section } from "../data/types";
import { SECTION_IDS, SECTIONS } from "../data/wardrobe";
import { useApp } from "../state/AppContext";
import { Credit, Photo } from "./Photo";

/** How long the "open up" animation gets before we switch (ms). */
const LEAVE_MS = 620;

export function SectionGate() {
  const app = useApp();
  const [hover, setHover] = useState<Section | null>(null);
  const [leaving, setLeaving] = useState<Section | null>(null);

  const choose = (section: Section) => {
    if (leaving) return;
    setLeaving(section);
    window.setTimeout(() => app.chooseSection(section), LEAVE_MS);
  };

  /** How much of the row each half should claim right now. */
  const growth = (id: Section): number => {
    if (leaving) return leaving === id ? 9 : 0.0001;
    if (hover) return hover === id ? 1.3 : 0.9;
    return 1;
  };

  return (
    <section className="gate" aria-label="Choose where to start">
      <div className="gate-title">
        <p className="eyebrow">Start here</p>
        <h1 className="display">
          I don&apos;t know <em>what to wear</em>
        </h1>
        <p className="gate-sub">Choose a side — I&apos;ll build the rest of the outfit from there.</p>
      </div>

      {SECTION_IDS.map((id, index) => {
        const photo = GATE_PHOTOS[id];
        const def = SECTIONS[id];
        const dimmed = leaving !== null && leaving !== id;
        return (
          <motion.button
            key={id}
            type="button"
            className={`gate-half gate-${id}${hover === id ? " is-hover" : ""}`}
            onClick={() => choose(id)}
            onMouseEnter={() => setHover(id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(id)}
            onBlur={() => setHover(null)}
            // `initial` is where it starts on first paint; `animate` is where it
            // springs to (and re-springs to whenever hover/leaving changes).
            initial={{ opacity: 0, y: 24 }}
            animate={{ flexGrow: growth(id), opacity: dimmed ? 0 : 1, y: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 22 }}
            aria-label={`${def.label}: ${def.tagline}`}
          >
            <span className="gate-photo" aria-hidden="true">
              <Photo image={photo.look} alt={photo.alt} eager px={720} anchor="top" />
            </span>
            <span className="gate-shade" aria-hidden="true" />

            <span className="gate-copy">
              <span className="gate-index">0{index + 1}</span>
              <span className="gate-label display">{def.label}</span>
              <span className="gate-tagline">{def.tagline}</span>
              <span className="gate-cta">
                Enter {def.noun}
                <span className="gate-arrow" aria-hidden="true">
                  →
                </span>
              </span>
            </span>
          </motion.button>
        );
      })}

      <div className="gate-credits">
        {SECTION_IDS.map((id) => {
          const credit = mediaCredit(GATE_PHOTOS[id]);
          return credit ? <Credit key={id} credit={credit} className="on-dark" /> : null;
        })}
      </div>
    </section>
  );
}
