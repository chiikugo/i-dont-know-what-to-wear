/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/LookBoard.tsx — the whole outfit, as a stack of cards
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  This is the page a post opens into (and where every look you build lands).
 *  The outfit engine (engine/composer.ts) has chosen a piece for every slot;
 *  the board shows them as a STACK OF CARDS (CardDeck.tsx) with the post you
 *  started from on top:
 *
 *      • a generated NAME, and under the stack its SILHOUETTE, PALETTE and
 *        MOOD (engine/copy.ts)
 *      • WHOSE RUNWAYS the pieces came from ("Max Mara × McQueen")
 *      • hover the stack to fan it out; click a card for Change · Refine ·
 *        Keep · Delete (CardPanel.tsx)
 *      • "Add …" buttons for anything deleted
 *      • Shuffle (re-roll everything that isn't kept)
 *      • "Send down the runway" — the finale
 */

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { showOf } from "../../data/shows";
import type { Slot } from "../../data/types";
import { COLORS } from "../../data/types";
import { SECTIONS, SLOT_LABEL } from "../../data/wardrobe";
import { describeLook } from "../../engine/copy";
import { scoreCandidate } from "../../engine/composer";
import type { AppApi } from "../../state/AppContext";
import { CardDeck } from "./CardDeck";

/** "Add shoes", "Add a top", "Add a finishing touch"… */
function addLabel(slot: Slot): string {
  if (slot === "shoes") return "Add shoes";
  if (slot === "onepiece") return "Add a dress instead";
  const name = SLOT_LABEL[slot].toLowerCase();
  return `Add a ${name}`;
}

export function LookBoard({ app }: { app: AppApi }) {
  const draft = app.draft!;
  const { pieces } = app;

  // Name, silhouette, palette… The seed makes "Shuffle" produce a new name too.
  const facts = useMemo(() => describeLook(pieces, draft.seed), [pieces, draft.seed]);

  // Why each Muse-picked piece suits the others (recomputed when pieces change).
  const reasons = useMemo(() => {
    const out: Partial<Record<Slot, string[]>> = {};
    for (const [slot, piece] of Object.entries(pieces) as [Slot, NonNullable<(typeof pieces)[Slot]>][]) {
      const others = { ...pieces };
      delete others[slot];
      out[slot] = scoreCandidate(piece, slot, others).reasons;
    }
    return out;
  }, [pieces]);

  const anchor = draft.anchor ? pieces[draft.anchor] : undefined;

  // The houses in this outfit, most pieces first: "Max Mara × Alexander McQueen".
  const houses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of Object.values(pieces)) {
      if (!p) continue;
      const house = showOf(p.show).house;
      counts.set(house, (counts.get(house) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([h]) => h);
  }, [pieces]);

  const shown = Object.keys(pieces) as Slot[];
  const unlockedCount = shown.filter((s) => !draft.slots[s]?.locked).length;
  // What's missing for "complete" (a body piece + shoes), in plain words.
  const missing = !app.complete ? app.addable.filter((s) => s === "shoes" || s === "top" || s === "bottom") : [];

  return (
    <div className="board">
      <header className="board-head">
        <p className="eyebrow is-accent">
          {SECTIONS[draft.section].label}
          {anchor ? ` · built around ${anchor.title.toLowerCase()}` : ""}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.h1
            key={facts.name}
            className="board-name display"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {facts.name}
          </motion.h1>
        </AnimatePresence>

      </header>

      <CardDeck app={app} reasons={reasons} />

      {/* Bring back anything that was deleted. */}
      {app.addable.length > 0 && (
        <div className="deck-adds" role="group" aria-label="Add a card back">
          {app.addable.map((slot) => (
            <motion.button
              key={slot}
              layout
              type="button"
              className="deck-add"
              onClick={() => app.restore(slot)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <span aria-hidden="true">＋</span> {addLabel(slot)}
            </motion.button>
          ))}
        </div>
      )}

      <ul className="board-facts">
        <li>
          <span className="eyebrow">Silhouette</span>
          <span>{facts.silhouette}</span>
        </li>
        <li>
          <span className="eyebrow">Palette</span>
          <span className="swatches" aria-hidden="true">
            {facts.palette.map((c) => (
              <span key={c.name} className={`swatch${c.name === "print" ? " is-print" : ""}`} style={{ background: COLORS[c.name].hex }} />
            ))}
          </span>
          <span>{facts.palette.map((c) => c.label).join(" · ")}</span>
        </li>
        <li>
          <span className="eyebrow">Mood</span>
          <span>{facts.vibe}</span>
        </li>
        <li>
          <span className="eyebrow">Dress code</span>
          <span>{facts.formalityLabel}</span>
        </li>
        {houses.length > 0 && (
          <li>
            <span className="eyebrow">{houses.length === 1 ? "Runway" : "Runways"}</span>
            <span className="board-houses">{houses.join(" × ")}</span>
          </li>
        )}
      </ul>

      <footer className="board-actions">
        <button type="button" className="btn btn-ghost" onClick={app.shuffle} disabled={unlockedCount === 0}>
          ↻ Shuffle {unlockedCount > 0 ? `the ${unlockedCount} not kept` : ""}
        </button>
        <button type="button" className="link-btn" onClick={app.discard}>
          Start over
        </button>
        <span className="board-actions-spacer" />
        {missing.length > 0 && <span className="board-missing">{missing.map((s) => addLabel(s).replace(/^Add /, "")).join(" and ")} to finish the look</span>}
        <button type="button" className="btn btn-primary btn-lg" onClick={app.toRunway} disabled={!app.complete}>
          Send down the runway <span aria-hidden="true">→</span>
        </button>
      </footer>
    </div>
  );
}
