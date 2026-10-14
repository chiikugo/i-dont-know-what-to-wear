/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  state/TasteContext.tsx — connects the taste model to React
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  THE MODEL ITSELF LIVES IN model/tasteModel.ts (pure maths). This file is the
 *  React "glue" that gives it a memory and a life-cycle:
 *
 *   ┌─ events (the log) ───────────────┐
 *   │ loaded from localStorage on start│
 *   │ appended to by `record()`        │──► replay() ──► TasteState (the model)
 *   │ saved back to localStorage       │                       │
 *   │ (optionally) pushed to Supabase  │                       ▼
 *   └──────────────────────────────────┘          scorePiece(piece) → number
 *                                                  (used by the outfit engine
 *   community prior (from Supabase) ──────────────► and the home page)
 *
 *  WHAT COMPONENTS GET FROM `useTaste()`
 *    scorePiece   "how much would this person like this piece?"
 *    record(...)  tell the model about something the user did
 *    state        the learned weights (for the Muse insights panel)
 *    crowd        the community prior (or null)
 *    dismissed    ids the user said "not for me" to
 *    …plus settings & reset.
 *
 *  PRIVACY NOTE
 *  Only anonymous feature strings are ever sent to Supabase, and only when
 *  `shareEnabled` is on. See lib/eventStore.ts for exactly what is sent.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Piece, Section } from "../data/types";
import {
  deleteMyEvents,
  EVENT_CAP,
  loadEvents,
  pullCrowd,
  pullMyEvents,
  pushEvents,
  saveEvents,
} from "../lib/eventStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "../lib/storage";
import {
  connectBackend,
  reportBackendError,
  reportBackendOk,
  supabaseConfigured,
} from "../lib/supabase";
import { featuresOf } from "../model/features";
import type { CrowdPrior, EventType, TasteEvent, TasteState } from "../model/tasteModel";
import { makeEvent, replay, taste } from "../model/tasteModel";
import { useSection } from "./SectionContext";

/** Where the community data currently stands (shown in the Muse panel). */
export type CrowdStatus = "off" | "loading" | "ready" | "empty" | "error";

interface Settings {
  /** Send anonymous feature-level picks to Supabase so the community prior exists. */
  shareEnabled: boolean;
}

export interface TasteApi {
  /** The learned model (weights etc.). */
  state: TasteState;
  /** The raw event log, oldest first. */
  events: TasteEvent[];
  crowd: CrowdPrior | null;
  crowdStatus: CrowdStatus;
  /** Piece ids dismissed from the home page. */
  dismissed: ReadonlySet<string>;
  shareEnabled: boolean;
  setShareEnabled: (on: boolean) => void;
  /** Higher = this user will like it more. Stable while the model is unchanged. */
  scorePiece: (piece: Piece) => number;
  /** Report something the user did. */
  record: (type: EventType, section: Section, features: string[]) => void;
  /** Same, but computes the features from a piece. */
  recordPiece: (type: EventType, section: Section, piece: Piece) => void;
  /** Report one action that involves several pieces (e.g. saving a whole look). */
  recordPieces: (type: EventType, section: Section, pieces: Piece[]) => void;
  /** "Not for me" on a recommendation. */
  dismissPiece: (piece: Piece, section: Section) => void;
  /** Forget everything the model has learned (local, and Supabase if connected). */
  resetTaste: () => Promise<void>;
}

const TasteContext = createContext<TasteApi | null>(null);

/** How long to wait for more events before sending a batch to Supabase. */
const FLUSH_DELAY_MS = 4000;
/** Send immediately once this many events are waiting. */
const FLUSH_BATCH = 12;

