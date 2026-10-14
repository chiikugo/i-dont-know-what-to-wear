/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/closetStore.ts — reading & writing saved outfits
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  TWO PLACES OUTFITS CAN LIVE
 *    1. LOCAL  — this browser's localStorage. Always available, instant.
 *    2. REMOTE — the `closet_outfits` table in your Supabase project.
 *
 *  This file contains only the raw "load / save / delete" plumbing for each.
 *  The *policy* (write locally first, then sync; merge on start-up; show
 *  toasts) lives in state/ClosetContext.tsx, which calls these.
 *
 *  HOW AN OUTFIT BECOMES A DATABASE ROW
 *      Outfit.id        → id            (uuid, generated in the browser)
 *      Outfit.name      → name
 *      Outfit.section   → section
 *      Outfit.slots     → look          (jsonb: a snapshot of every piece)
 *      (computed)       → tags          (text[]: mood + colour names)
 *      Outfit.createdAt → created_at
 *      Outfit.updatedAt → updated_at
 *  The `user_id` column fills itself in on the server (it defaults to the
 *  signed-in user) — we never send it, which also means we can't spoof it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LookSlots, Outfit, Section } from "../data/types";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./storage";

const TABLE = "closet_outfits";

// ── Local ───────────────────────────────────────────────────────────────────

/** Is this value shaped enough like an Outfit to trust? (guards old/corrupt data) */
function looksLikeOutfit(value: unknown): value is Outfit {
  const o = value as Partial<Outfit> | null;
  return (
    !!o &&
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    (o.section === "menswear" || o.section === "womenswear") &&
    typeof o.slots === "object" &&
    o.slots !== null &&
    typeof o.createdAt === "string"
  );
}

/** Outfits saved in this browser, newest first. */
export function loadLocalCloset(): Outfit[] {
  const raw = loadJSON<unknown[]>(STORAGE_KEYS.closet, []);
  return (Array.isArray(raw) ? raw : []).filter(looksLikeOutfit).sort(byNewest);
}

/** Persist the whole local list. */
export function saveLocalCloset(outfits: Outfit[]): void {
  saveJSON(STORAGE_KEYS.closet, outfits);
}

/** Sort comparator: most recently created first. */
export function byNewest(a: Outfit, b: Outfit): number {
  return b.createdAt.localeCompare(a.createdAt);
}

// ── Remote (Supabase) ───────────────────────────────────────────────────────

/** The row shape in the database. */
interface ClosetRow {
  id: string;
  name: string;
  section: Section;
  look: LookSlots;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const fromRow = (row: ClosetRow): Outfit => ({
  id: row.id,
  name: row.name,
  section: row.section,
  slots: row.look,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  synced: true,
});

const toRow = (outfit: Outfit, tags: string[]): ClosetRow => ({
  id: outfit.id,
  name: outfit.name,
  section: outfit.section,
  look: outfit.slots,
  tags,
  created_at: outfit.createdAt,
  updated_at: outfit.updatedAt,
});

/** Download every outfit this (anonymous) user owns. RLS filters to "mine". */
export async function pullRemoteCloset(client: SupabaseClient): Promise<Outfit[]> {
  const { data, error } = await client.from(TABLE).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ClosetRow[]).map(fromRow).filter(looksLikeOutfit);
}

/** Insert or update one outfit (matched on its id). */
export async function pushRemoteOutfit(client: SupabaseClient, outfit: Outfit, tags: string[]): Promise<void> {
  const { error } = await client.from(TABLE).upsert(toRow(outfit, tags), { onConflict: "id" });
  if (error) throw error;
}

/** Delete one outfit. */
export async function deleteRemoteOutfit(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
