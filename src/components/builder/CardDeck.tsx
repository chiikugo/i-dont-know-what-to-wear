/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/builder/CardDeck.tsx — the outfit as a stack of cards
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The "next page" after you open a post on the home feed. The post itself
 *  lands on top of the pile (it flies in from where it was on the home page),
 *  and under it is one card per garment of the outfit, head to toe.
 *
 *      HOVER the pile   → it fans out like a hand of cards
 *      HOVER a card     → it lifts: that's the piece you're picking
 *      CLICK a card     → its options open (Change · Refine · Keep · Delete);
 *                         the top card shows the original post
 *      on a PHONE       → tap the pile to fan it; then SLIDE a finger across
 *                         the cards to lift one and let go to open it (or tap)
 *      KEYBOARD         → Tab to a card (the pile fans), Enter opens, Esc closes
 *
 *  The geometry (where every card sits) is in deckLayout.ts; the options panel
 *  is CardPanel.tsx; the outfit itself comes from state/AppContext.tsx.
 */

import { animate, AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getLook } from "../../data/catalog";
import { showOf } from "../../data/shows";
import type { Slot } from "../../data/types";
import { SLOT_ORDER } from "../../data/types";
import { SLOT_LABEL } from "../../data/wardrobe";
import { takeHandoff } from "../../feed/memory";
import { LIVE_KIND_LABEL } from "../../live/sources";
import type { AppApi } from "../../state/AppContext";
import { Photo } from "../Photo";
import { CardPanel, type DeckCardData } from "./CardPanel";
import { cardSize, fanPose, stackPose, type Pose } from "./deckLayout";

interface CardDeckProps {
  app: AppApi;
  /** Why the engine picked each piece. */
  reasons: Partial<Record<Slot, string[]>>;
}

