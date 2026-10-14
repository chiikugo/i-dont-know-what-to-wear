/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  state/ClosetContext.tsx — your saved outfits ("Closet" tab)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  THE POLICY: "LOCAL FIRST, THEN SYNC"
 *    1. Every change is applied to the screen and to localStorage immediately,
 *       so the app feels instant and never loses work — even offline.
 *    2. If Supabase is configured, the same change is sent there in the
 *       background. The outfit's `synced` flag says whether that has happened.
 *    3. On start-up we download the remote closet and MERGE:
 *           remote outfits  +  local outfits that never reached the server.
 *       (Outfits you created before connecting Supabase get uploaded then.)
 *
 *  WHAT A SAVED OUTFIT CONTAINS
 *  A *snapshot* of each piece (title, photo id, tags…), not just ids — so the
 *  closet keeps looking right even if you later edit catalog.ts.
 *
 *  WHAT COMPONENTS GET FROM `useCloset()`
 *    outfits   the list, newest first
 *    status    "Saved on this device" / "Synced with Supabase" / error text
 *    save      store the current look
 *    rename    change an outfit's name
 *    remove    delete (with an Undo toast)
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
import type { LookSlots, Outfit, Piece, PieceSnapshot, Section, Slot } from "../data/types";
import { COLORS } from "../data/types";
import { describeLook } from "../engine/copy";
import {
  byNewest,
  deleteRemoteOutfit,
  loadLocalCloset,
  pullRemoteCloset,
  pushRemoteOutfit,
  saveLocalCloset,
} from "../lib/closetStore";
import {
  connectBackend,
  reportBackendError,
  reportBackendOk,
  supabaseConfigured,
  useBackendStatus,
  type BackendStatus,
} from "../lib/supabase";
import { useToast } from "./ToastContext";

// ── Snapshots ───────────────────────────────────────────────────────────────

/** Copy of a catalog piece, stored inside saved outfits. */
export function snapshotOf(piece: Piece): PieceSnapshot {
  return {
    id: piece.id,
    title: piece.title,
    category: piece.category,
    fit: piece.fit,
    color: piece.color,
    tone: COLORS[piece.color].tone,
    vibes: piece.vibes,
    formality: piece.formality,
    type: piece.type,
    length: piece.length,
    image: piece.image,
    // Where the garment sits in its runway photo, and which look/show it came
    // from — so a saved outfit can still show the garment (and its designer)
    // even if the catalog changes later.
    crop: piece.crop,
    look: piece.look,
    show: piece.show,
    credit: piece.credit,
  };
}

/** Snapshot a whole look. */
export function snapshotLook(pieces: Partial<Record<Slot, Piece>>): LookSlots {
  const out: LookSlots = {};
  for (const [slot, piece] of Object.entries(pieces) as [Slot, Piece | undefined][]) {
    if (piece) out[slot] = snapshotOf(piece);
  }
  return out;
}

/** Searchable tags stored alongside the outfit in the database. */
function tagsFor(slots: LookSlots): string[] {
  const facts = describeLook(slots);
  return [facts.vibe, ...facts.palette.map((c) => c.name), facts.silhouette.toLowerCase()];
}

// ── Context ─────────────────────────────────────────────────────────────────

interface ClosetApi {
  outfits: Outfit[];
  status: BackendStatus;
  /** Save a look. Returns the stored outfit. */
  save: (input: { section: Section; slots: LookSlots; name: string }) => Outfit;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
}

const ClosetContext = createContext<ClosetApi | null>(null);

export function ClosetProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const status = useBackendStatus();
  const [outfits, setOutfits] = useState<Outfit[]>(() => loadLocalCloset());
  // Always-current copy for async callbacks.
  const outfitsRef = useRef(outfits);
  outfitsRef.current = outfits;

  // Persist locally on every change.
  useEffect(() => {
    saveLocalCloset(outfits);
  }, [outfits]);

  /** Mark one outfit as synced in state. */
  const markSynced = useCallback((id: string) => {
    setOutfits((list) => list.map((o) => (o.id === id ? { ...o, synced: true } : o)));
  }, []);

  /** Send one outfit to Supabase (best effort). */
  const pushOne = useCallback(
    async (outfit: Outfit) => {
      if (!supabaseConfigured) return;
      const client = await connectBackend();
      if (!client) return;
      try {
        await pushRemoteOutfit(client, outfit, tagsFor(outfit.slots));
        markSynced(outfit.id);
        reportBackendOk();
      } catch (error) {
        reportBackendError(error);
      }
    },
    [markSynced],
  );

  // ── Start-up merge with the remote closet ───────────────────────────────
  useEffect(() => {
    if (!supabaseConfigured) return;
    let cancelled = false;

    connectBackend().then(async (client) => {
      if (!client || cancelled) return;
      try {
        const remote = await pullRemoteCloset(client);
        if (cancelled) return;

        const remoteIds = new Set(remote.map((o) => o.id));
        // Anything not confirmed on the server yet must be uploaded.
        const pending = outfitsRef.current.filter((o) => o.synced !== true && !remoteIds.has(o.id));
        const merged = [...remote, ...pending].sort(byNewest);
        setOutfits(merged);
        reportBackendOk();
        for (const outfit of pending) void pushOne(outfit);
      } catch (error) {
        reportBackendError(error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pushOne]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const save = useCallback<ClosetApi["save"]>(
    ({ section, slots, name }) => {
      const now = new Date().toISOString();
      const outfit: Outfit = {
        id: crypto.randomUUID(),
        name,
        section,
        slots,
        createdAt: now,
        updatedAt: now,
        synced: supabaseConfigured ? false : undefined,
      };
      setOutfits((list) => [outfit, ...list]);
      void pushOne(outfit);
      return outfit;
    },
    [pushOne],
  );

  const rename = useCallback<ClosetApi["rename"]>(
    (id, name) => {
      const trimmed = name.trim();
      const current = outfitsRef.current.find((o) => o.id === id);
      if (!trimmed || !current || trimmed === current.name) return;

      const updated: Outfit = {
        ...current,
        name: trimmed,
        updatedAt: new Date().toISOString(),
        synced: supabaseConfigured ? false : undefined,
      };
      setOutfits((list) => list.map((o) => (o.id === id ? updated : o)));
      void pushOne(updated);
    },
    [pushOne],
  );

  const remove = useCallback<ClosetApi["remove"]>(
    (id) => {
      const target = outfitsRef.current.find((o) => o.id === id);
      if (!target) return;
      setOutfits((list) => list.filter((o) => o.id !== id));

      // Remote delete (best effort).
      if (supabaseConfigured) {
        void connectBackend().then(async (client) => {
          if (!client) return;
          try {
            await deleteRemoteOutfit(client, id);
          } catch (error) {
            reportBackendError(error);
          }
        });
      }

      toast.push({
        message: `Removed “${target.name}”`,
        actionLabel: "Undo",
        onAction: () => {
          setOutfits((list) => (list.some((o) => o.id === id) ? list : [target, ...list].sort(byNewest)));
          void pushOne({ ...target, synced: false });
        },
      });
    },
    [pushOne, toast],
  );

  const api = useMemo<ClosetApi>(
    () => ({ outfits, status, save, rename, remove }),
    [outfits, status, save, rename, remove],
  );

  return <ClosetContext.Provider value={api}>{children}</ClosetContext.Provider>;
}

export function useCloset(): ClosetApi {
  const ctx = useContext(ClosetContext);
  if (!ctx) throw new Error("useCloset must be used inside <ClosetProvider>");
  return ctx;
}
