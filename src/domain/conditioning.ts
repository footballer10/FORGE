/** Conditioning maths for time/distance exercises (runs, sprints, intervals, carries). Pure; no storage or UI. */
import { localDateKey } from './calendar';
import type { Exercise, ID, LengthUnit, SetEntry, Workout } from './types';

const M_PER_MI = 1609.344;
const M_PER_YD = 0.9144;
const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

export type PaceUnit = 'mi' | 'km';
/** Miles when the profile length unit is inches, else kilometres. */
export const paceUnitFor = (lengthUnit: LengthUnit): PaceUnit => (lengthUnit === 'in' ? 'mi' : 'km');

export interface CondRow {
  setId: ID;
  workoutId: ID;
  exerciseId: ID;
  date: string;
  completedAt: string;
  durationSec?: number;
  distanceM?: number;
}

/** Completed, non-warm-up time/distance sets of finished, non-trashed workouts, oldest first. */
export function conditioningRows(sets: SetEntry[], exercises: Map<ID, Exercise>, workouts: Map<ID, Workout>): CondRow[] {
  const out: CondRow[] = [];
  for (const s of sets) {
    if (s.deletedAt || !s.completedAt || s.type === 'warmup') continue;
    const ex = exercises.get(s.exerciseId);
    const w = workouts.get(s.workoutId);
    if (!ex || ex.loadModel !== 'timeDistance' || !w || !w.endedAt || w.deletedAt) continue;
    if (s.durationSec === undefined && s.distanceM === undefined) continue;
    out.push({
      setId: s.id,
      workoutId: s.workoutId,
      exerciseId: s.exerciseId,
      date: localDateKey(w.startedAt),
      completedAt: s.completedAt,
      ...(s.durationSec !== undefined ? { durationSec: s.durationSec } : {}),
      ...(s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
    });
  }
  return out.sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1));
}

/** Seconds per mile or per kilometre. Undefined without both a positive time and distance. */
export function pace(durationSec: number | undefined, distanceM: number | undefined, unit: PaceUnit): number | undefined {
  if (!durationSec || !distanceM || durationSec <= 0 || distanceM <= 0) return undefined;
  return (durationSec / distanceM) * (unit === 'mi' ? M_PER_MI : 1000);
}

export function formatClock(sec: number): string {
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

export const formatPace = (secPerUnit: number, unit: PaceUnit) => `${formatClock(secPerUnit)} /${unit}`;

/** Yards and miles when the profile length unit is inches (yards under one mile), else metres and kilometres (metres under 1 km). */
export function formatDistance(m: number, lengthUnit: LengthUnit): string {
  if (lengthUnit === 'in') return m >= M_PER_MI * 0.95 ? `${round(m / M_PER_MI, 2)} mi` : `${Math.round(m / M_PER_YD)} yd`;
  return m >= 1000 ? `${round(m / 1000, 2)} km` : `${Math.round(m)} m`;
}

export interface ExerciseBlock {
  exerciseId: ID;
  rows: CondRow[];
  totalDurationSec: number;
  totalDistanceM: number;
  /** Average pace over sets that have both time and distance. */
  avgPaceSec?: number;
  /** Fastest single-set pace (sets with both). */
  fastestPaceSec?: number;
}
export interface SessionSummary {
  workoutId: ID;
  name: string;
  date: string;
  blocks: ExerciseBlock[];
  totalDurationSec: number;
  totalDistanceM: number;
}

/** Sessions that contain time/distance sets, newest first, with per-exercise totals and paces. */
export function sessionSummaries(rows: CondRow[], workouts: Map<ID, Workout>, unit: PaceUnit): SessionSummary[] {
  const byWorkout = new Map<ID, CondRow[]>();
  for (const r of rows) byWorkout.set(r.workoutId, [...(byWorkout.get(r.workoutId) ?? []), r]);
  const out: SessionSummary[] = [];
  for (const [workoutId, list] of byWorkout) {
    const w = workouts.get(workoutId);
    if (!w) continue;
    const byEx = new Map<ID, CondRow[]>();
    for (const r of list) byEx.set(r.exerciseId, [...(byEx.get(r.exerciseId) ?? []), r]);
    const blocks: ExerciseBlock[] = [...byEx.entries()].map(([exerciseId, rs]) => {
      const both = rs.filter((r) => r.durationSec && r.distanceM);
      const bothTime = both.reduce((s, r) => s + (r.durationSec ?? 0), 0);
      const bothDist = both.reduce((s, r) => s + (r.distanceM ?? 0), 0);
      const paces = both.map((r) => pace(r.durationSec, r.distanceM, unit)).filter((p): p is number => p !== undefined);
      const avg = pace(bothTime, bothDist, unit);
      return {
        exerciseId,
        rows: rs,
        totalDurationSec: rs.reduce((s, r) => s + (r.durationSec ?? 0), 0),
        totalDistanceM: rs.reduce((s, r) => s + (r.distanceM ?? 0), 0),
        ...(avg !== undefined ? { avgPaceSec: avg } : {}),
        ...(paces.length ? { fastestPaceSec: Math.min(...paces) } : {}),
      };
    });
    out.push({
      workoutId,
      name: w.name,
      date: localDateKey(w.startedAt),
      blocks,
      totalDurationSec: blocks.reduce((s, b) => s + b.totalDurationSec, 0),
      totalDistanceM: blocks.reduce((s, b) => s + b.totalDistanceM, 0),
    });
  }
  return out.sort((a, b) => (a.date === b.date ? (a.workoutId < b.workoutId ? 1 : -1) : a.date < b.date ? 1 : -1));
}

export interface DistanceBest {
  distanceM: number;
  bestTimeSec: number;
  date: string;
  count: number;
}

/**
 * Fastest time per exact distance (rounded to the metre) for one exercise, using sets with both time and distance.
 * Most-repeated distances first, so 400 m repeats lead and a one-off 5 km follows. Different distances are never compared.
 */
export function bestByDistance(rows: CondRow[], exerciseId: ID): DistanceBest[] {
  const map = new Map<number, DistanceBest>();
  for (const r of rows) {
    if (r.exerciseId !== exerciseId || !r.durationSec || !r.distanceM) continue;
    const d = Math.round(r.distanceM);
    const cur = map.get(d);
    if (!cur) map.set(d, { distanceM: d, bestTimeSec: r.durationSec, date: r.date, count: 1 });
    else {
      cur.count++;
      if (r.durationSec < cur.bestTimeSec) {
        cur.bestTimeSec = r.durationSec;
        cur.date = r.date;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.distanceM - b.distanceM);
}
