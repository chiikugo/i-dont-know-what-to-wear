/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/PieceStep.tsx — the question flow for ONE garment
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THE USER SEES
 *  Left:  a big photo of the piece that currently matches their answers —
 *         cropped out of the real runway look it walked in, with the designer
 *         and season underneath ("From Max Mara · Fall 2019") and a button to
 *         wear that whole runway look instead.
 *  Right: "Slim fit or baggy?" with a photo for each choice. Pick one and the
 *         big photo updates, a new question appears, and an answer chip is
 *         added. They can keep going ("continuously cater") or stop whenever
 *         they like with "Build my look".
 *
 *  THE PIECES OF STATE (all come from AppContext / draft.ts)
 *    app.preview   the piece shown on the left
 *    app.step      the next question {key, options[]} — or null when finished
 *    entry.handled which facets were answered/skipped (→ the chips)
 *
 *  KEY IDEA: OPTIONS CAN'T BE EMPTY
 *  `app.step.options` only lists answers that exist in the catalog given the
 *  earlier answers (see engine/resolver.ts → facetOptions). So every card here
 *  has a real photo, and choosing never leads to a dead end.
 *
 *  ANIMATION
 *  • The hero photo cross-fades (AnimatePresence) with a gentle zoom each time
 *    the preview piece changes.
 *  • The option cards are keyed by the question, so a new question swaps the
 *    whole set with a staggered entrance.
 *  • The answer chips use `layout` so they glide when one is removed.
 */

import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useMemo } from "react";
import { getLook } from "../../data/catalog";
import { showOf } from "../../data/shows";
import { COLORS, FORMALITY_LABEL } from "../../data/types";
import {
  CATEGORIES,
  categoriesFor,
  categoryLabel,
  FIT_COPY,
  optionCopy,
  questionPrompt,
  SLOT_LABEL,
} from "../../data/wardrobe";
import { bestFor, facetOptions, swatchesFor } from "../../engine/resolver";
import type { AppApi } from "../../state/AppContext";
import { useTaste } from "../../state/TasteContext";
import { Credit, Photo } from "../Photo";
import { OptionCard } from "./OptionCard";

