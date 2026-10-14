/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  App.tsx — the shell: providers, header, and which page to show
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  A MAP OF THE WHOLE APP  (read this first)
 *
 *    main.tsx ─► <App/>
 *                 │
 *                 ├─ MotionConfig        respects "reduce motion" for every animation
 *                 ├─ ErrorBoundary       friendly recovery screen if anything crashes
 *                 ├─ ToastProvider       pop-up messages
 *                 ├─ SectionProvider     menswear | womenswear (+ remembered)
 *                 ├─ TasteProvider       the learning model ("Muse")  ← model/*
 *                 ├─ ClosetProvider      saved outfits + Supabase sync ← lib/*
 *                 ├─ StashProvider       stacks set aside ("Your stacks")
 *                 ├─ AppProvider         the outfit being built        ← state/draft.ts
 *                 │
 *                 └─ <Shell/>
 *                      ├─ <TopBar/>        navigation + section switch + Muse button
 *                      ├─ <main>           ONE of these, by URL hash (lib/router.ts):
 *                      │     #/home    → <SectionGate/> (first visit) or <Home/>
 *                      │                 (the endless, drifting feed)
 *                      │     #/build   → <Builder/>   (start → questions → stack of cards)
 *                      │     #/runway  → <Runway/>
 *                      │     #/closet  → <Closet/>
 *                      │     #/about   → <About/>     (sources, Pinterest, your data)
 *                      ├─ <SiteFooter/>    About · Privacy · Terms (not on the endless home feed)
 *                      ├─ <StackTray/>     "Your stacks" — the pile in the bottom-left corner
 *                      └─ <MuseInsights/>  the slide-over drawer (loaded the first time it opens)
 *
 *  (main.tsx shows <PinterestCallback/> instead of all this when Pinterest
 *   sends the browser back after "Connect Pinterest".)
 *
 *  WHY SO MANY "PROVIDERS"?
 *  Each provider owns one concern and exposes it through a hook (`useTaste()`,
 *  `useCloset()`, `useApp()`…). Components then ask for exactly what they need
 *  instead of passing props down five levels. The ORDER matters: a provider can
 *  only use the ones above it (e.g. the closet uses toasts; the builder uses
 *  the taste model).
 *
 *  LOADING ONLY WHAT'S NEEDED
 *  The Runway, Closet and About pages and the Muse drawer are `lazy()`: their
 *  code is a separate file the browser fetches the first time you go there,
 *  so the first visit downloads (and starts) less. The home feed, the gate
 *  and the builder load up front because they're where everyone begins.
 *
 *  PAGE TRANSITIONS
 *  `AnimatePresence mode="wait"` fades the old page out, then the new one in.
 *  Giving the page a `key` is what tells React "this is a different page".
 */

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Builder } from "./components/builder/Builder";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Home } from "./components/Home";
import { SectionGate } from "./components/SectionGate";
import { StackTray } from "./components/StackTray";
import { TopBar } from "./components/TopBar";
import { activeFeedHasPosition } from "./feed/memory";
import { useRoute } from "./lib/router";
import { sitePath } from "./lib/paths";
import { SITE } from "./site";
import { AppProvider } from "./state/AppContext";
import { ClosetProvider } from "./state/ClosetContext";
import { SectionProvider, useSection } from "./state/SectionContext";
import { TasteProvider } from "./state/TasteContext";
import { StashProvider } from "./state/StashContext";
import { ToastProvider } from "./state/ToastContext";

// Pages fetched on first visit (see "LOADING ONLY WHAT'S NEEDED" above).
const About = lazy(() => import("./components/About").then((m) => ({ default: m.About })));
const Closet = lazy(() => import("./components/Closet").then((m) => ({ default: m.Closet })));
const Runway = lazy(() => import("./components/Runway").then((m) => ({ default: m.Runway })));
const MuseInsights = lazy(() => import("./components/MuseInsights").then((m) => ({ default: m.MuseInsights })));

export default function App() {
  return (
    // "user" = follow the operating system's "reduce motion" accessibility setting.
    <MotionConfig reducedMotion="user">
      {/* Outermost: if anything crashes, show a recovery screen, not a blank page. */}
      <ErrorBoundary>
        <ToastProvider>
          <SectionProvider>
            <TasteProvider>
              <ClosetProvider>
                <StashProvider>
                  <AppProvider>
                    <Shell />
                  </AppProvider>
                </StashProvider>
              </ClosetProvider>
            </TasteProvider>
          </SectionProvider>
        </ToastProvider>
      </ErrorBoundary>
    </MotionConfig>
  );
}

/** Everything inside the providers. */
function Shell() {
  const route = useRoute();
  const { section } = useSection();
  const [museOpen, setMuseOpen] = useState(false);
  // The drawer's code is only fetched once someone opens it.
  const [museLoaded, setMuseLoaded] = useState(false);
  useEffect(() => {
    if (museOpen) setMuseLoaded(true);
  }, [museOpen]);

  // Start a new page at the top — except the home feed, which returns you to
  // where you were (feed/memory.ts).
  useEffect(() => {
    if (route === "home" && activeFeedHasPosition()) return;
    window.scrollTo({ top: 0 });
  }, [route, section]);

  // Which page? The closet and About work without a section; everything else needs one.
  let pageKey: string = route;
  let page;
  if (route === "closet") {
    page = <Closet />;
  } else if (route === "about") {
    page = <About />;
  } else if (!section) {
    pageKey = "gate";
    page = <SectionGate />;
  } else if (route === "build") {
    page = <Builder />;
  } else if (route === "runway") {
    page = <Runway />;
  } else {
    page = <Home />;
  }

  return (
    <div className="app">
      <TopBar onOpenMuse={() => setMuseOpen(true)} />

      <main className="main" id="main">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${pageKey}:${section ?? "none"}`}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: [0.22, 0.9, 0.24, 1] }}
          >
            {/* A lazy page shows nothing for the moment its file is fetching. */}
            <Suspense fallback={<div className="page-loading" aria-busy="true" />}>{page}</Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* The endless home feed has no bottom, so its links sit in its header instead. */}
      {!(pageKey === "home") && (
        <footer className="site-footer">
          <span>{SITE.name}</span>
          <a href="#/about">About</a>
          <a href={sitePath("privacy/")}>Privacy</a>
          <a href={sitePath("terms/")}>Terms</a>
        </footer>
      )}

      <StackTray />

      {museLoaded && (
        <Suspense fallback={null}>
          <MuseInsights open={museOpen} onClose={() => setMuseOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
