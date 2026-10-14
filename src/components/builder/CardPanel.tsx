/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/CardPanel.tsx — the options for the card you clicked
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Click a card in the stack (CardDeck.tsx) and this panel opens beside it
 *  (below it on a phone). For a GARMENT card:
 *
 *      Change   pick a replacement from the best alternatives for this slot
 *               (they're ranked by how well they suit the rest of the look,
 *               plus your taste) — or "Surprise me" for the next best.
 *      Refine   answer a few questions to narrow it down (the question flow)
 *      Keep     pin it, so Shuffle leaves it alone
 *      Delete   take it out of the look (Undo appears for a few seconds)
 *
 *  For the TOP card (the post the look started from): where it's from, a link
 *  to the original, the show film if it's a video, and "Wear it as shown" for
 *  catalog runway looks.
 */

import { motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { getLook } from "../../data/catalog";
import { showLinks } from "../../data/runwaySources";
import { KIND_LABEL, showOf } from "../../data/shows";
import type { Piece, Slot } from "../../data/types";
import { COLORS } from "../../data/types";
import { SLOT_LABEL } from "../../data/wardrobe";
import { navigate } from "../../lib/router";
import { LIVE_KIND_LABEL } from "../../live/sources";
import { dismissLiveItem } from "../../live/useLiveFeed";
import type { AppApi } from "../../state/AppContext";
import type { DraftOrigin } from "../../state/draft";
import { Credit, Photo } from "../Photo";

export type DeckCardData =
  | { key: "cover"; kind: "cover"; origin: DraftOrigin }
  | { key: Slot; kind: "piece"; slot: Slot; piece: Piece };

interface CardPanelProps {
  card: DeckCardData;
  app: AppApi;
  /** Why the engine picked it (garment cards). */
  reasons: string[];
  onClose: () => void;
}

export function CardPanel({ card, app, reasons, onClose }: CardPanelProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes; focus starts on the close button (keyboard friendly).
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, card.key]);

  return (
    <motion.section
      className="card-panel"
      role="region"
      aria-labelledby={titleId}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      <button ref={closeRef} type="button" className="card-panel-close" onClick={onClose} aria-label="Close the options">
        ✕
      </button>
      {card.kind === "piece" ? (
        <PiecePanel slot={card.slot} piece={card.piece} app={app} reasons={reasons} titleId={titleId} onClose={onClose} />
      ) : (
        <CoverPanel origin={card.origin} app={app} titleId={titleId} />
      )}
    </motion.section>
  );
}

// ── A garment ───────────────────────────────────────────────────────────────

