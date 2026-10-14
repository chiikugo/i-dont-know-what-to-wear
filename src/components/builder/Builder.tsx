/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/Builder.tsx — the "Build" page
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The Build page is one screen with three modes, chosen purely by the draft's
 *  state (state/draft.ts):
 *
 *      no draft            →  CategoryStart   "What are we building around?"
 *      draft, focus set    →  PieceStep       the questions for one garment
 *      draft, focus null   →  LookBoard       the whole outfit
 *
 *  Switching between them cross-fades (AnimatePresence, mode="wait": the old
 *  mode fades out before the new one fades in).
 */

import { AnimatePresence, motion } from "motion/react";
import { useApp } from "../../state/AppContext";
import { CategoryStart } from "./CategoryStart";
import { LookBoard } from "./LookBoard";
import { PieceStep } from "./PieceStep";

export function Builder() {
  const app = useApp();
  const { draft } = app;
  const mode = !draft ? "start" : draft.focus ? "step" : "board";

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={mode}
        className="builder"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        transition={{ duration: 0.3, ease: [0.22, 0.9, 0.24, 1] }}
      >
        {/*
          `app` is passed down as a PROP (rather than each screen calling
          useApp() itself). That matters for the exit animation: AnimatePresence
          keeps the leaving screen on stage with the props it last had, so it
          fades out showing what you were just looking at. A screen that read
          the live context instead would re-render against the NEW state mid
          fade-out (for example "no question is focused any more") and break.
        */}
        {mode === "start" && <CategoryStart app={app} />}
        {mode === "step" && <PieceStep app={app} />}
        {mode === "board" && <LookBoard app={app} />}
      </motion.div>
    </AnimatePresence>
  );
}
