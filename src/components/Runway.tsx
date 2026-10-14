/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/Runway.tsx — the finished look, presented like a show
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  This is where an outfit becomes a "runway look". From top to bottom:
 *
 *   STAGE      a dark runway with a sweeping spotlight. Each piece "walks in"
 *              one after another (staggered spring animation), head-to-toe.
 *   CARD       the look's name, silhouette, palette, mood and dress code, a
 *              line from Muse about WHY it suits you, and styling notes.
 *   ACTIONS    Save to closet · Edit · Shuffle another.
 *   ORIGINALS  "Seen on the runway": every piece was cut from a real photo
 *              (a runway look, street style or an archive piece). We show
 *              each original photo with its designer and season, plus links to
 *              that exact show on Vogue Runway, firstVIEW, ARCHIVE.pdf and WWD.
 *   LINKS      more places to explore — this season's shows, editorial sites,
 *              shops — pre-filled with this look's description
 *              (data/runwaySources.ts).
 *
 *  ABOUT THE LINKS
 *  Photos on firstVIEW / Vogue Runway / WWD / ARCHIVE.pdf are copyrighted and
 *  mostly paywalled, so we link to the real sites rather than embedding their
 *  pictures. Our own photos are Creative Commons (credited in the footer).
 *
 *  REPLAYING THE ENTRANCE
 *  The stage is keyed by the look's "signature" (the ids of its pieces). When
 *  you shuffle, the signature changes, React re-mounts the stage, and the
 *  walk-in animation plays again.
 */

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { getLook } from "../data/catalog";
import { mediaCredit, RUNWAY_BACKDROPS } from "../data/media";
import { buildSourceLinks, currentSeason, groupSourceLinks, showLinks } from "../data/runwaySources";
import { KIND_LABEL, showOf } from "../data/shows";
import type { CommonsCredit, Credit as CreditData, Slot } from "../data/types";
import { COLORS, SLOT_ORDER } from "../data/types";
import { SECTIONS, SLOT_LABEL } from "../data/wardrobe";
import { describeLook } from "../engine/copy";
import { hashString } from "../lib/hash";
import { navigate } from "../lib/router";
import { featureLabel, featuresOf } from "../model/features";
import { explain } from "../model/tasteModel";
import { useApp } from "../state/AppContext";
import { snapshotLook, useCloset } from "../state/ClosetContext";
import { useTaste } from "../state/TasteContext";
import { useToast } from "../state/ToastContext";
import { Credit, Photo } from "./Photo";

