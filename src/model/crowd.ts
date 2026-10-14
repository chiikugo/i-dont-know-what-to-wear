/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  model/crowd.ts — turning everyone's taps into a "community prior"
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT THIS IS
 *  When Supabase is connected, every person's anonymous choices (just feature
 *  strings like "fit:baggy" — never photos, names or emails) are stored. A
 *  database function (`trending_features`, see supabase/schema.sql) boils
 *  those down to one row per feature:
 *
 *        feature          pos   neg   users
 *        "fit:baggy"      412    96     38
 *        "vibe:minimal"   530   140     41
 *
 *  `pos` = how much it was wanted, `neg` = how much it was rejected.
 *  This file converts those counts into a single number per feature — the
 *  community's *opinion* — which tasteModel.ts then blends into scores.
 *
 *  THE MATHS (it's gentler than it looks)
 *    1. Smooth the counts (+2 on each side) so a feature seen twice doesn't
 *       look like a landslide.
 *    2. Take the log of pos/neg: 0 = neutral, + = liked, − = disliked.
 *    3. Subtract the overall average, because people tap "yes" much more often
 *       than "no" — we only care about what's better/worse than usual.
 *    4. Shrink by sample size so thin data is pulled toward 0.
 *
 *  This file is pure (no network) so it can be unit-tested; the actual fetch
 *  lives in lib/eventStore.ts.
 */

import type { CrowdPrior } from "./tasteModel";

/** One aggregated row from the database. */
export interface CrowdRow {
  feature: string;
  /** Weighted count of positive events. */
  pos: number;
  /** Weighted count of negative events. */
  neg: number;
  /** Number of distinct people behind the row. */
  users?: number;
}

/** TWEAK: how heavily thin data is pulled toward "no opinion". */
const SHRINK_AT = 10;
/** TWEAK: overall scale of the prior (kept modest so it nudges, not dictates). */
const SCALE = 0.6;
/** Smoothing added to both counts. */
const ALPHA = 2;

/** Build the prior used by the model. Empty input → `null` (no community yet). */
export function buildCrowdPrior(rows: CrowdRow[]): CrowdPrior | null {
  if (rows.length === 0) return null;

  const totalPos = rows.reduce((s, r) => s + r.pos, 0);
  const totalNeg = rows.reduce((s, r) => s + r.neg, 0);
  const baseline = Math.log((totalPos + ALPHA) / (totalNeg + ALPHA));

  const w: Record<string, number> = {};
  let users = 0;
  for (const row of rows) {
    const n = row.pos + row.neg;
    const logOdds = Math.log((row.pos + ALPHA) / (row.neg + ALPHA)) - baseline;
    const shrink = n / (n + SHRINK_AT);
    const value = Math.max(-1.5, Math.min(1.5, logOdds * shrink)) * SCALE;
    if (Math.abs(value) > 0.005) w[row.feature] = value;
    users = Math.max(users, row.users ?? 0);
  }
  return { w, users };
}