export function TasteProvider({ children }: { children: ReactNode }) {
  const { section } = useSection();

  // ── State ──────────────────────────────────────────────────────────────
  const [events, setEvents] = useState<TasteEvent[]>(() => loadEvents());
  const [dismissedIds, setDismissedIds] = useState<string[]>(() =>
    loadJSON<string[]>(STORAGE_KEYS.dismissed, []),
  );
  const [settings, setSettings] = useState<Settings>(() => ({
    shareEnabled: true,
    ...loadJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}),
  }));
  const [crowd, setCrowd] = useState<CrowdPrior | null>(null);
  const [crowdStatus, setCrowdStatus] = useState<CrowdStatus>(supabaseConfigured ? "loading" : "off");

  // Refs hold values that async callbacks need the *latest* of, without
  // re-creating those callbacks on every render.
  const pending = useRef<TasteEvent[]>([]);
  const flushTimer = useRef<number | undefined>(undefined);
  const shareRef = useRef(settings.shareEnabled);
  shareRef.current = settings.shareEnabled;

  // ── The model is just a function of the event log ───────────────────────
  const state = useMemo(() => replay(events), [events]);

  const dismissed = useMemo(() => new Set(dismissedIds), [dismissedIds]);

  // ── Persist to localStorage whenever things change ──────────────────────
  useEffect(() => {
    saveEvents(events);
  }, [events]);
  useEffect(() => {
    saveJSON(STORAGE_KEYS.dismissed, dismissedIds);
  }, [dismissedIds]);
  useEffect(() => {
    saveJSON(STORAGE_KEYS.settings, settings);
  }, [settings]);

  // ── Sending events to Supabase (batched) ────────────────────────────────
  const flush = useCallback(async () => {
    window.clearTimeout(flushTimer.current);
    flushTimer.current = undefined;
    if (!supabaseConfigured || !shareRef.current || pending.current.length === 0) return;

    const client = await connectBackend();
    if (!client) return;

    const batch = pending.current.splice(0, pending.current.length);
    try {
      await pushEvents(client, batch);
      reportBackendOk();
    } catch (error) {
      // Keep them for the next attempt (bounded so we never grow forever).
      pending.current = [...batch, ...pending.current].slice(-EVENT_CAP);
      reportBackendError(error);
    }
  }, []);

  // Flush when the tab is hidden/closed so we don't lose the last few taps.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [flush]);

  // ── Community prior: (re)fetch when the section changes ─────────────────
  useEffect(() => {
    if (!supabaseConfigured || !section) return;
    let cancelled = false;
    setCrowdStatus("loading");

    connectBackend().then(async (client) => {
      if (cancelled) return;
      if (!client) return setCrowdStatus("error");
      try {
        const prior = await pullCrowd(client, section);
        if (cancelled) return;
        setCrowd(prior);
        setCrowdStatus(prior ? "ready" : "empty");
      } catch {
        if (!cancelled) setCrowdStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [section]);

  // ── Restore history on a fresh browser (only if the local log is empty) ──
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;
    connectBackend().then(async (client) => {
      if (!client || cancelled) return;
      try {
        const mine = await pullMyEvents(client);
        if (!cancelled && mine.length > 0) setEvents((prev) => (prev.length === 0 ? mine : prev));
      } catch {
        /* non-fatal: the model just starts fresh */
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Public API ──────────────────────────────────────────────────────────
  /** Append ready-made events to the log (and queue them for Supabase). */
  const append = useCallback(
    (batch: TasteEvent[]) => {
      if (batch.length === 0) return;
      setEvents((prev) => {
        const next = [...prev, ...batch];
        return next.length > EVENT_CAP ? next.slice(next.length - EVENT_CAP) : next;
      });

      if (supabaseConfigured && shareRef.current) {
        pending.current.push(...batch);
        if (pending.current.length >= FLUSH_BATCH) {
          void flush();
        } else if (flushTimer.current === undefined) {
          flushTimer.current = window.setTimeout(() => void flush(), FLUSH_DELAY_MS);
        }
      }
    },
    [flush],
  );

  const record = useCallback(
    (type: EventType, sec: Section, features: string[]) => {
      if (features.length > 0) append([makeEvent(type, sec, features)]);
    },
    [append],
  );

  const recordPiece = useCallback(
    (type: EventType, sec: Section, piece: Piece) => record(type, sec, featuresOf(piece)),
    [record],
  );

  const recordPieces = useCallback(
    (type: EventType, sec: Section, pieces: Piece[]) => {
      // One shared timestamp = the model counts this as a single action.
      const now = Date.now();
      append(pieces.map((p) => makeEvent(type, sec, featuresOf(p), now)));
    },
    [append],
  );

  const dismissPiece = useCallback(
    (piece: Piece, sec: Section) => {
      setDismissedIds((ids) => (ids.includes(piece.id) ? ids : [...ids, piece.id]));
      record("home-dismiss", sec, featuresOf(piece));
    },
    [record],
  );

  const setShareEnabled = useCallback((on: boolean) => {
    setSettings((s) => ({ ...s, shareEnabled: on }));
    if (!on) pending.current = []; // forget anything not yet sent
  }, []);

  const resetTaste = useCallback(async () => {
    pending.current = [];
    setEvents([]);
    setDismissedIds([]);
    if (supabaseConfigured) {
      const client = await connectBackend();
      if (client) {
        try {
          await deleteMyEvents(client);
        } catch (error) {
          reportBackendError(error);
        }
      }
    }
  }, []);

  const scorePiece = useCallback((piece: Piece) => taste(state, featuresOf(piece), crowd), [state, crowd]);

  const api = useMemo<TasteApi>(
    () => ({
      state,
      events,
      crowd,
      crowdStatus,
      dismissed,
      shareEnabled: settings.shareEnabled,
      setShareEnabled,
      scorePiece,
      record,
      recordPiece,
      recordPieces,
      dismissPiece,
      resetTaste,
    }),
    [
      state,
      events,
      crowd,
      crowdStatus,
      dismissed,
      settings.shareEnabled,
      setShareEnabled,
      scorePiece,
      record,
      recordPiece,
      recordPieces,
      dismissPiece,
      resetTaste,
    ],
  );

  return <TasteContext.Provider value={api}>{children}</TasteContext.Provider>;
}

/** Access the taste model. Must be used under <TasteProvider>. */
export function useTaste(): TasteApi {
  const ctx = useContext(TasteContext);
  if (!ctx) throw new Error("useTaste must be used inside <TasteProvider>");
  return ctx;
}