export function Runway() {
  const app = useApp();
  const taste = useTaste();
  const closet = useCloset();
  const toast = useToast();
  const draft = app.draft;
  const { pieces } = app;
  const [savedSignature, setSavedSignature] = useState<string | null>(null);

  const slots = SLOT_ORDER.filter((s) => pieces[s]);
  const signature = slots.map((s) => pieces[s]!.id).join("|");

  const facts = useMemo(() => describeLook(pieces, draft?.seed ?? 0), [pieces, draft?.seed]);
  const season = currentSeason();

  // ── Muse's one-line read on the look ────────────────────────────────────
  const museLine = useMemo(() => {
    const totals = new Map<string, number>();
    for (const piece of Object.values(pieces)) {
      if (!piece) continue;
      for (const c of explain(taste.state, featuresOf(piece), taste.crowd)) {
        if (c.feature.startsWith("dress:") || c.feature.startsWith("cat:") || c.feature.startsWith("color:")) continue;
        totals.set(c.feature, (totals.get(c.feature) ?? 0) + c.amount);
      }
    }
    const top = [...totals.entries()].filter(([, v]) => v > 0.02).sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (taste.state.picks >= 3 && top.length === 2) {
      return `You keep reaching for ${featureLabel(top[0][0])} and ${featureLabel(top[1][0])} — this look leans into both.`;
    }
    if (taste.state.picks >= 3 && top.length === 1) {
      return `This look leans into ${featureLabel(top[0][0])}, which you've been choosing a lot.`;
    }
    return "A first read from the editors. Save a few looks and tap through the options — I'll tailor this to you.";
  }, [pieces, taste.state, taste.crowd]);

  // ── Links out ───────────────────────────────────────────────────────────
  const groups = useMemo(
    () => groupSourceLinks(buildSourceLinks({ section: draft?.section ?? "menswear", query: facts.query, vibe: facts.vibe })),
    [draft?.section, facts.query, facts.vibe],
  );

  // ── The original photos the pieces were cut from (one entry per photo) ──
  const originals = useMemo(() => {
    const byLook = new Map<string, { lookId: string; show: string; titles: string[]; credit: CommonsCredit }>();
    for (const slot of SLOT_ORDER) {
      const piece = pieces[slot];
      const look = getLook(piece?.look);
      if (!piece || !look) continue;
      const entry = byLook.get(look.id) ?? { lookId: look.id, show: look.show, titles: [], credit: look.credit };
      entry.titles.push(piece.title);
      byLook.set(look.id, entry);
    }
    return [...byLook.values()];
  }, [pieces]);

  // ── Empty state ─────────────────────────────────────────────────────────
  if (!draft || !app.complete) {
    return (
      <div className="empty">
        <p className="eyebrow">Runway</p>
        <h2>Nothing on the runway yet</h2>
        <p>Build a look first — pick one piece and I&apos;ll do the rest — then send it down here.</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate("build")}>
          Build a look
        </button>
      </div>
    );
  }

  const backdrop = RUNWAY_BACKDROPS[hashString(signature) % RUNWAY_BACKDROPS.length];
  const saved = savedSignature === signature;
  const lookNumber = String(closet.outfits.length + (saved ? 0 : 1)).padStart(2, "0");

  const save = () => {
    if (saved) return navigate("closet");
    closet.save({ section: draft.section, slots: snapshotLook(pieces), name: facts.name });
    taste.recordPieces("look-save", draft.section, Object.values(pieces).filter((p): p is NonNullable<typeof p> => !!p));
    setSavedSignature(signature);
    toast.push({ message: `“${facts.name}” is in your closet`, actionLabel: "View", onAction: () => navigate("closet") });
  };

  return (
    <div className="runway on-dark">
      {/* Atmosphere */}
      <div className="runway-backdrop" aria-hidden="true">
        <Photo image={backdrop.look} alt={backdrop.alt} px={900} />
      </div>
      <motion.div
        className="runway-spot"
        aria-hidden="true"
        animate={{ x: ["-10%", "10%", "-10%"], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="runway-content">
        <header className="runway-head">
          <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
            {season.label} · {SECTIONS[draft.section].label} · Look no. {lookNumber}
          </motion.p>
          <motion.h1
            key={facts.name}
            className="runway-name display"
            initial={{ opacity: 0, y: 24, letterSpacing: "0.12em" }}
            animate={{ opacity: 1, y: 0, letterSpacing: "0.005em" }}
            transition={{ duration: 1, ease: [0.22, 0.9, 0.24, 1] }}
          >
            {facts.name}
          </motion.h1>
        </header>

        {/* The line-up. `key` replays the walk-in whenever the look changes. */}
        <div className="runway-stage" key={signature}>
          <div className="runway-line">
            {slots.map((slot: Slot, i) => {
              const piece = pieces[slot]!;
              return (
                <motion.figure
                  key={slot}
                  className="runway-frame"
                  initial={{ opacity: 0, y: -90, scale: 0.72, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                  transition={{ delay: 0.45 + i * 0.24, type: "spring", stiffness: 110, damping: 19 }}
                >
                  <div className="runway-frame-photo">
                    <Photo image={piece.image} crop={piece.crop} alt={piece.title} px={220} eager />
                  </div>
                  <figcaption>
                    <span className="runway-frame-slot">{SLOT_LABEL[slot]}</span>
                    <span className="runway-frame-title">{piece.title}</span>
                    <span className="runway-frame-house">{showOf(piece.show).house}</span>
                  </figcaption>
                  <span className="runway-frame-shadow" aria-hidden="true" />
                </motion.figure>
              );
            })}
          </div>
          <div className="runway-floor" aria-hidden="true" />
        </div>

        {/* The show notes */}
        <motion.section
          className="runway-card"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 + slots.length * 0.24, duration: 0.7 }}
        >
          <dl className="runway-facts">
            <div>
              <dt>Silhouette</dt>
              <dd>{facts.silhouette}</dd>
            </div>
            <div>
              <dt>Palette</dt>
              <dd className="runway-palette">
                {facts.palette.map((c) => (
                  <span key={c.name} className="runway-chip">
                    <span className="chip-dot" style={{ background: COLORS[c.name].hex }} aria-hidden="true" />
                    {c.label}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Mood</dt>
              <dd>{facts.vibes.slice(0, 2).join(" · ")}</dd>
            </div>
            <div>
              <dt>Dress code</dt>
              <dd>{facts.formalityLabel}</dd>
            </div>
          </dl>

          <div className="runway-muse">
            <span className="runway-muse-mark" aria-hidden="true">
              ✦
            </span>
            <div>
              <p className="eyebrow">Muse says</p>
              <p className="runway-muse-line">{museLine}</p>
            </div>
          </div>

          {facts.notes.length > 0 && (
            <ul className="runway-notes">
              {facts.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}

          <div className="runway-actions">
            <button type="button" className={saved ? "btn btn-accent" : "btn btn-primary on-dark-btn"} onClick={save}>
              {saved ? "Saved ✓ — view closet" : "Save to closet"}
            </button>
            <button type="button" className="btn btn-ghost on-dark-btn" onClick={() => navigate("build")}>
              Edit the look
            </button>
            <button type="button" className="btn btn-ghost on-dark-btn" onClick={app.shuffle}>
              ↻ Shuffle another
            </button>
          </div>
        </motion.section>

        {/* The original runway photos */}
        {originals.length > 0 && (
          <section className="runway-originals" aria-labelledby="originals-heading">
            <div className="runway-sources-head">
              <h2 id="originals-heading" className="display">
                Seen on the runway
              </h2>
              <p>
                Every piece here was cut from a real photo. These are the originals — tap through to see the full
                collections on Vogue Runway, firstVIEW, ARCHIVE.pdf and WWD.
              </p>
            </div>
            <div className="runway-original-list">
              {originals.map((o, i) => {
                const show = showOf(o.show);
                return (
                  <motion.article
                    key={o.lookId}
                    className="runway-original"
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.08, type: "spring", stiffness: 160, damping: 22 }}
                  >
                    <div className="runway-original-photo">
                      <Photo image={o.lookId} alt={`${show.house}, ${show.season}`} px={200} />
                    </div>
                    <div className="runway-original-copy">
                      <span className="eyebrow">{KIND_LABEL[show.kind]}</span>
                      <strong className="runway-original-house">{show.house}</strong>
                      <span className="runway-original-season">
                        {[show.season, show.city].filter(Boolean).join(" · ")}
                      </span>
                      <span className="runway-original-pieces">{o.titles.join(" · ")}</span>
                      <span className="runway-original-links">
                        {showLinks(o.show).map((link) => (
                          <a key={link.id} href={link.href} target="_blank" rel="noreferrer noopener" className="runway-original-link">
                            {link.name}
                            {link.paywalled ? " ⓢ" : ""} <span aria-hidden="true">↗</span>
                          </a>
                        ))}
                      </span>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </section>
        )}

        {/* Links */}
        <section className="runway-sources" aria-labelledby="sources-heading">
          <div className="runway-sources-head">
            <h2 id="sources-heading" className="display">
              More to explore
            </h2>
            <p>
              This season&apos;s shows, plus editorials and shops that echo <em>“{facts.query}”</em>. Their photography
              belongs to its publishers, so these open the original sites.
            </p>
          </div>

          <div className="runway-source-groups">
            {groups.map((group) => (
              <div key={group.kind} className="runway-source-group">
                <h3 className="eyebrow">{group.title}</h3>
                <div className="runway-source-list">
                  {group.links.map((link) => (
                    <a key={link.id} className="source-link" href={link.href} target="_blank" rel="noreferrer noopener">
                      <span className="source-link-name">{link.name}</span>
                      <span className="source-link-blurb">{link.blurb}</span>
                      {link.paywalled && <span className="source-link-tag">Subscription</span>}
                      <span className="source-link-arrow" aria-hidden="true">
                        ↗
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <footer className="runway-foot">
          {uniqueCredits([mediaCredit(backdrop), ...originals.map((o) => o.credit)]).map((c) => (
            <Credit key={"title" in c ? c.title : c.unsplashId} credit={c} className="on-dark" />
          ))}
        </footer>
      </div>
    </div>
  );
}

/** Credits without duplicates (several pieces often share one photo). */
function uniqueCredits(credits: (CreditData | undefined)[]): CreditData[] {
  const seen = new Set<string>();
  const out: CreditData[] = [];
  for (const c of credits) {
    if (!c) continue;
    const key = "title" in c ? c.title : c.unsplashId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
