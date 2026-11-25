/**
 * Read-only analytics the Claude connector exposes (milestone 10c). Pure functions over rows
 * already read from D1, so they can be tested without a server. Every result states its units
 * and, for e1RM, the formula and inputs.
 */
import { estimate1rm, formulaInfo } from '../../src/domain/e1rm';
import { effectiveLoad, isAnalyticSet } from '../../src/domain/load';
import { volumeSets, weeklyTotals } from '../../src/domain/volume';
import type {
  BodyMetric, Exercise, PlannedSession, Profile, Program, ProgramWeek, SetEntry, Workout, WorkoutExercise,
} from '../../src/domain/types';

export interface Data {
  profile?: Profile;
  exercises: Exercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: SetEntry[];
  programs: Program[];
  programWeeks: ProgramWeek[];
  plannedSessions: PlannedSession[];
  bodyMetrics: BodyMetric[];
}

const day = (iso: string) => iso.slice(0, 10); // UTC day: the Worker has no time zone
const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const finished = (w: Workout) => !w.deletedAt && !!w.endedAt;
const byName = (d: Data) => new Map(d.exercises.map((e) => [e.id, e]));

export function getProfile(d: Data) {
  const p = d.profile;
  if (!p) return { note: 'No profile has been synced yet.' };
  return {
    name: p.name, sex: p.sex, birthYear: p.birthYear, heightCm: p.heightCm, goals: p.goals, sport: p.sport, position: p.position,
    trainingPhase: p.trainingPhase, constraints: p.constraints, plannedDaysPerWeek: p.plannedDaysPerWeek,
    weightUnit: p.weightUnit, e1rmFormula: p.e1rmFormula,
    equipment: p.equipmentProfiles.map((e) => e.name),
  };
}

export function listExercises(d: Data, query?: string) {
  const q = query?.trim().toLowerCase();
  return d.exercises
    .filter((e) => !e.deletedAt && !e.archived && (!q || e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase().includes(q))))
    .slice(0, 100)
    .map((e) => ({ name: e.name, equipment: e.equipment, pattern: e.pattern, primaryMuscles: e.primaryMuscles, secondaryMuscles: e.secondaryMuscles, loadModel: e.loadModel }));
}

export function listWorkouts(d: Data, opts: { from?: string; to?: string; limit?: number }) {
  const ex = byName(d);
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);
  const wes = d.workoutExercises.filter((x) => !x.deletedAt);
  return d.workouts
    .filter((w) => finished(w) && (!opts.from || day(w.startedAt) >= opts.from) && (!opts.to || day(w.startedAt) <= opts.to))
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit)
    .map((w) => ({
      date: day(w.startedAt),
      name: w.name,
      minutes: w.endedAt ? Math.round((Date.parse(w.endedAt) - Date.parse(w.startedAt)) / 60000) : undefined,
      notes: w.notes,
      exercises: wes
        .filter((x) => x.workoutId === w.id)
        .sort((a, b) => a.order - b.order)
        .map((x) => {
          const sets = d.sets.filter((s) => s.workoutExerciseId === x.id && !s.deletedAt && s.completedAt).sort((a, b) => a.order - b.order);
          return {
            exercise: ex.get(x.exerciseId)?.name ?? 'Unknown exercise',
            warmupSets: sets.filter((s) => s.type === 'warmup').length,
            workingSets: sets.filter(isAnalyticSet).map(fmtSet),
          };
        }),
    }));
}

function fmtSet(s: SetEntry) {
  const parts: string[] = [];
  if (s.weight !== undefined) parts.push(`${s.weight}${s.unit}`);
  if (s.reps !== undefined) parts.push(`x${s.reps}`);
  if (s.rpe !== undefined) parts.push(`@RPE${s.rpe}`);
  if (s.durationSec !== undefined) parts.push(`${s.durationSec}s`);
  if (s.distanceM !== undefined) parts.push(`${s.distanceM}m`);
  return parts.join(' ') + (s.type !== 'working' ? ` (${s.type})` : '');
}

