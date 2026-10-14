/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  feed/useAutoScroll.ts — the home page's slow, endless drift downward
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  While you just look, the page glides down on its own — slowly, like a
 *  runway conveyor. The moment you take over, it gets out of the way:
 *
 *    • you scroll, swipe, press a key or move the mouse over the posts
 *          → it pauses, and picks up again a few seconds after you stop
 *    • the tab is hidden                    → it stops (browsers pause it)
 *    • your device asks for REDUCED MOTION  → it starts paused
 *    • the Pause button                     → off until you press Play
 *      (remembered on this device — moving content must always be pausable)
 *
 *  HOW IT MOVES
 *  Every animation frame it adds (speed × time since the last frame) to a
 *  floating-point position and scrolls the window there. Keeping our own
 *  fractional position (instead of reading the window's, which is rounded to
 *  whole pixels) is what makes a very slow drift smooth rather than steppy.
 *  If the window ends up somewhere we didn't put it, the user scrolled — we
 *  adopt their position and pause.
 *
 *  TWEAK
 *    DRIFT_PX_PER_SECOND   the speed
 *    RESUME_AFTER_MS       how long after you stop interacting it resumes
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/** How fast the page drifts, in CSS pixels per second. TWEAK (20–40 feels "slow"). */
export const DRIFT_PX_PER_SECOND = 26;
/** How long after your last scroll / swipe / key it starts drifting again. TWEAK */
export const RESUME_AFTER_MS = 4000;
/** After moving the mouse over the posts, how long it waits before drifting on. */
export const RESUME_AFTER_POINTER_MS = 2200;

const PREF_KEY = "wtw.feedDrift.v1";

/** Remembered Play/Pause choice (null = never chosen). Per device, never required. */
function loadPref(): boolean | null {
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v === "on" ? true : v === "off" ? false : null;
  } catch {
    return null;
  }
}

function savePref(on: boolean): void {
  try {
    window.localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* private mode etc. — fine, it just won't be remembered */
  }
}

export interface AutoScroll {
  /** True while the drift is switched on (it may still be briefly holding). */
  enabled: boolean;
  /** The Play/Pause button. */
  toggle: () => void;
  /** Pause for a while (e.g. after the pointer moved over the posts). */
  holdFor: (ms: number) => void;
}

/**
 * @param active  false = never drift (e.g. while the feed is still empty, or
 *                while you're on another page)
 */
export function useAutoScroll(active: boolean): AutoScroll {
  const reducedMotion =
    typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [enabled, setEnabled] = useState<boolean>(() => loadPref() ?? !reducedMotion);

  // The hold-until time lives in a ref: it changes constantly and must not re-render.
  const holdUntil = useRef(0);

  const holdFor = useCallback((ms: number) => {
    holdUntil.current = Math.max(holdUntil.current, performance.now() + ms);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((on) => {
      savePref(!on);
      // Pressing Play should start right away, even if you just scrolled.
      if (!on) holdUntil.current = 0;
      return !on;
    });
  }, []);

  // Any direct "I'm scrolling" input pauses the drift for a while.
  useEffect(() => {
    if (!active || !enabled) return;
    const pause = () => holdFor(RESUME_AFTER_MS);
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " ", "Spacebar"].includes(e.key)) pause();
    };
    window.addEventListener("wheel", pause, { passive: true });
    window.addEventListener("touchstart", pause, { passive: true });
    window.addEventListener("touchmove", pause, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("wheel", pause);
      window.removeEventListener("touchstart", pause);
      window.removeEventListener("touchmove", pause);
      window.removeEventListener("keydown", onKey);
    };
  }, [active, enabled, holdFor]);

  // The drift itself.
  useEffect(() => {
    if (!active || !enabled) return;
    let raf = 0;
    let last = performance.now();
    let pos = window.scrollY;
    let expected = window.scrollY;

    const frame = (now: number) => {
      const dt = Math.min(64, now - last); // a long gap (tab switch) never jumps
      last = now;
      const actual = window.scrollY;

      // Someone else moved the page (the user, or a "jump to" link): follow them and pause.
      if (Math.abs(actual - expected) > 3) {
        pos = actual;
        expected = actual;
        holdFor(RESUME_AFTER_MS);
      }

      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      const go = now >= holdUntil.current && document.visibilityState === "visible" && actual < maxY - 1;
      if (go) {
        pos = Math.min(maxY, pos + (DRIFT_PX_PER_SECOND * dt) / 1000);
        window.scrollTo(0, pos);
        expected = window.scrollY;
      } else {
        pos = actual;
        expected = actual;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, enabled, holdFor]);

  // One stable object, so components can list it as a dependency without churn.
  // (Deliberately no "is it moving right now?" state: that flips many times a
  // minute and would re-render the whole feed each time.)
  return useMemo(() => ({ enabled, toggle, holdFor }), [enabled, toggle, holdFor]);
}
