import { addDays } from './calendar';
import type { ID, StrengthStandard, StrengthTier, MovementPattern } from './types';

/** Best e1RM inside this many weeks counts as current strength for the score. */
export const SCORE_WINDOW_WEEKS = 12;

export const TIERS: readonly StrengthTier[] = ['beginner', 'novice', 'intermediate', 'advanced', 'elite'];

export type Thresholds = StrengthStandard['thresholds'];

export interface StandardTemplate {
  id: string;
  name: string;
  /** e1RM ÷ bodyweight needed to reach each tier. */
  thresholds: Thresholds;
}

const t = (...v: [number, number, number, number, number]): Thresholds => ({
  beginner: v[0], novice: v[1], intermediate: v[2], advanced: v[3], elite: v[4],
});

/**
 * Starting points only: rough bodyweight multiples for a trained adult male, chosen by the app, not taken
 * from a dataset and not percentiles. They are copied into the profile when a lift is added and are editable.
 */
export const STANDARD_TEMPLATES: readonly StandardTemplate[] = [
  { id: 'squat', name: 'Squat', thresholds: t(0.75, 1.25, 1.75, 2.25, 2.75) },
  { id: 'bench', name: 'Bench press', thresholds: t(0.5, 0.75, 1.25, 1.75, 2.0) },
  { id: 'deadlift', name: 'Deadlift', thresholds: t(1.0, 1.5, 2.0, 2.5, 3.0) },
  { id: 'press', name: 'Overhead press', thresholds: t(0.35, 0.55, 0.8, 1.1, 1.4) },
  { id: 'row', name: 'Row', thresholds: t(0.5, 0.75, 1.0, 1.35, 1.6) },
];

/** Template id to suggest for an exercise's movement pattern. */
export function templateForPattern(pattern: MovementPattern): StandardTemplate {
  const id =
    pattern === 'squat' || pattern === 'lunge' ? 'squat'
    : pattern === 'hinge' ? 'deadlift'
    : pattern === 'horizontalPush' ? 'bench'
    : pattern === 'verticalPush' ? 'press'
    : 'row';
  return STANDARD_TEMPLATES.find((x) => x.id === id) as StandardTemplate;
}

export interface TierResult {
  /** Highest tier whose threshold is met; undefined = below the beginner threshold. */
  tier?: StrengthTier;
  next?: { tier: StrengthTier; ratio: number };
}

/** Tier for a bodyweight ratio. Thresholds are minimums; they should rise with the tier. */
export function tierFor(ratio: number, th: Thresholds): TierResult {
  let tier: StrengthTier | undefined;
  for (const x of TIERS) if (ratio >= th[x]) tier = x;
  const idx = tier ? TIERS.indexOf(tier) + 1 : 0;
  const nextTier = TIERS[idx];
  return { tier, next: nextTier ? { tier: nextTier, ratio: th[nextTier] } : undefined };
}

/** Thresholds must be positive and not decrease from beginner to elite. */
export function validThresholds(th: Thresholds): boolean {
  return TIERS.every((x, i) => th[x] > 0 && (i === 0 || th[x] >= th[TIERS[i - 1] as StrengthTier]));
}

export interface ScoreLiftInput {
  exerciseId: ID;
  name: string;
  /** Relative importance, > 0. */
  weight: number;
  /** Best e1RM in the window, in the analysis unit; undefined = no recent data. */
  e1rm?: number;
  standard?: Thresholds;
}

export interface ScoreLiftResult extends ScoreLiftInput {
  /** e1RM ÷ bodyweight. */
  ratio?: number;
  tier?: StrengthTier;
  next?: { tier: StrengthTier; ratio: number };
  /** Extra e1RM (analysis unit) needed for the next tier at current bodyweight. */
  toNext?: number;
}

export interface ScoreResult {
  /** 100 × weighted mean of the ratios of lifts that have data; undefined when none do. */
  score?: number;
  lifts: ScoreLiftResult[];
  /** Weight share of the lifts that were scored, 0–1. */
  coverage: number;
}

export const SCORE_FORMULA = 'score = 100 × Σ(weight × e1RM ÷ bodyweight) ÷ Σ(weight), over lifts with an e1RM in the window';

/** Strength score: relative strength (e1RM ÷ bodyweight) averaged with the user's lift weights. */
export function strengthScore(lifts: readonly ScoreLiftInput[], bodyweight: number | undefined): ScoreResult {
  const results: ScoreLiftResult[] = lifts.map((l) => {
    if (!bodyweight || !(bodyweight > 0) || !l.e1rm || !(l.e1rm > 0)) return { ...l };
    const ratio = l.e1rm / bodyweight;
    const tr = l.standard ? tierFor(ratio, l.standard) : {};
    const toNext = 'next' in tr && tr.next ? Math.max(0, tr.next.ratio * bodyweight - l.e1rm) : undefined;
    return { ...l, ratio, ...tr, toNext };
  });
  const scored = results.filter((r) => r.ratio !== undefined && r.weight > 0);
  const totalW = lifts.reduce((s, l) => s + (l.weight > 0 ? l.weight : 0), 0);
  const w = scored.reduce((s, r) => s + r.weight, 0);
  const score = w > 0 ? (100 * scored.reduce((s, r) => s + r.weight * (r.ratio as number), 0)) / w : undefined;
  return { score, lifts: results, coverage: totalW > 0 ? w / totalW : 0 };
}

/** Best e1RM among series points in the last `SCORE_WINDOW_WEEKS` weeks up to `today` (local day key). */
export function recentBestE1rm(series: readonly { date: string; e1rm: number }[], today: string, weeks = SCORE_WINDOW_WEEKS): number | undefined {
  const from = addDays(today, -7 * weeks);
  let best: number | undefined;
  for (const p of series) {
    const day = p.date.slice(0, 10);
    if (day >= from && (best === undefined || p.e1rm > best)) best = p.e1rm;
  }
  return best;
}