export function getExerciseHistory(d: Data, name: string, limit = 10) {
  const q = name.trim().toLowerCase();
  const exercise =
    d.exercises.find((e) => !e.deletedAt && e.name.toLowerCase() === q) ??
    d.exercises.find((e) => !e.deletedAt && (e.name.toLowerCase().includes(q) || e.aliases.some((a) => a.toLowerCase() === q)));
  if (!exercise) return { error: `No exercise matches "${name}". Use list_exercises to find the name.` };
  const unit = d.profile?.weightUnit ?? 'lb';
  const formula = d.profile?.e1rmFormula ?? 'epley';
  const wk = new Map(d.workouts.filter(finished).map((w) => [w.id, w]));
  const sets = d.sets.filter((s) => s.exerciseId === exercise.id && !s.deletedAt && isAnalyticSet(s) && wk.has(s.workoutId));
  const groups = new Map<string, SetEntry[]>();
  for (const s of sets) groups.set(s.workoutId, [...(groups.get(s.workoutId) ?? []), s]);
  const sessions = [...groups.entries()]
    .map(([wid, ss]) => ({ w: wk.get(wid)!, ss: ss.sort((a, b) => a.order - b.order) }))
    .sort((a, b) => (a.w.startedAt < b.w.startedAt ? 1 : -1));
  const e1rmOf = (s: SetEntry, w: Workout) => {
    const load = s.reps ? effectiveLoad(s, exercise, w.bodyweight, unit) : null;
    return load && s.reps && s.reps <= 12 ? estimate1rm(formula, load, s.reps) : 0;
  };
  const out = sessions.slice(0, Math.min(Math.max(limit, 1), 50)).map(({ w, ss }) => ({
    date: day(w.startedAt),
    workingSets: ss.map(fmtSet),
    bestE1rm: round(Math.max(0, ...ss.map((s) => e1rmOf(s, w)))),
  }));
  const allBest = Math.max(0, ...sessions.flatMap(({ w, ss }) => ss.map((s) => e1rmOf(s, w))));
  return {
    exercise: exercise.name,
    loadModel: exercise.loadModel,
    e1rm: { unit, formula: `${formulaInfo(formula).name}: ${formulaInfo(formula).formula}`, note: 'Estimated from working sets of 1 to 12 reps; load is the effective load for the exercise load model.' },
    allTimeBestE1rm: round(allBest),
    totalSessions: sessions.length,
    recentSessions: out,
  };
}

export function getWeeklySets(d: Data, weeks = 8, today = new Date().toISOString().slice(0, 10)) {
  const unit = d.profile?.weightUnit ?? 'lb';
  const vs = volumeSets(d.sets, byName(d), new Map(d.workouts.map((w) => [w.id, w])), d.bodyMetrics, unit);
  return {
    method: 'Hard sets per muscle: completed non-warm-up sets; 1 credit for a primary muscle, 0.5 for a secondary. Weeks start Monday (UTC).',
    weeks: weeklyTotals(vs, today, Math.min(Math.max(weeks, 1), 26)).map(({ week, totals }) => ({
      weekStarting: week,
      totalSets: totals.sets,
      setsByMuscle: Object.fromEntries([...totals.byMuscle.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => [m, n])),
    })),
  };
}

export function getActiveProgram(d: Data) {
  const program = d.programs.filter((p) => !p.deletedAt && p.status === 'active').sort((a, b) => b.version - a.version)[0];
  if (!program) return { note: 'No active program.' };
  const ex = byName(d);
  const weeks = d.programWeeks.filter((w) => !w.deletedAt && w.programId === program.id).sort((a, b) => a.weekNumber - b.weekNumber);
  return {
    name: program.name, version: program.version, author: program.author, changeReason: program.changeReason,
    startDate: program.startDate, daysPerWeek: program.daysPerWeek, description: program.description,
    weeks: weeks.map((w) => ({
      week: w.weekNumber, phase: w.phase, deload: !!w.isDeload,
      sessions: d.plannedSessions
        .filter((s) => !s.deletedAt && s.programWeekId === w.id)
        .sort((a, b) => a.dayNumber - b.dayNumber)
        .map((s) => ({
          day: s.dayNumber, name: s.name, date: s.scheduledDate, done: !!s.completedWorkoutId, skipped: !!s.skipped,
          exercises: s.exercises.sort((a, b) => a.order - b.order).map((e) => ({
            exercise: ex.get(e.exerciseId)?.name ?? 'Unknown exercise',
            targets: e.targets.map((t) => [t.reps !== undefined ? `${t.reps}${t.repsMax ? `-${t.repsMax}` : ''} reps` : '', t.weight !== undefined ? `${t.weight}${t.unit ?? ''}` : '', t.percentE1rm ? `${Math.round(t.percentE1rm * 100)}% e1RM` : '', t.rpe ? `RPE ${t.rpe}` : ''].filter(Boolean).join(' ') || t.type),
          })),
        })),
    })),
  };
}

export function getBodyweight(d: Data, limit = 30) {
  const unit = d.profile?.weightUnit ?? 'lb';
  return {
    profileUnit: unit,
    entries: d.bodyMetrics
      .filter((m) => !m.deletedAt && m.kind === 'bodyweight')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, Math.min(Math.max(limit, 1), 200))
      .map((m) => ({ date: m.date, value: m.value, unit: m.unit })),
  };
}
