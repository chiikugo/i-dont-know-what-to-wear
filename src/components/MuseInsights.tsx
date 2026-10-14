/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/MuseInsights.tsx — "What I've learned about your taste"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A slide-over drawer that makes the model visible. It exists for two
 *  reasons:
 *    1. TRUST     — you can see exactly what Muse has inferred and delete it.
 *    2. LEARNING  — if you want to understand or change the model, this panel
 *                   shows its real weights next to a plain-English explanation.
 *
 *  What's inside
 *    • how many choices it has learned from + community status
 *    • bars for the features it thinks you like / tend to skip
 *      (these ARE the weights from model/tasteModel.ts, scaled for display)
 *    • the privacy switch for sharing anonymous picks (only when Supabase is on)
 *    • "How it works" in six short lines
 *    • Reset
 *
 *  ACCESSIBILITY
 *  It's a `role="dialog"`; Escape and the backdrop close it; focus moves to
 *  the close button when it opens.
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef } from "react";
import { supabaseConfigured } from "../lib/supabase";
import { featureLabel } from "../model/features";
import { topFeatures } from "../model/tasteModel";
import { useTaste, type CrowdStatus } from "../state/TasteContext";
import { useToast } from "../state/ToastContext";

const CROWD_COPY: Record<CrowdStatus, string> = {
  off: "Not connected — Muse is learning from you only.",
  loading: "Connecting to the community…",
  ready: "Blending in what the community likes.",
  empty: "Connected — waiting for more people to contribute (it needs a few).",
  error: "Couldn't reach the community right now.",
};

export function MuseInsights({ open, onClose }: { open: boolean; onClose: () => void }) {
  const taste = useTaste();
  const toast = useToast();
  const closeRef = useRef<HTMLButtonElement>(null);

  const { likes, dislikes } = useMemo(() => topFeatures(taste.state, 7), [taste.state]);
  const max = Math.max(0.0001, ...likes.map(([, v]) => v), ...dislikes.map(([, v]) => Math.abs(v)));

  // Escape closes; focus the close button on open.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const reset = async () => {
    if (!window.confirm("Forget everything Muse has learned about your taste? Your closet is not affected.")) return;
    await taste.resetTaste();
    toast.push({ message: "Muse has forgotten your taste — a clean slate." });
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="muse-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="muse"
            role="dialog"
            aria-modal="true"
            aria-label="Muse: what I've learned about your taste"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <header className="muse-head">
              <div>
                <p className="eyebrow is-accent">Muse · your taste model</p>
                <h2 className="display">What I&apos;ve learned</h2>
              </div>
              <button ref={closeRef} type="button" className="muse-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </header>

            <p className="muse-lede">
              Muse is a small model that lives in your browser. Every option you pick, piece you keep or card you dismiss
              nudges it — and the home page re-ranks itself.
            </p>

            <dl className="muse-stats">
              <div>
                <dt>Choices learned</dt>
                <dd>{taste.state.picks}</dd>
              </div>
              <div>
                <dt>Community</dt>
                <dd className="muse-stat-small">{CROWD_COPY[taste.crowdStatus]}</dd>
              </div>
            </dl>

            {taste.state.picks < 3 ? (
              <p className="muse-empty">
                Not much yet. Start a look, tap through a few options, or press a mood chip on the home page — I&apos;ll
                show what I pick up here.
              </p>
            ) : (
              <div className="muse-columns">
                <Bars title="You lean towards" tone="like" entries={likes} max={max} />
                <Bars title="You tend to skip" tone="skip" entries={dislikes} max={max} />
              </div>
            )}

            {supabaseConfigured && (
              <label className="muse-toggle">
                <input
                  type="checkbox"
                  checked={taste.shareEnabled}
                  onChange={(e) => taste.setShareEnabled(e.target.checked)}
                />
                <span>
                  <strong>Contribute anonymous picks</strong>
                  <small>
                    Sends only labels like “fit:baggy” plus yes/no — never photos, outfits, names or emails — so
                    everyone&apos;s recommendations improve.
                  </small>
                </span>
              </label>
            )}

            <details className="muse-how">
              <summary>How does it work?</summary>
              <ol>
                <li>
                  Every piece is described by short <em>features</em> — “fit:baggy”, “vibe:street”, “tone:earth”.
                </li>
                <li>Muse keeps one weight per feature. Higher means you like it.</li>
                <li>A piece&apos;s score is the sum of its features&apos; weights.</li>
                <li>
                  Each action nudges the weights: saves count most, kept pieces and picked options count a lot,
                  dismissals push down.
                </li>
                <li>Unfamiliar features get a small boost so you keep seeing new things.</li>
                <li>
                  With Supabase connected, a faded-in community average helps at the start; your own taps take over as
                  you go.
                </li>
              </ol>
              <p>
                It&apos;s plain logistic regression in <code>src/model/tasteModel.ts</code> — about 150 lines you can read.
              </p>
            </details>

            <button type="button" className="muse-reset" onClick={reset} disabled={taste.state.picks === 0}>
              Reset what Muse has learned
            </button>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/** A little horizontal bar chart of features. */
function Bars({
  title,
  tone,
  entries,
  max,
}: {
  title: string;
  tone: "like" | "skip";
  entries: [string, number][];
  max: number;
}) {
  return (
    <section className="muse-bars">
      <h3 className="eyebrow">{title}</h3>
      {entries.length === 0 ? (
        <p className="muse-none">Nothing yet</p>
      ) : (
        <ul>
          {entries.map(([feature, weight], i) => (
            <li key={feature}>
              <span className="muse-bar-label">{featureLabel(feature)}</span>
              <span className="muse-bar-track">
                <motion.span
                  className={`muse-bar muse-bar-${tone}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(6, (Math.abs(weight) / max) * 100)}%` }}
                  transition={{ type: "spring", stiffness: 140, damping: 20, delay: 0.05 * i }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
