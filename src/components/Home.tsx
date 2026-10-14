/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/Home.tsx — the home page: a short header, then the endless feed
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Top to bottom:
 *    1. HEADER   your section and the season, the title, and one sentence from
 *                Muse (the taste model) about what it has learned so far.
 *    2. LIVE     a status line: the live sources refresh every few minutes.
 *    3. CHIPS    what to show (Everything · Runway · Shows · Street style ·
 *                Pinterest · Archive · Garments) and a mood. Mood chips also
 *                teach Muse.
 *    4. LINKS    "Start a look with…" each category; the runway archives
 *                (Vogue Runway, firstVIEW, ARCHIVE.pdf); About · Privacy · Terms.
 *    5. CONTINUE (only if a look is in progress) jump back in.
 *    6. THE FEED an asymmetrical wall of posts that slowly scrolls itself and
 *                never ends — components/feed/Feed.tsx. Hover a post (or click
 *                it) to open it as a stack of cards on the next page.
 *
 *  WHERE THE "MODEL" SHOWS UP
 *  The feed's queues are ranked by Muse, and re-ranked after everything you do
 *  (open, dismiss, pick a mood) — the posts still to come follow your taste,
 *  while the ones on screen stay put.
 */

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { buildSourceLinks, currentSeason } from "../data/runwaySources";
import type { Vibe } from "../data/types";
import { SLOT_ORDER, VIBES, VIBE_ORDER } from "../data/types";
import { categoriesFor, categoryLabel, SECTIONS, SLOT_LABEL } from "../data/wardrobe";
import { piecesForSection } from "../engine/resolver";
import { FILTER_LABEL, FILTER_ORDER, type FeedFilter } from "../feed/posts";
import { navigate } from "../lib/router";
import { sitePath } from "../lib/paths";
import { timeAgo } from "../live/feed";
import { REFRESH_MINUTES } from "../live/sources";
import { useLiveFeed } from "../live/useLiveFeed";
import { buildHomeFeed } from "../model/recommend";
import { useApp } from "../state/AppContext";
import { useSection } from "../state/SectionContext";
import { useTaste } from "../state/TasteContext";
import { Feed } from "./feed/Feed";
import { Photo } from "./Photo";