function PiecePanel({ slot, piece, app, reasons, titleId, onClose }: { slot: Slot; piece: Piece; app: AppApi; reasons: string[]; titleId: string; onClose: () => void }) {
  const [changing, setChanging] = useState(false);
  const entry = app.draft?.slots[slot];
  const locked = Boolean(entry?.locked);
  const show = showOf(piece.show);
  const color = COLORS[piece.color];
  const runway = showLinks(piece.show)[0];
  // Recomputed when the piece changes (e.g. after a Change), not on every render.
  const alternatives = useMemo(() => (changing ? app.alternatives(slot, 8) : []), [changing, app, slot]);

  return (
    <>
      <p className="eyebrow is-accent">
        {SLOT_LABEL[slot]} · {locked ? "Kept" : entry?.origin === "user" ? "Your pick" : "Muse pick"}
      </p>
      <h2 id={titleId} className="card-panel-title display">
        {piece.title}
      </h2>
      <p className="card-panel-house">
        {show.house}
        {show.season ? <span> · {show.season}</span> : null}
      </p>
      <p className="card-panel-meta">
        <span className={`chip-dot${piece.color === "print" ? " is-print" : ""}`} style={{ background: color.hex }} aria-hidden="true" />
        {color.label} · {piece.fit === "baggy" ? "baggy" : piece.fit === "slim" ? "slim" : "regular"} fit
      </p>
      {reasons.length > 0 && (
        <ul className="card-panel-why">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="card-panel-actions">
        <button type="button" className={changing ? "card-btn is-active" : "card-btn"} onClick={() => setChanging((c) => !c)} aria-expanded={changing}>
          <span aria-hidden="true">⇄</span> Change
        </button>
        <button type="button" className="card-btn" onClick={() => app.refine(slot)}>
          <span aria-hidden="true">✎</span> Refine
        </button>
        <button type="button" className={locked ? "card-btn is-active" : "card-btn"} onClick={() => app.toggleLock(slot)} aria-pressed={locked}>
          <span aria-hidden="true">{locked ? "★" : "☆"}</span> {locked ? "Kept" : "Keep"}
        </button>
        <button
          type="button"
          className="card-btn is-danger"
          onClick={() => {
            onClose();
            app.omit(slot);
          }}
        >
          <span aria-hidden="true">✕</span> Delete
        </button>
      </div>

      {changing && (
        <div className="card-panel-change">
          <p className="eyebrow">Swap for…</p>
          {alternatives.length === 0 ? (
            <p className="card-panel-note">Nothing else in the catalog suits this look here — try Refine.</p>
          ) : (
            <div className="card-alts">
              {alternatives.map((alt) => (
                <button key={alt.id} type="button" className="card-alt" onClick={() => app.replace(slot, alt)} title={`${alt.title} — ${showOf(alt.show).house}`}>
                  <span className="card-alt-photo">
                    <Photo image={alt.image} crop={alt.crop} alt="" px={96} />
                  </span>
                  <span className="card-alt-title">{alt.title}</span>
                  <span className="card-alt-house">{showOf(alt.show).house}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className="link-btn" onClick={() => app.swap(slot)}>
            Surprise me ↻
          </button>
        </div>
      )}

      <div className="card-panel-foot">
        {runway && (
          <a href={runway.href} target="_blank" rel="noreferrer noopener" className="card-panel-link">
            {runway.kind === "runway" ? `Seen on ${runway.name}` : runway.name} ↗
          </a>
        )}
        <Credit credit={piece.credit} />
      </div>
    </>
  );
}

// ── The post the look started from ──────────────────────────────────────────

function CoverPanel({ origin, app, titleId }: { origin: DraftOrigin; app: AppApi; titleId: string }) {
  const [playing, setPlaying] = useState(false);

  if (origin.kind === "live") {
    const { item } = origin;
    const host = hostOf(item.url);
    return (
      <>
        <p className="eyebrow is-accent">
          {LIVE_KIND_LABEL[item.kind as keyof typeof LIVE_KIND_LABEL] ?? "Live"} · {item.sourceName}
        </p>
        <h2 id={titleId} className="card-panel-title display">
          {item.title}
        </h2>
        {origin.reason && <p className="card-panel-house">The stack is built around the closest garment in the catalog — {origin.reason.toLowerCase()}.</p>}
        {item.credit && <p className="card-panel-meta">{item.credit}</p>}
        {item.video && playing && (
          <div className="card-panel-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.video)}?rel=0&modestbranding=1&autoplay=1`}
              title={item.title}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        )}
        <div className="card-panel-actions">
          {item.video && !playing && (
            <button type="button" className="card-btn is-active" onClick={() => setPlaying(true)}>
              <span aria-hidden="true">▶</span> Play the show
            </button>
          )}
          <a className="card-btn" href={item.url} target="_blank" rel="noreferrer noopener">
            Open on {siteName(host, item.sourceName)} ↗
          </a>
          <button
            type="button"
            className="card-btn is-danger"
            onClick={() => {
              dismissLiveItem(item.id);
              app.discard();
              navigate("home");
            }}
          >
            <span aria-hidden="true">✕</span> Not for me
          </button>
        </div>
        <p className="card-panel-note">
          Shown from {host}
          {item.kind === "pinterest" ? " (Pinterest)" : ""} — the picture belongs to its publisher and opens there in full.
        </p>
      </>
    );
  }

  // A catalog runway look (or the look a single garment came from).
  const lookId = origin.kind === "look" ? origin.lookId : (getLookIdOfPiece(app, origin.pieceId) ?? "");
  const look = getLook(lookId);
  if (!look) return <p className="card-panel-note">This look is no longer in the catalog.</p>;
  const show = showOf(look.show);
  const links = showLinks(look.show);
  return (
    <>
      <p className="eyebrow is-accent">
        {KIND_LABEL[show.kind]} · {show.season || show.house}
      </p>
      <h2 id={titleId} className="card-panel-title display">
        {show.house}
      </h2>
      <p className="card-panel-house">
        {origin.kind === "look"
          ? "The whole look as it walked — every garment is a card in the stack."
          : "The runway look this garment was cut from. The rest of the stack is Muse's pick to go with it."}
      </p>
      <div className="card-panel-actions">
        <button type="button" className="card-btn is-active" onClick={() => app.startFromLook(look)}>
          <span aria-hidden="true">↺</span> Wear it as shown
        </button>
        {links.map((l) => (
          <a key={l.id} className="card-btn" href={l.href} target="_blank" rel="noreferrer noopener" title={l.blurb}>
            {l.name} ↗
          </a>
        ))}
      </div>
      <div className="card-panel-foot">
        <Credit credit={look.credit} />
      </div>
    </>
  );
}

function getLookIdOfPiece(app: AppApi, pieceId: string): string | undefined {
  return Object.values(app.pieces).find((p) => p?.id === pieceId)?.look ?? pieceId.split("/")[0];
}

/** "www.vogue.com/…" → "vogue.com" */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Where "Open on …" really goes. */
function siteName(host: string, sourceName: string): string {
  if (host.endsWith("youtube.com")) return "YouTube";
  if (host.endsWith("pinterest.com")) return "Pinterest";
  if (host.endsWith("vam.ac.uk")) return "the V&A";
  if (host.endsWith("wikimedia.org")) return "Wikimedia Commons";
  return sourceName;
}
