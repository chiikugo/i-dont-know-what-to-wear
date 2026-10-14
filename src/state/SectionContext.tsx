/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  state/SectionContext.tsx — "am I shopping menswear or womenswear?"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  The very first choice on the home page. It's its own tiny context because
 *  several other parts (the taste model's community fetch, the builder, the
 *  top bar) all need to know it, and it must survive a page refresh.
 *
 *  `section === null` means "the user hasn't chosen yet" → the app shows the
 *  Menswear / Womenswear gate.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Section } from "../data/types";
import { loadJSON, saveJSON, STORAGE_KEYS } from "../lib/storage";

interface SectionApi {
  /** The chosen section, or null before the first choice. */
  section: Section | null;
  /** Choose (or switch) section. Pass null to go back to the gate. */
  setSection: (section: Section | null) => void;
}

const SectionContext = createContext<SectionApi | null>(null);

export function SectionProvider({ children }: { children: ReactNode }) {
  const [section, setSectionState] = useState<Section | null>(() => {
    const saved = loadJSON<string | null>(STORAGE_KEYS.section, null);
    return saved === "menswear" || saved === "womenswear" ? saved : null;
  });

  const setSection = useCallback((next: Section | null) => {
    setSectionState(next);
    saveJSON(STORAGE_KEYS.section, next);
  }, []);

  const api = useMemo(() => ({ section, setSection }), [section, setSection]);
  return <SectionContext.Provider value={api}>{children}</SectionContext.Provider>;
}

export function useSection(): SectionApi {
  const ctx = useContext(SectionContext);
  if (!ctx) throw new Error("useSection must be used inside <SectionProvider>");
  return ctx;
}
