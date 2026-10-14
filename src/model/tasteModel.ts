/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  model/tasteModel.ts — the "Muse": a small model that learns your taste
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  WHAT KIND OF "MODEL" IS THIS?
 *  Honest answer: a tiny, transparent, on-device learner — not a giant AI.
 *  It is an *online logistic regression*, the same maths behind spam filters.
 *  That choice is deliberate: it learns from just a handful of taps, runs
 *  instantly in the browser, and — crucially — you can read exactly why it
 *  recommends something. (A "black box" would be impossible to document.)
 *
 *  THE IDEA IN FIVE LINES
 *    1. Every piece is a bag of FEATURES   ("fit:baggy", "vibe:street"…).
 *    2. The model keeps one WEIGHT per feature (positive = you like it).
 *    3. A piece's SCORE = the sum of its features' weights.
 *    4. Each time you do something (pick an option, keep a piece, save a look,
 *       dismiss a card…) we nudge the weights so that thing scores higher
 *       (or lower, for dislikes). That nudge is called a "gradient step".
 *    5. Recommendations are just "pieces sorted by score".
 *
 *  WHAT "LEARNING FROM PEOPLE'S CHOICES" MEANS HERE
 *  Two sources feed the score:
 *    • YOUR weights (learned from your own taps — always on, stored on-device)
 *    • COMMUNITY weights (a "prior" built from everyone's anonymised taps,
 *      fetched from Supabase when it is connected — see model/crowd.ts)
 *  Early on, the community prior carries more of the score (you haven't taught
 *  the model anything yet). As you make more choices, YOUR weights take over.
 *
 *  THE KNOBS  (all in HYPER below — change a number, see how it feels)
 *    lr       how big each nudge is. Higher = learns faster, but jumpier.
 *    l2       gentle pull back toward "no opinion" so old, one-off taps fade.
 *    explore  how much to favour things the model knows little about.
 *
 *  PURE FUNCTIONS
 *  Nothing in this file touches the browser. State goes in, new state comes
 *  out. That is why it is easy to test (tasteModel.test.ts) and why replaying
 *  your event log always rebuilds the exact same model.
 */

import type { Section } from "../data/types";

// ── Hyper-parameters ────────────────────────────────────────────────────────

/** TWEAK ME. Explained in the file header. */
export const HYPER = {
  /** Learning rate: size of each weight nudge. */
  lr: 1.1,
  /** Weight decay: fraction pulled back toward 0 on each touch. */
  l2: 0.03,
  /** How strongly "I haven't seen much of this" boosts a recommendation. */
  explore: 0.5,
  /** Community prior strength with zero personal events (fades as you add events). */
  crowd: 0.9,
  /** Same for the built-in editorial prior (a gentle, curated starting taste). */
  editorial: 0.5,
  /** Events after which the priors have lost half their influence. */
  priorHalfLife: 14,
};

// ── Events ──────────────────────────────────────────────────────────────────

/**
 * Everything the app reports to the model. The default label and weight of each
 * are in EVENT_DEFAULTS.
 */
export type EventType =
  | "option" //          picked an answer (fit/tone/…) in the question flow
  | "option-skip" //     an option that was shown but NOT picked
  | "piece-keep" //      finished refining a piece / accepted a suggestion
  | "piece-swap" //      replaced a suggested piece with another
  | "look-runway" //     sent a look down the runway
  | "look-save" //       saved a look to the closet
  | "home-open" //       started a look from a home recommendation
  | "home-dismiss" //    "not for me" on a home recommendation
  | "vibe-chip"; //      tapped a mood chip on the home page

/** One thing the user did, in a form the model can learn from. */
export interface TasteEvent {
  /** Milliseconds since 1970. */
  t: number;
  type: EventType;
  section: Section;
  /** The feature strings this event is about (see features.ts). */
  features: string[];
  /** 1 = "liked / wanted this", 0 = "didn't". */
  label: 0 | 1;
  /** How strongly this event should count. */
  weight: number;
}

/**
 * How each kind of action counts. Bigger weight = stronger signal.
 * A save is much louder than a passing click; an explicit dismiss is louder
 * than an option that was merely shown and not chosen.
 */