/** True while the screen is at most `px` wide. */
function useNarrow(px: number): boolean {
  const query = `(max-width: ${px}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return narrow;
}

export function CardDeck({ app, reasons }: CardDeckProps) {
  const draft = app.draft!;
  const narrow = useNarrow(899);

  // The cards: the post on top, then each garment head to toe.
  const cards = useMemo<DeckCardData[]>(() => {
    const out: DeckCardData[] = [];
    if (draft.origin) out.push({ key: "cover", kind: "cover", origin: draft.origin });
    for (const slot of SLOT_ORDER) {
      const piece = app.pieces[slot];
      if (piece) out.push({ key: slot, kind: "piece", slot, piece });
    }
    return out;
  }, [draft.origin, app.pieces]);

  const [fanned, setFanned] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openIndex = openKey ? cards.findIndex((c) => c.key === openKey) : -1;
  const openCard = openIndex >= 0 ? cards[openIndex] : null;

  // A card that was deleted closes its panel.
  useEffect(() => {
    if (openKey && openIndex === -1) setOpenKey(null);
  }, [openKey, openIndex]);

  // ── Size ───────────────────────────────────────────────────────────────
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageW, setStageW] = useState(0);
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStageW(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const card = cardSize(narrow ? stageW * 1.05 : Math.min(stageW, 760));

  // ── Poses ──────────────────────────────────────────────────────────────
  const spread = fanned || openCard !== null;
  const lifted = openIndex >= 0 ? openIndex : picked;
  const poseOf = (i: number): Pose => (spread ? fanPose(i, cards.length, stageW - 16, card.w, lifted) : stackPose(i, cards.length));

  // ── The fly-in from the home feed ──────────────────────────────────────
  const handoff = useRef(takeHandoff());
  const coverFly = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const h = handoff.current;
    const el = coverFly.current;
    if (!h || !el || stageW === 0) return;
    handoff.current = null;
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    animate(
      el,
      { x: [h.rect.left - r.left, 0], y: [h.rect.top - r.top, 0], scale: [h.rect.width / r.width, 1] },
      { type: "spring", stiffness: 140, damping: 20 },
    );
  }, [stageW]);

  // ── Interaction ────────────────────────────────────────────────────────
  /** Open a card's options (clicking an open card again closes them, unless `toggle` is false). */
  const open = useCallback(
    (i: number, toggle = true) => {
      const c = cards[i];
      if (!c) return;
      setOpenKey((k) => (toggle && k === c.key ? null : c.key));
      setFanned(true);
    },
    [cards],
  );
  const close = useCallback(() => setOpenKey(null), []);

  // ── Phones: slide a finger across the fanned cards to pick one ─────────
  // (The browser keeps vertical swipes for scrolling: `touch-action: pan-y`.)
  const slide = useRef<{ startX: number; moved: boolean } | null>(null);
  const slideEndedAt = useRef(0);
  const cardAt = (x: number, y: number): number | null => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-deck-index]");
    return el ? Number(el.dataset.deckIndex) : null;
  };
  const onTouchDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !spread) return;
    slide.current = { startX: e.clientX, moved: false };
  };
  const onTouchMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !slide.current) return;
    if (Math.abs(e.clientX - slide.current.startX) > 8) slide.current.moved = true;
    if (!slide.current.moved) return;
    const i = cardAt(e.clientX, e.clientY);
    if (i !== null && i !== picked) setPicked(i);
  };
  const onTouchUp = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || !slide.current) return;
    const { moved } = slide.current;
    slide.current = null;
    // A slide ends by opening the card under the finger; a plain tap is a click.
    if (moved && picked !== null) {
      slideEndedAt.current = performance.now();
      open(picked, false);
    }
  };

  const onCardClick = (i: number, e: React.MouseEvent) => {
    // The click a browser may send at the end of a slide was already handled.
    if (performance.now() - slideEndedAt.current < 400) return;
    // On touch screens the first tap fans the pile instead of opening the top card.
    const touch = (e.nativeEvent as PointerEvent).pointerType === "touch";
    if (touch && !spread) {
      setFanned(true);
      return;
    }
    open(i);
  };

  const deckLabel = `${cards.length} cards — ${cards.map((c) => (c.kind === "cover" ? "the post" : SLOT_LABEL[c.slot].toLowerCase())).join(", ")}`;

  return (
    <div className={`deck-stage${openCard && !narrow ? " has-panel" : ""}`}>
      <div
        ref={stageRef}
        className={`deck${spread ? " is-fanned" : ""}`}
        style={{ height: card.h + (narrow ? 110 : 150) }}
        // Fan on any mouse movement over the pile (not just "enter": the pile may
        // appear right under a pointer that never crossed its edge).
        onPointerMove={(e) => e.pointerType === "mouse" && !fanned && setFanned(true)}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse") return;
          setPicked(null);
          if (!openCard) setFanned(false);
        }}
        onPointerDown={onTouchDown}
        onPointerUp={onTouchUp}
        onPointerCancel={() => (slide.current = null)}
        onPointerMoveCapture={onTouchMove}
        onFocus={() => setFanned(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node) && !openCard) setFanned(false);
        }}
        role="list"
        aria-label={deckLabel}
      >
        <AnimatePresence>
        {cards.map((c, i) => {
          const pose = poseOf(i);
          const isOpen = openKey === c.key;
          return (
            <motion.div
              key={c.key}
              role="listitem"
              data-deck-index={i}
              className={`deck-card${isOpen ? " is-open" : ""}${c.kind === "cover" ? " is-cover" : ""}${lifted === i ? " is-picked" : ""}`}
              style={{ width: card.w, height: card.h + 48, marginLeft: -card.w / 2, marginTop: -(card.h + 48) / 2, zIndex: pose.z }}
              initial={c.kind === "cover" ? { ...pose, opacity: 1 } : { ...pose, y: pose.y + 140, opacity: 0 }}
              animate={{ x: pose.x, y: pose.y, rotate: pose.rotate, scale: pose.scale, opacity: 1 }}
              exit={{ opacity: 0, y: pose.y + 120, rotate: pose.rotate * 2, transition: { duration: 0.3 } }}
              transition={{ type: "spring", stiffness: 260, damping: 26 }}
              onPointerMove={(e) => e.pointerType === "mouse" && picked !== i && setPicked(i)}
            >
              <div ref={c.kind === "cover" ? coverFly : undefined} className="deck-card-fly">
                <button
                  type="button"
                  className="deck-card-hit"
                  onClick={(e) => onCardClick(i, e)}
                  aria-expanded={isOpen}
                  aria-label={cardLabel(c, app)}
                >
                  <CardFace data={c} app={app} width={card.w} imageH={card.h} />
                </button>
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
        {cards.length === 0 && <p className="deck-empty">Every card is out of the stack — add one back below.</p>}
      </div>

      {/* The options: beside the pile on wide screens, a sheet from the bottom on phones. */}
      {!narrow && (
        <AnimatePresence mode="wait">
          {openCard && <CardPanel key={openCard.key} card={openCard} app={app} reasons={openCard.kind === "piece" ? (reasons[openCard.slot] ?? []) : []} onClose={close} />}
        </AnimatePresence>
      )}
      {narrow &&
        createPortal(
          <AnimatePresence>
            {openCard && (
              <motion.div className="card-sheet-backdrop" key="sheet" onClick={close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <motion.div
                  className="card-sheet"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", stiffness: 300, damping: 32 }}
                >
                  <CardPanel key={openCard.key} card={openCard} app={app} reasons={openCard.kind === "piece" ? (reasons[openCard.slot] ?? []) : []} onClose={close} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

      <p className="deck-hint" aria-hidden="true">
        {spread
          ? narrow
            ? "Slide across the cards and let go on the one you want — or tap it."
            : "Pick a card to change, refine, keep or delete it."
          : narrow
            ? "Tap the stack to fan it out."
            : "Hover the stack to fan it out."}
      </p>
    </div>
  );
}

/** What a screen reader hears for a card. */
function cardLabel(c: DeckCardData, app: AppApi): string {
  if (c.kind === "piece") {
    const entry = app.draft?.slots[c.slot];
    return `${SLOT_LABEL[c.slot]}: ${c.piece.title}, ${showOf(c.piece.show).house}${entry?.locked ? " (kept)" : ""}. Open options.`;
  }
  const o = c.origin;
  if (o.kind === "live") return `The post: ${o.item.title} — ${o.item.sourceName}. Open details.`;
  const lookId = o.kind === "look" ? o.lookId : o.pieceId.split("/")[0];
  return `The runway look: ${showOf(getLook(lookId)?.show).house}. Open details.`;
}

/** The front of a card: the picture, and a label strip underneath (never on top of a pin). */
function CardFace({ data, app, width, imageH }: { data: DeckCardData; app: AppApi; width: number; imageH: number }) {
  const [broken, setBroken] = useState(false);

  if (data.kind === "piece") {
    const entry = app.draft?.slots[data.slot];
    return (
      <>
        <span className="deck-card-photo" style={{ height: imageH }}>
          <Photo image={data.piece.image} crop={data.piece.crop} alt="" px={width} />
          {entry?.locked && <span className="deck-card-badge">★ Kept</span>}
        </span>
        <span className="deck-card-label">
          <span className="deck-card-slot">{SLOT_LABEL[data.slot]}</span>
          <span className="deck-card-title">{data.piece.title}</span>
        </span>
      </>
    );
  }

  const o = data.origin;
  if (o.kind === "live") {
    const natural = o.item.kind === "pinterest" || o.item.kind === "archive";
    return (
      <>
        <span className={`deck-card-photo${natural ? " is-natural" : ""}${o.item.video ? " is-video" : ""}`} style={{ height: imageH }}>
          {broken ? (
            <span className="deck-card-fallback">{o.item.sourceName}</span>
          ) : (
            <img src={o.item.imageLarge ?? o.item.image} alt="" referrerPolicy="no-referrer" draggable={false} onError={() => setBroken(true)} />
          )}
          {o.item.video && (
            <span className="deck-card-play" aria-hidden="true">
              ▶
            </span>
          )}
        </span>
        <span className="deck-card-label">
          <span className="deck-card-slot">
            {LIVE_KIND_LABEL[o.item.kind as keyof typeof LIVE_KIND_LABEL] ?? "Post"} · {o.item.sourceName}
          </span>
          <span className="deck-card-title">{o.item.title}</span>
        </span>
      </>
    );
  }

  const lookId = o.kind === "look" ? o.lookId : o.pieceId.split("/")[0];
  const look = getLook(lookId);
  const show = showOf(look?.show);
  return (
    <>
      <span className="deck-card-photo" style={{ height: imageH }}>
        {look && <Photo image={look.id} alt="" px={width} anchor="top" />}
      </span>
      <span className="deck-card-label">
        <span className="deck-card-slot">The runway look · {show.season || "Archive"}</span>
        <span className="deck-card-title">{show.house}</span>
      </span>
    </>
  );
}