export function PieceStep({ app }: { app: AppApi }) {
  const taste = useTaste();

  const draft = app.draft!;
  const slot = draft.focus!;
  const entry = draft.slots[slot]!;
  const section = draft.section;
  const category = CATEGORIES[entry.category];
  const { preview, step } = app;

  // Other categories that fill this same slot (e.g. Shirts / T-shirts / Knitwear).
  const siblings = categoriesFor(section).filter((c) => c.slot === slot);

  // Progress dots: every facet that is answered, or still worth asking.
  const dots = category.chain.filter(
    (key) => entry.handled.includes(key) || facetOptions(section, entry.category, key, entry.answers).length >= 2,
  );

  // Photo + wording for each option of the current question.
  const options = useMemo(() => {
    if (!step) return [];
    return step.options.map((option) => {
      const piece = bestFor(
        section,
        entry.category,
        { ...entry.answers, [step.key]: option.value },
        taste.scorePiece,
      );
      const copy = optionCopy(step.key, option.value, entry.category);
      return {
        value: option.value,
        count: option.count,
        piece,
        label: copy.label,
        blurb: copy.blurb,
        swatches: step.key === "tone" ? swatchesFor(section, entry.category, step.key, option.value, entry.answers) : undefined,
      };
    });
  }, [step, section, entry.category, entry.answers, taste.scorePiece]);

  const finished = step === null;
  const color = preview ? COLORS[preview.color] : null;
  // The runway look the preview was cut from (for the caption + "wear the whole look").
  const sourceLook = getLook(preview?.look);
  const show = preview ? showOf(preview.show) : null;

  return (
    <div className="step">
      {/* ── Left: the hero photo ─────────────────────────────────────── */}
      <section className="step-hero" aria-label="Current piece">
        <div className="step-hero-frame">
          <AnimatePresence mode="popLayout" initial={false}>
            {preview && (
              <motion.div
                key={preview.id}
                className="step-hero-photo"
                initial={{ opacity: 0, scale: 1.06 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.55, ease: [0.22, 0.9, 0.24, 1] }}
              >
                <Photo
                  image={preview.image}
                  crop={preview.crop}
                  px={440}
                  alt={preview.title}
                  focus={category.focus}
                  sizes="(max-width: 860px) 100vw, 46vw"
                  widths={[500, 800, 1100, 1500]}
                  eager
                />
              </motion.div>
            )}
          </AnimatePresence>

          <span className="step-hero-slot">
            {SLOT_LABEL[slot]} · {categoryLabel(entry.category, section)}
          </span>
        </div>

        {preview && color && (
          <div className="step-hero-caption">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={preview.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22 }}
              >
                <h2 className="step-hero-title display">{preview.title}</h2>
                <p className="step-hero-meta">
                  <span
                    className={`chip-dot${preview.color === "print" ? " is-print" : ""}`}
                    style={{ background: color.hex }}
                    aria-hidden="true"
                  />
                  {color.label} · {FIT_COPY[preview.category][preview.fit].label.toLowerCase()} ·{" "}
                  {FORMALITY_LABEL[preview.formality].toLowerCase()}
                </p>
                {show && (
                  <p className="step-hero-source">
                    <span>
                      From <strong>{show.house}</strong>
                      {show.season ? ` · ${show.season}` : ""}
                    </span>
                    {sourceLook && sourceLook.pieces.length > 1 && (
                      <button type="button" className="link-btn step-hero-wear" onClick={() => app.startFromLook(sourceLook)}>
                        Wear the whole look →
                      </button>
                    )}
                  </p>
                )}
                <Credit credit={preview.credit} />
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </section>

      {/* ── Right: the question ──────────────────────────────────────── */}
      <section className="step-panel" aria-live="polite">
        <div className="step-topline">
          <button type="button" className="link-btn" onClick={app.back}>
            ← Back
          </button>

          <div className="step-dots" aria-hidden="true">
            {dots.map((key) => (
              <span
                key={key}
                className={
                  entry.handled.includes(key) ? "step-dot is-done" : key === step?.key ? "step-dot is-current" : "step-dot"
                }
              />
            ))}
          </div>
        </div>

        {/* Category switch: only when this slot has several categories. */}
        {siblings.length > 1 && (
          <div className="step-cats" role="group" aria-label="Kind of garment">
            {siblings.map((c) => (
              <button
                key={c.id}
                type="button"
                className={c.id === entry.category ? "chip is-active" : "chip"}
                onClick={() => c.id !== entry.category && app.switchCategory(c.id)}
              >
                {categoryLabel(c.id, section)}
              </button>
            ))}
          </div>
        )}

        {/* Answer chips: tap one to change that answer. */}
        <LayoutGroup>
          <div className="step-chips">
            <AnimatePresence initial={false}>
              {entry.handled.map((key) => {
                const value = entry.answers[key];
                return (
                  <motion.button
                    key={key}
                    layout
                    type="button"
                    className={value ? "chip is-active" : "chip chip-muted"}
                    onClick={() => app.reopenQuestion(key)}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ type: "spring", stiffness: 420, damping: 28 }}
                    title="Change this answer"
                  >
                    {value ? optionCopy(key, value, entry.category).label : `Any ${key}`}
                    <span aria-hidden="true">×</span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </LayoutGroup>

        {/* The question itself */}
        <AnimatePresence mode="wait" initial={false}>
          {step ? (
            <motion.div
              key={step.key + entry.category}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.28 }}
            >
              <p className="eyebrow is-accent">
                Question {entry.handled.length + 1}
              </p>
              <h1 className="step-question display">{questionPrompt(step.key, entry.category)}</h1>

              <div className="option-grid" data-count={options.length}>
                {options.map((o, i) => (
                  <OptionCard
                    key={o.value}
                    index={i}
                    label={o.label}
                    blurb={o.blurb}
                    piece={o.piece}
                    swatches={o.swatches}
                    count={o.count}
                    focus={category.focus}
                    onPick={() => app.pick(step.key, o.value)}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="finished"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28 }}
              className="step-finished"
            >
              <p className="eyebrow is-accent">Locked in</p>
              <h1 className="step-question display">That&apos;s the one.</h1>
              <p className="step-finished-copy">
                I&apos;ve run out of questions worth asking. Ready for me to build the rest of the outfit around it?
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Actions */}
        <div className="step-actions">
          <button type="button" className="btn btn-primary" onClick={app.finish}>
            {finished ? "Build my look" : "Good enough — build my look"} <span aria-hidden="true">→</span>
          </button>
          {step && (
            <>
              <button type="button" className="btn btn-ghost btn-sm" onClick={app.surprise} title="Let Muse choose for you">
                ✦ Surprise me
              </button>
              <button type="button" className="link-btn" onClick={() => app.skipQuestion(step.key)}>
                No preference
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
