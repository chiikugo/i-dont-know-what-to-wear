/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/Closet.tsx — your saved outfits (the "Closet" tab)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Each card is one saved look: a line-up of its pieces, an editable name,
 *  when you saved it, and its generated mood/palette.
 *
 *  ACTIONS
 *    Runway   re-open it on the runway (and links out)
 *    Edit     re-open it on the look board so you can refine it
 *    Delete   remove it (a toast offers Undo)
 *    (click the name to rename)
 *
 *  THE STATUS BADGE
 *  Top-right shows where your closet lives right now:
 *    • "Saved on this device"      Supabase isn't configured (local only)
 *    • "Synced with Supabase"      you're online and everything is uploaded
 *    • an error message            Supabase is configured but unreachable —
 *                                  your outfits are still safe locally and
 *                                  will upload next time.
 *  Outfits that haven't reached Supabase yet show a small "not synced" dot.
 */

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { showOf } from "../data/shows";
import type { Outfit, Section } from "../data/types";
import { COLORS, SLOT_ORDER } from "../data/types";
import { CATEGORIES, SECTIONS } from "../data/wardrobe";
import { describeLook } from "../engine/copy";
import { navigate } from "../lib/router";
import { supabaseConfigured } from "../lib/supabase";
import { useApp } from "../state/AppContext";
import { useCloset } from "../state/ClosetContext";
import { Photo } from "./Photo";

export function Closet() {
  const closet = useCloset();
  const [filter, setFilter] = useState<Section | "all">("all");

  const hasBoth =
    closet.outfits.some((o) => o.section === "menswear") && closet.outfits.some((o) => o.section === "womenswear");
  const visible = useMemo(
    () => closet.outfits.filter((o) => filter === "all" || o.section === filter),
    [closet.outfits, filter],
  );

  const status = closet.status;

  return (
    <div className="closet">
      <header className="closet-head">
        <div>
          <p className="eyebrow is-accent">Your closet</p>
          <h1 className="display">
            Saved <em>looks</em>
          </h1>
        </div>

        <div className={`closet-status is-${status.state}`} title={status.message}>
          <span className="closet-status-dot" aria-hidden="true" />
          <span>
            {status.message}
            {!supabaseConfigured && <span className="closet-status-hint"> · see README to sync</span>}
          </span>
        </div>
      </header>

      {hasBoth && (
        <div className="closet-filters" role="group" aria-label="Filter by section">
          {(["all", "menswear", "womenswear"] as const).map((f) => (
            <button key={f} type="button" className={filter === f ? "chip is-active" : "chip"} onClick={() => setFilter(f)}>
              {f === "all" ? "Everything" : SECTIONS[f].label}
            </button>
          ))}
        </div>
      )}

      {closet.outfits.length === 0 ? (
        <div className="empty">
          <h2>Your closet is empty</h2>
          <p>Build a look, send it down the runway, and hit “Save to closet”. It will live here.</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate("build")}>
            Build a look
          </button>
        </div>
      ) : (
        <motion.div className="closet-grid" layout>
          <AnimatePresence initial={false}>
            {visible.map((outfit, i) => (
              <OutfitCard key={outfit.id} outfit={outfit} index={i} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

// ── One saved look ──────────────────────────────────────────────────────────

function OutfitCard({ outfit, index }: { outfit: Outfit; index: number }) {
  const closet = useCloset();
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(outfit.name);

  const slots = SLOT_ORDER.filter((s) => outfit.slots[s]);
  const facts = useMemo(() => describeLook(outfit.slots), [outfit.slots]);
  // Whose runways the pieces came from (outfits saved before the runway catalog have none).
  const houses = useMemo(
    () => [...new Set(slots.map((s) => outfit.slots[s]?.show).filter(Boolean).map((key) => showOf(key).house))],
    [slots, outfit.slots],
  );
  const saved = new Date(outfit.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  const commitName = () => {
    closet.rename(outfit.id, draftName);
    setEditing(false);
  };

  return (
    <motion.article
      layout
      className="outfit-card"
      initial={{ opacity: 0, y: 26, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 240, damping: 28, delay: Math.min(index, 8) * 0.05 }}
    >
      <button
        type="button"
        className="outfit-lineup"
        data-count={Math.min(slots.length, 5)}
        onClick={() => app.openOutfit(outfit)}
        aria-label={`Open ${outfit.name} on the runway`}
      >
        {slots.map((slot) => {
          const piece = outfit.slots[slot]!;
          return (
            <span key={slot} className="outfit-lineup-cell">
              <Photo
                image={piece.image}
                crop={piece.crop}
                px={180}
                alt={piece.title}
                focus={CATEGORIES[piece.category].focus}
                sizes="120px"
                widths={[240, 400]}
              />
            </span>
          );
        })}
      </button>

      <div className="outfit-body">
        {editing ? (
          <input
            className="outfit-name-input"
            value={draftName}
            autoFocus
            maxLength={60}
            aria-label="Outfit name"
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setDraftName(outfit.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <h2 className="outfit-name display">
            <button type="button" onClick={() => setEditing(true)} title="Rename">
              {outfit.name}
            </button>
          </h2>
        )}

        <p className="outfit-meta">
          <span>{SECTIONS[outfit.section].label}</span>
          <span>{saved}</span>
          <span>{facts.vibe}</span>
          {houses.length > 0 && <span className="outfit-houses">{houses.join(" × ")}</span>}
          {outfit.synced === false && <span className="outfit-unsynced">not synced yet</span>}
        </p>

        <div className="swatches" aria-label={`Palette: ${facts.palette.map((c) => c.label).join(", ")}`}>
          {facts.palette.map((c) => (
            <span
              key={c.name}
              className={`swatch${c.name === "print" ? " is-print" : ""}`}
              style={{ background: COLORS[c.name].hex }}
            />
          ))}
        </div>

        <div className="outfit-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => app.openOutfit(outfit)}>
            Runway
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => app.openOutfit(outfit, "build")}>
            Edit
          </button>
          <button type="button" className="link-btn" onClick={() => closet.remove(outfit.id)}>
            Delete
          </button>
        </div>
      </div>
    </motion.article>
  );
}