export function Home() {
  const { section } = useSection();
  const app = useApp();
  const taste = useTaste();
  const live = useLiveFeed();
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const [filter, setFilter] = useState<FeedFilter>("all");

  // `Home` only renders once a section is chosen (App.tsx guarantees it).
  const sec = section!;
  const season = currentSeason();

  // Muse's one-line read on you.
  const headline = useMemo(
    () => buildHomeFeed({ section: sec, state: taste.state, crowd: taste.crowd, dismissed: taste.dismissed, limit: 1 }).headline,
    [sec, taste.state, taste.crowd, taste.dismissed],
  );

  // Moods that have enough pieces to be worth a chip.
  const moods = useMemo(() => {
    const counts = new Map<Vibe, number>();
    for (const p of piecesForSection(sec)) for (const v of p.vibes) counts.set(v, (counts.get(v) ?? 0) + 1);
    return VIBE_ORDER.filter((v) => (counts.get(v) ?? 0) >= 6);
  }, [sec]);

  const categories = useMemo(() => categoriesFor(sec), [sec]);

  const archives = useMemo(
    () =>
      buildSourceLinks({ section: sec, query: sec === "womenswear" ? "ready to wear runway" : "menswear runway", vibe: vibe ?? undefined }).filter((l) =>
        ["vogue-runway", "firstview", "archivepdf"].includes(l.id),
      ),
    [sec, vibe],
  );

  const toggleMood = (v: Vibe) => {
    if (vibe === v) return setVibe(null);
    setVibe(v);
    taste.record("vibe-chip", sec, [`vibe:${v}`]); // teach the model
  };

  const liveSources = live.statuses.filter((s) => s.ok && s.count > 0).length;
  const draftSlots = SLOT_ORDER.filter((s) => app.pieces[s]);

  return (
    <div className="home">
      {/* 1 ── header */}
      <header className="home-hero">
        <div className="home-hero-top">
          <motion.p className="eyebrow is-accent" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            {SECTIONS[sec].label} · {season.label}
          </motion.p>
          <nav className="home-site-links" aria-label="About this site">
            <a href="#/about">About</a>
            <a href={sitePath("privacy/")}>Privacy</a>
            <a href={sitePath("terms/")}>Terms</a>
          </nav>
        </div>

        <motion.h1
          className="home-title display"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, type: "spring", stiffness: 180, damping: 24 }}
        >
          I don&apos;t know <em>what to wear</em>
        </motion.h1>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={headline}
            className="home-lede"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <span className="home-lede-mark" aria-hidden="true">
              ✦
            </span>{" "}
            {headline} <span className="only-hover">Hover a look to open it as a stack of cards.</span>
            <span className="only-touch">Tap a look to open it as a stack of cards.</span>
          </motion.p>
        </AnimatePresence>

        {/* 2 ── live status */}
        <p className="live-status" aria-live="polite">
          <span className={`live-dot${live.loading ? " is-loading" : ""}`} aria-hidden="true" />
          <strong>Live</strong>
          <span>
            {live.updatedAt ? `updated ${timeAgo(new Date(live.updatedAt).toISOString())}` : "connecting…"} · refreshes every {REFRESH_MINUTES} min
            {liveSources > 0 && (
              <>
                {" "}
                · <a href="#/about">{liveSources} sources</a>
              </>
            )}
          </span>
          <button type="button" className="link-btn live-refresh" onClick={live.refresh} disabled={live.loading}>
            {live.loading ? "Refreshing…" : "Refresh now"}
          </button>
        </p>

        {/* 3 ── chips */}
        <div className="home-chips">
          <div className="mood-row" role="group" aria-label="What to show">
            {FILTER_ORDER.map((f) => (
              <button key={f} type="button" className={filter === f ? "chip is-active" : "chip"} onClick={() => setFilter(f)} aria-pressed={filter === f}>
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="mood-row mood-row--moods" role="group" aria-label="Filter by mood">
            <span className="home-chips-label">Mood</span>
            {moods.map((v) => (
              <button
                key={v}
                type="button"
                className={vibe === v ? "chip chip-sm is-active" : "chip chip-sm"}
                onClick={() => toggleMood(v)}
                title={VIBES[v].blurb}
                aria-pressed={vibe === v}
              >
                {VIBES[v].label}
              </button>
            ))}
          </div>
        </div>

        {/* 4 ── links */}
        <nav className="home-start" aria-label="Start a look with a category">
          <span className="home-chips-label">Start with</span>
          {categories.map((c) => (
            <button key={c.id} type="button" className="home-start-link" onClick={() => app.startFromCategory(c.id)}>
              {categoryLabel(c.id, sec)}
            </button>
          ))}
          <span className="home-start-sep" aria-hidden="true" />
          {archives.map((s) => (
            <a key={s.id} className="home-archive-link" href={s.href} target="_blank" rel="noreferrer noopener" title={s.blurb}>
              {s.name} ↗
            </a>
          ))}
        </nav>
      </header>

      {/* 5 ── continue */}
      <AnimatePresence>
        {app.draft && draftSlots.length > 0 && (
          <motion.section className="continue" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <div className="continue-inner">
              <div className="continue-thumbs" aria-hidden="true">
                {draftSlots.map((slot) => {
                  const p = app.pieces[slot]!;
                  return (
                    <span key={slot} className="continue-thumb" title={SLOT_LABEL[slot]}>
                      <Photo image={p.image} crop={p.crop} alt="" px={64} sizes="64px" widths={[160, 320]} />
                    </span>
                  );
                })}
              </div>
              <div className="continue-copy">
                <span className="eyebrow">In progress</span>
                <strong>You have a stack going.</strong>
              </div>
              <div className="continue-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate("build")}>
                  Continue
                </button>
                <button type="button" className="link-btn" onClick={app.discard}>
                  Start over
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* 6 ── the endless feed */}
      <Feed section={sec} filter={filter} vibe={vibe} />
    </div>
  );
}
