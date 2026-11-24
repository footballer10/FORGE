/**
 * Strong-format CSV export (pure). Columns match Strong's export so the file can go back into
 * Strong or this app's importer. Dumbbells are written as pair totals (what Strong users log),
 * which the importer halves again by default. All weights use one unit (Strong has no unit column).
 */
import { toCsv } from './csv';
import { convertWeight } from './units';
import type { Exercise, SetEntry, Workout, WeightUnit } from './types';

export interface ExportableWorkout {
  workout: Workout;
  exercises: { exerciseId: string; sets: SetEntry[]; notes?: string }[];
}

export const STRONG_HEADER = ['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE'];

const p2 = (n: number) => String(n).padStart(2, '0');

export function formatStrongDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function toStrongCsv(workouts: ExportableWorkout[], exercises: Exercise[], unit: WeightUnit = 'lb'): string {
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const rows: (string | number)[][] = [STRONG_HEADER];
  const sorted = [...workouts].sort((a, b) => a.workout.startedAt.localeCompare(b.workout.startedAt));
  for (const { workout, exercises: wes } of sorted) {
    const dur = workout.endedAt ? Math.max(0, Math.round((Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 1000)) : 0;
    for (const we of wes) {
      const ex = byId.get(we.exerciseId);
      const name = ex?.name ?? 'Unknown exercise';
      const pair = ex?.equipment === 'dumbbell' && ex.loadModel === 'perImplement' ? 2 : 1;
      let n = 0;
      const sets = we.sets.filter((s) => s.completedAt && !s.deletedAt).sort((a, b) => a.order - b.order);
      for (const s of sets) {
        const order = s.type === 'warmup' ? 'W' : s.type === 'drop' ? 'D' : s.type === 'failure' ? 'F' : String(++n);
        const w = s.weight === undefined ? 0 : round(convertWeight(s.weight, s.unit, unit) * pair);
        rows.push([
          formatStrongDate(workout.startedAt),
          workout.name,
          formatDuration(dur),
          name,
          order,
          w,
          s.reps ?? 0,
          s.distanceM ?? 0,
          s.durationSec ?? 0,
          we.notes ?? '',
          workout.notes ?? '',
          s.rpe ?? '',
        ]);
      }
    }
  }
  return toCsv(rows);
}
