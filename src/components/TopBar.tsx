/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  components/TopBar.tsx — brand, navigation, section switch, Muse button
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  LAYOUT
 *    desktop:  [ What to Wear ]   Home · Build · Runway · Closet   [Men|Women] [✦ Muse]
 *    phone:    brand + switch + Muse on top; the nav becomes a bottom tab bar.
 *    (That responsive switch is pure CSS — see styles/topbar.css.)
 *
 *  THE ANIMATED INDICATORS
 *  The little pill that slides behind the active tab (and behind the active
 *  section) uses the `motion` library's *shared layout* feature: two elements
 *  in different places share a `layoutId`, and when the "active" one moves,
 *  motion animates it smoothly from the old position to the new one. We write
 *  no animation maths ourselves.
 *
 *  NAV ITEMS ARE REAL LINKS
 *  Each tab is an <a href="#/closet">. That's good for accessibility (screen
 *  readers, middle-click, keyboard) and means we need no click handlers —
 *  the hash router in lib/router.ts reacts to the address changing.
 */

import { LayoutGroup, motion } from "motion/react";
import type { Route } from "../lib/router";
import { useRoute } from "../lib/router";
import { SECTION_IDS, SECTIONS } from "../data/wardrobe";
import { useApp } from "../state/AppContext";
import { useCloset } from "../state/ClosetContext";
import { useSection } from "../state/SectionContext";
import { useTaste } from "../state/TasteContext";

interface Tab {
  id: Route;
  label: string;
  /** A small number shown next to the label. */
  count?: number;
  /** A small dot (something is in progress). */
  dot?: boolean;
}

export function TopBar({ onOpenMuse }: { onOpenMuse: () => void }) {
  const route = useRoute();
  const { section } = useSection();
  const app = useApp();
  const { outfits } = useCloset();
  const taste = useTaste();

  const tabs: Tab[] = [
    { id: "home", label: "Home" },
    { id: "build", label: "Build", dot: Boolean(app.draft) && route !== "build" },
    ...(app.complete ? ([{ id: "runway", label: "Runway" }] as Tab[]) : []),
    { id: "closet", label: "Closet", count: outfits.length },
  ];

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <a className="brand" href="#/home" aria-label="What to Wear — home">
          What to <span>Wear</span>
        </a>

        {/* LayoutGroup scopes the shared-layout pills to this component. */}
        <LayoutGroup id="topbar">
          <nav className="nav" aria-label="Main">
            {tabs.map((tab) => {
              const active = route === tab.id;
              return (
                <a
                  key={tab.id}
                  href={`#/${tab.id}`}
                  className={active ? "nav-link is-active" : "nav-link"}
                  aria-current={active ? "page" : undefined}
                >
                  {active && <motion.span layoutId="nav-pill" className="nav-pill" transition={{ type: "spring", stiffness: 460, damping: 38 }} />}
                  <span className="nav-label">{tab.label}</span>
                  {tab.count !== undefined && tab.count > 0 && (
                    // `key` changes → React re-mounts → the pop animation replays.
                    <motion.span
                      key={tab.count}
                      className="nav-count"
                      initial={{ scale: 0.4 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 14 }}
                    >
                      {tab.count}
                    </motion.span>
                  )}
                  {tab.dot && <span className="nav-dot" aria-label="Look in progress" />}
                </a>
              );
            })}
          </nav>

          <div className="topbar-actions">
            {section && (
              <div className="switch" role="group" aria-label="Menswear or womenswear">
                {SECTION_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={section === id ? "switch-opt is-active" : "switch-opt"}
                    aria-pressed={section === id}
                    onClick={() => section !== id && app.chooseSection(id)}
                  >
                    {section === id && (
                      <motion.span layoutId="switch-pill" className="switch-pill" transition={{ type: "spring", stiffness: 460, damping: 38 }} />
                    )}
                    {/* Short label on phones (CSS swaps them) so the header never overflows. */}
                    <span className="switch-label-full">{SECTIONS[id].label}</span>
                    <span className="switch-label-short" aria-hidden="true">
                      {SECTIONS[id].short}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button type="button" className="muse-btn" onClick={onOpenMuse} aria-label="Open Muse, your taste model">
              <span aria-hidden="true">✦</span>
              <span className="muse-btn-label">Muse</span>
              {taste.state.picks > 0 && <span className="muse-btn-count">{taste.state.picks}</span>}
            </button>
          </div>
        </LayoutGroup>
      </div>
    </header>
  );
}
