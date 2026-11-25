import type { ID, Routine, RoutineExercise, Workout } from './types';
import { nextSession, weekLabel, type ProgramTree } from './program';

export interface NextUp {
  kind: 'program' | 'routine';
  /** Planned session id (program) or routine id. */
  id: ID;
  name: string;
  /** Where it comes from, e.g. "Hypertrophy block · Week 2". */
  source: string;
  exercises: RoutineExercise[];
}

/**
 * What to train next. The newest active program that still has an open session wins (first session
 * in plan order that is neither done nor skipped). Otherwise the routine of the most recent
 * finished workout, when it still exists. Otherwise nothing.
 */
export function pickNextUp(input: {
  trees: readonly ProgramTree[];
  routines: readonly Routine[];
  workouts: readonly Pick<Workout, 'routineId' | 'startedAt' | 'endedAt' | 'deletedAt'>[];
}): NextUp | undefined {
  const active = input.trees
    .filter((t) => t.program.status === 'active' && !t.program.deletedAt)
    .sort((a, b) => b.program.updatedAt.localeCompare(a.program.updatedAt));
  for (const tree of active) {
    const n = nextSession(tree);
    if (n) {
      return {
        kind: 'program',
        id: n.session.id,
        name: n.session.name,
        source: `${tree.program.name} · ${weekLabel(n.week)}`,
        exercises: n.session.exercises,
      };
    }
  }
  const last = input.workouts
    .filter((w) => w.endedAt && !w.deletedAt && w.routineId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  const routine = last && input.routines.find((r) => r.id === last.routineId && !r.deletedAt);
  return routine ? { kind: 'routine', id: routine.id, name: routine.name, source: 'Last routine', exercises: routine.exercises } : undefined;
}

export interface PreviewLine {
  exerciseId: ID;
  name: string;
  /** e.g. "3 × 8 @ 140 lb"; weight omitted when none is known. */
  summary: string;
}

/** "3 × 8 @ 140 lb" from working sets; falls back to "3 sets" when reps differ. */
export function summarizeSets(sets: readonly { type: string; weight?: number; reps?: number; unit: string }[]): string {
  const work = sets.filter((s) => s.type !== 'warmup');
  if (work.length === 0) return 'warm-up only';
  const reps = new Set(work.map((s) => s.reps));
  const weights = new Set(work.map((s) => s.weight));
  const count = reps.size === 1 && work[0]?.reps !== undefined ? `${work.length} × ${work[0].reps}` : `${work.length} sets`;
  const heaviest = Math.max(...work.map((s) => s.weight ?? 0));
  if (heaviest <= 0) return count;
  return `${count} @ ${weights.size === 1 ? '' : 'up to '}${Math.round(heaviest * 100) / 100} ${work[0]?.unit ?? ''}`.trim();
}