export const EVENT_DEFAULTS: Record<EventType, { label: 0 | 1; weight: number }> = {
  option: { label: 1, weight: 1.0 },
  "option-skip": { label: 0, weight: 0.25 },
  "piece-keep": { label: 1, weight: 1.0 },
  "piece-swap": { label: 0, weight: 0.8 },
  "look-runway": { label: 1, weight: 0.8 },
  "look-save": { label: 1, weight: 1.5 },
  "home-open": { label: 1, weight: 0.6 },
  "home-dismiss": { label: 0, weight: 1.5 },
  "vibe-chip": { label: 1, weight: 1.2 },
};

/** Build a ready-to-record event. */
export function makeEvent(
  type: EventType,
  section: Section,
  features: string[],
  now: number = Date.now(),
): TasteEvent {
  const { label, weight } = EVENT_DEFAULTS[type];
  return { t: now, type, section, features, label, weight };
}

// ── Model state ─────────────────────────────────────────────────────────────

/** Everything the model "knows". Plain JSON — easy to persist and inspect. */
export interface TasteState {
  /** Learned weight per feature. Positive = liked, negative = disliked. */
  w: Record<string, number>;
  /** How many times each feature has been touched (drives "uncertainty"). */
  n: Record<string, number>;
  /** How many events have been folded in (including quiet "shown, not picked" ones). */
  events: number;
  /**
   * How many *deliberate* actions have been folded in — everything except the
   * quiet `option-skip` signal. This is the number the UI shows ("12 choices")
   * and the one used to decide when there's "enough" to say something.
   */
  picks: number;
  /**
   * Remembers the last counted action so a multi-piece action (saving a look
   * emits one event per piece, all stamped with the same time) counts once.
   */
  lastPick: { t: number; type: EventType } | null;
}

/** A model that has learned nothing. */
export function emptyState(): TasteState {
  return { w: {}, n: {}, events: 0, picks: 0, lastPick: null };
}

/** A pre-computed community preference: feature → weight. */
export interface CrowdPrior {
  w: Record<string, number>;
  /** How many distinct people contributed (shown in the UI). */
  users: number;
}

// ── Maths ───────────────────────────────────────────────────────────────────

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * The model's raw opinion: Σ weights ÷ √(number of features).
 * Dividing by √n stops pieces with many features from automatically scoring
 * higher than pieces with few — it keeps the scale comparable.
 */
export function logit(state: TasteState, features: string[]): number {
  if (features.length === 0) return 0;
  let sum = 0;
  for (const f of features) sum += state.w[f] ?? 0;
  return sum / Math.sqrt(features.length);
}

/** Probability (0–1) that the user would like something with these features. */
export function likelihood(state: TasteState, features: string[]): number {
  return sigmoid(logit(state, features));
}

/**
 * Learn from ONE event. Returns a NEW state (the old one is untouched).
 *
 * The update is the standard logistic-regression gradient step:
 *     error  = label − predictedProbability
 *     w[f] += lr × eventWeight × error × (1/√n)  − lr × l2 × w[f]
 * Read it as: "if we under-predicted something the user wanted, push those
 * features up; if we over-predicted something they rejected, push them down;
 * if we were already right, barely move".
 */
export function learn(state: TasteState, event: TasteEvent): TasteState {
  const features = event.features;
  if (features.length === 0) return state;

  const p = likelihood(state, features);
  const error = event.label - p;
  const norm = 1 / Math.sqrt(features.length);

  const w = { ...state.w };
  const n = { ...state.n };
  for (const f of features) {
    const old = w[f] ?? 0;
    w[f] = old + HYPER.lr * event.weight * error * norm - HYPER.lr * HYPER.l2 * old;
    n[f] = (n[f] ?? 0) + 1;
  }
  // A "pick" is a deliberate action. Quiet skips don't count, and neither do
  // extra events that belong to the SAME action (same type, same timestamp).
  const quiet = event.type === "option-skip";
  const sameAction = state.lastPick?.t === event.t && state.lastPick.type === event.type;
  const counts = !quiet && !sameAction;

  return {
    w,
    n,
    events: state.events + 1,
    picks: state.picks + (counts ? 1 : 0),
    lastPick: quiet ? state.lastPick : { t: event.t, type: event.type },
  };
}

/** Rebuild a model from an event log (oldest → newest). */
export function replay(events: TasteEvent[]): TasteState {
  return events.reduce(learn, emptyState());
}

// ── Priors (the cold start) ─────────────────────────────────────────────────

/**
 * A gentle, curated starting taste so the home page looks intentional before
 * you've done anything. It is NOT shown as "your" taste — explanations label
 * it as an editor's pick. TWEAK these to change the default feel.
 */
