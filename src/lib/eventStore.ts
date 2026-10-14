/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  lib/eventStore.ts — the taste-event log (local + optional Supabase)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT AN "EVENT" IS
 *  Each time you do something the model can learn from — pick an option, keep
 *  a piece, dismiss a card — we append a tiny record to a log:
 *
 *      { t: 1760000000000, type: "option", section: "menswear",
 *        features: ["fit:baggy", "fitcat:baggy:pants"], label: 1, weight: 1 }
 *
 *  The MODEL is just a function of that log (see model/tasteModel.ts). So the
 *  log is the real source of truth: lose the model, replay the log, get it
 *  back identically.
 *
 *  WHAT IS (AND ISN'T) SENT TO SUPABASE
 *  Only the lines above: feature strings, a yes/no label, a weight and the
 *  section. No photos, no outfit contents, no names, no emails. Sharing can be
 *  switched off in the Muse panel; the local log keeps working either way.
 *
 *  WHAT THE COMMUNITY NUMBERS ARE
 *  `pullCrowd` calls the database function `trending_features` (schema.sql),
 *  which adds up everyone's events per feature and — important for privacy —
 *  only returns features that at least N different people have produced.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Section } from "../data/types";
import type { CrowdRow } from "../model/crowd";
import { buildCrowdPrior } from "../model/crowd";
import type { CrowdPrior, EventType, TasteEvent } from "../model/tasteModel";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./storage";

/** Keep at most this many events locally (oldest are dropped first). */
export const EVENT_CAP = 500;

const TABLE = "choice_events";

// ── Local ───────────────────────────────────────────────────────────────────

/** Is this value a usable event? (guards against corrupt storage) */
function isEvent(value: unknown): value is TasteEvent {
  const e = value as Partial<TasteEvent> | null;
  return (
    !!e &&
    typeof e.t === "number" &&
    typeof e.type === "string" &&
    Array.isArray(e.features) &&
    (e.label === 0 || e.label === 1) &&
    typeof e.weight === "number"
  );
}

/** Load the local event log (oldest → newest). */
export function loadEvents(): TasteEvent[] {
  const raw = loadJSON<unknown[]>(STORAGE_KEYS.events, []);
  return (Array.isArray(raw) ? raw : []).filter(isEvent);
}

/** Save the log, trimmed to the most recent EVENT_CAP events. */
export function saveEvents(events: TasteEvent[]): TasteEvent[] {
  const trimmed = events.length > EVENT_CAP ? events.slice(events.length - EVENT_CAP) : events;
  saveJSON(STORAGE_KEYS.events, trimmed);
  return trimmed;
}

// ── Remote ──────────────────────────────────────────────────────────────────

/** Upload a batch of events. (Insert-only: the table never lets you edit.) */
export async function pushEvents(client: SupabaseClient, events: TasteEvent[]): Promise<void> {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    section: e.section,
    event_type: e.type,
    features: e.features,
    label: e.label,
    weight: e.weight,
    occurred_at: new Date(e.t).toISOString(),
  }));
  const { error } = await client.from(TABLE).insert(rows);
  if (error) throw error;
}

/** Download this user's own history (used to restore taste on a fresh browser). */
export async function pullMyEvents(client: SupabaseClient): Promise<TasteEvent[]> {
  const { data, error } = await client
    .from(TABLE)
    .select("section, event_type, features, label, weight, occurred_at")
    .order("occurred_at", { ascending: false })
    .limit(EVENT_CAP);
  if (error) throw error;
  type Row = {
    section: Section;
    event_type: EventType;
    features: string[];
    label: 0 | 1;
    weight: number;
    occurred_at: string;
  };
  return ((data ?? []) as Row[])
    .map((r) => ({
      t: Date.parse(r.occurred_at),
      type: r.event_type,
      section: r.section,
      features: r.features,
      label: r.label,
      weight: r.weight,
    }))
    .reverse(); // oldest → newest
}

/** Delete this user's own events (the "reset my taste" button). */
export async function deleteMyEvents(client: SupabaseClient): Promise<void> {
  // RLS limits this to the signed-in user's rows; the filter satisfies
  // PostgREST's rule that a DELETE must have a WHERE clause.
  const { error } = await client.from(TABLE).delete().gte("occurred_at", "1970-01-01");
  if (error) throw error;
}

/**
 * Fetch the community's aggregated preferences for a section.
 * Returns `null` when there is no (or too little) community data yet.
 */
export async function pullCrowd(client: SupabaseClient, section: Section): Promise<CrowdPrior | null> {
  const { data, error } = await client.rpc("trending_features", {
    p_section: section,
    p_days: 45,
    p_min_users: 3,
  });
  if (error) throw error;
  const rows = ((data ?? []) as { feature: string; pos: number; neg: number; users: number }[]).map(
    (r): CrowdRow => ({ feature: r.feature, pos: Number(r.pos), neg: Number(r.neg), users: Number(r.users) }),
  );
  return buildCrowdPrior(rows);
}
