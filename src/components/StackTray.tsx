/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/StackTray.tsx — "Your stacks", the pile in the bottom-left corner
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Every stack you "Add to your stacks" on the look board lands here, as a
 *  small fanned pile of cards that stays in the corner on every page.
 *
 *      the pile      the newest three stacks, fanned, with a count
 *      click it      a list opens above it — one row per stack:
 *                      click the row      → re-open that stack on the board
 *                      "Runway →"         → send it down the runway
 *                      ✕                  → take it out of the pile
 *      Esc / click anywhere else → closes the list
 *
 *  The pile is hidden until there is something in it. The data lives in
 *  state/StashContext.tsx; the styling in styles/tray.css.
 *
 *  TWEAK
 *    PILE_SIZE   how many little cards the closed pile shows
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { getLook } from "../data/catalog";
import { showOf } from "../data/shows";
import { SLOT_ORDER } from "../data/types";
import { getPiece } from "../engine/resolver";
import { useApp } from "../state/AppContext";
import { draftPieces, isComplete, type Draft } from "../state/draft";
import { useStash, type StashedStack } from "../state/StashContext";
import { Photo } from "./Photo";

/** How many little cards the closed pile shows. TWEAK */
const PILE_SIZE = 3;

export function StackTray() {
  const { stacks, remove } = useStash();
  const app = useApp();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  // Esc or a click outside closes the list.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  // The last stack removed → nothing left to show.
  useEffect(() => {
    if (stacks.length === 0) setOpen(false);
  }, [stacks.length]);

  if (stacks.length === 0) return null;

  const pick = (stack: StashedStack, to: "build" | "runway") => {
    setOpen(false);
    app.resume(stack.draft, to);
  };

  return (
    <div ref={rootRef} className={`tray${open ? " is-open" : ""}`}>
      <AnimatePresence>
        {open && (
          <motion.div
            id={listId}
            className="tray-panel"
            role="dialog"
            aria-label="Your stacks"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.18 }}
          >
            <p className="tray-panel-head eyebrow">
              Your stacks <span>{stacks.length}</span>
            </p>
            <ul className="tray-list">
              {stacks.map((stack) => {
                const complete = isComplete(stack.draft);
                return (
                  <li key={stack.id} className="tray-item">
                    <button type="button" className="tray-item-open" onClick={() => pick(stack, "build")} aria-label={`Open ${stack.name}`}>
                      <span className="tray-item-thumb">
                        <StackThumb draft={stack.draft} px={56} />
                      </span>
                      <span className="tray-item-words">
                        <span className="tray-item-name">{stack.name}</span>
                        <span className="tray-item-houses">{housesOf(stack.draft)}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="tray-item-runway"
                      onClick={() => pick(stack, "runway")}
                      disabled={!complete}
                      title={complete ? "Send it down the runway" : "Needs a top and bottom (or a dress) and shoes to walk"}
                    >
                      Runway <span aria-hidden="true">→</span>
                    </button>
                    <button type="button" className="tray-item-remove" onClick={() => remove(stack.id)} aria-label={`Remove ${stack.name} from your stacks`}>
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        className="tray-pile"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Your stacks: ${stacks.length}. ${open ? "Close" : "Open"} the list.`}
      >
        <span className="tray-cards" aria-hidden="true">
          {stacks
            .slice(0, PILE_SIZE)
            .reverse()
            .map((stack, i, shown) => (
              // Keyed by id: a newly added stack drops onto the pile.
              <motion.span
                key={stack.id}
                className="tray-card"
                style={{ zIndex: i }}
                initial={{ y: -40, opacity: 0, rotate: 0 }}
                animate={{ y: 0, opacity: 1, rotate: (i - (shown.length - 1)) * 7 }}
                transition={{ type: "spring", stiffness: 320, damping: 24 }}
              >
                <StackThumb draft={stack.draft} px={44} />
              </motion.span>
            ))}
        </span>
        <span className="tray-label">
          <span className="eyebrow">Your stacks</span>
          <span className="tray-count">{stacks.length}</span>
        </span>
      </button>
    </div>
  );
}

/** The picture that stands for a stack: the post it started from, else its first garment. */
function StackThumb({ draft, px }: { draft: Draft; px: number }) {
  const [broken, setBroken] = useState(false);
  const o = draft.origin;

  if (o?.kind === "live" && !broken) {
    return <img src={o.item.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} />;
  }
  if (o?.kind === "look" && getLook(o.lookId)) return <Photo image={o.lookId} alt="" px={px} anchor="top" />;

  const piece = (o?.kind === "piece" ? getPiece(o.pieceId) : undefined) ?? firstPiece(draft);
  return piece ? <Photo image={piece.image} crop={piece.crop} alt="" px={px} /> : null;
}

/** The first garment, head to toe. */
function firstPiece(draft: Draft) {
  const pieces = draftPieces(draft);
  for (const slot of SLOT_ORDER) if (pieces[slot]) return pieces[slot];
  return undefined;
}

/** "Max Mara × Prada" — whose runways the stack came from. */
function housesOf(draft: Draft): string {
  const houses = [...new Set(Object.values(draftPieces(draft)).map((p) => showOf(p!.show).house))];
  return houses.slice(0, 3).join(" × ") + (houses.length > 3 ? " …" : "");
}