export const EDITORIAL_PRIOR: Record<string, number> = {
  "vibe:minimal": 0.5,
  "vibe:classic": 0.4,
  "vibe:relaxed": 0.25,
  "tone:earth": 0.25,
  "tone:light": 0.2,
  "tone:dark": 0.15,
  "dress:smart": 0.15,
  "fit:regular": 0.1,
  // Garments make better starting points than a belt or a watch.
  "cat:accessories": -0.6,
  "cat:shoes": -0.2,
};

/** How much of a prior is still in play, given how much you've taught the model. */
export function priorStrength(state: TasteState, base: number): number {
  return base * (HYPER.priorHalfLife / (HYPER.priorHalfLife + state.events));
}

// ── Scoring ─────────────────────────────────────────────────────────────────

/** A weighted sum of a prior's feature weights, scaled like `logit`. */
function priorLogit(prior: Record<string, number>, features: string[]): number {
  if (features.length === 0) return 0;
  let sum = 0;
  for (const f of features) sum += prior[f] ?? 0;
  return sum / Math.sqrt(features.length);
}

/**
 * "How much will this person like it?" — the number the app sorts by.
 *   personal opinion + faded community prior + faded editorial prior
 */
export function taste(state: TasteState, features: string[], crowd: CrowdPrior | null = null): number {
  let score = logit(state, features);
  score += priorStrength(state, HYPER.editorial) * priorLogit(EDITORIAL_PRIOR, features);
  if (crowd) score += priorStrength(state, HYPER.crowd) * priorLogit(crowd.w, features);
  return score;
}

/**
 * How *uncertain* the model is about these features (0 = very sure,
 * 1 = never seen). Mean of 1/√(1 + touches). Used to surface new things.
 */
export function uncertainty(state: TasteState, features: string[]): number {
  if (features.length === 0) return 1;
  let sum = 0;
  for (const f of features) sum += 1 / Math.sqrt(1 + (state.n[f] ?? 0));
  return sum / features.length;
}

/**
 * Score for *ranking*: taste plus a bonus for unfamiliar things.
 * The bonus is what keeps recommendations from collapsing into the same five
 * pieces forever — a classic "explore vs. exploit" trade-off.
 *
 * @param exploration 0 = pure taste, 1 = full exploration bonus (default 0.3)
 */
export function rankScore(
  state: TasteState,
  features: string[],
  crowd: CrowdPrior | null = null,
  exploration = 0.3,
): number {
  return taste(state, features, crowd) + HYPER.explore * exploration * uncertainty(state, features);
}

// ── Explanations ────────────────────────────────────────────────────────────

/** One reason a piece scored the way it did. */
export interface Contribution {
  feature: string;
  /** Signed contribution to the score. */
  amount: number;
  source: "you" | "community" | "editor";
}

/**
 * Break a score down by feature, biggest contributors first. This is what
 * powers "Because you like baggy fits" on a card.
 */
export function explain(
  state: TasteState,
  features: string[],
  crowd: CrowdPrior | null = null,
): Contribution[] {
  const norm = features.length ? 1 / Math.sqrt(features.length) : 1;
  const ed = priorStrength(state, HYPER.editorial);
  const cr = crowd ? priorStrength(state, HYPER.crowd) : 0;

  const out: Contribution[] = [];
  for (const feature of features) {
    const mine = (state.w[feature] ?? 0) * norm;
    const editor = ed * (EDITORIAL_PRIOR[feature] ?? 0) * norm;
    const community = cr * (crowd?.w[feature] ?? 0) * norm;
    const total = mine + editor + community;
    if (total === 0) continue;
    const source: Contribution["source"] =
      Math.abs(mine) >= Math.abs(community) && Math.abs(mine) >= Math.abs(editor)
        ? "you"
        : Math.abs(community) >= Math.abs(editor)
          ? "community"
          : "editor";
    out.push({ feature, amount: total, source });
  }
  return out.sort((a, b) => b.amount - a.amount);
}

/**
 * The features the model currently likes / dislikes most — for the
 * "What I've learned about you" panel.
 */
export function topFeatures(
  state: TasteState,
  count = 6,
): { likes: [string, number][]; dislikes: [string, number][] } {
  const entries = Object.entries(state.w).filter(([, v]) => Math.abs(v) > 0.02);
  const likes = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, count);
  const dislikes = entries.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, count);
  return { likes, dislikes };
}
