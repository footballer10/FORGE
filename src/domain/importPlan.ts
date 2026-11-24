/**
 * Import planning (pure): match Strong exercise names to the library, decide how each new
 * exercise is modelled, apply the dumbbell pair-total convention, detect duplicate workouts,
 * and build the entities to store. No Dexie or React imports.
 */
import type { ParsedWorkout, StrongRow } from './strongParser';
import type {
  Equipment,
  Exercise,
  ID,
  ISODateTime,
  ImportBatch,
  ImportConventions,
  LoadModel,
  MovementPattern,
  RawImportRow,
  SetEntry,
  Workout,
  WorkoutExercise,
  WeightUnit,
} from './types';

export type DumbbellConvention = 'pairTotal' | 'perImplement';

// ---------------------------------------------------------------------------
// Names and matching
// ---------------------------------------------------------------------------

export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** "Bench Press (Barbell)" → { base: "Bench Press", tag: "Barbell" }. */
export function splitTag(name: string): { base: string; tag?: string } {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(name.trim());
  return m ? { base: m[1]!.trim(), tag: m[2]!.trim() } : { base: name.trim() };
}

const EQUIPMENT_TAGS: Record<string, Equipment> = {
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  'smith machine': 'machine',
  kettlebell: 'kettlebell',
  band: 'band',
  'resistance band': 'band',
  'ez bar': 'ez bar',
  'ez-bar': 'ez bar',
  'trap bar': 'trap bar',
  'hex bar': 'trap bar',
  bodyweight: 'bodyweight',
  'body weight': 'bodyweight',
  sled: 'sled',
  'medicine ball': 'medicine ball',
};

function tokens(s: string): Set<string> {
  return new Set(
    normName(s)
      .replace(/[()]/g, ' ')
      .split(/[^a-z0-9]+/)
      .filter((t) => t && !['the', 'a', 'of', 'with'].includes(t)),
  );
}

function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

export interface SourceExercise {
  name: string;
  setCount: number;
  workoutCount: number;
  hasWeight: boolean;
  hasReps: boolean;
  hasTime: boolean;
  hasDistance: boolean;
}

export function summarizeExercises(workouts: ParsedWorkout[]): SourceExercise[] {
  const map = new Map<string, SourceExercise & { ws: Set<string> }>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      let s = map.get(e.name);
      if (!s) {
        s = { name: e.name, setCount: 0, workoutCount: 0, hasWeight: false, hasReps: false, hasTime: false, hasDistance: false, ws: new Set() };
        map.set(e.name, s);
      }
      s.ws.add(w.key);
      for (const r of e.rows) {
        s.setCount++;
        if ((r.weight ?? 0) > 0) s.hasWeight = true;
        if ((r.reps ?? 0) > 0) s.hasReps = true;
        if ((r.seconds ?? 0) > 0) s.hasTime = true;
        if ((r.distanceM ?? 0) > 0) s.hasDistance = true;
      }
    }
  }
  return [...map.values()]
    .map(({ ws, ...s }) => ({ ...s, workoutCount: ws.size }))
    .sort((a, b) => b.setCount - a.setCount || a.name.localeCompare(b.name));
}

export interface ExerciseDraft {
  name: string;
  aliases: string[];
  equipment: Equipment;
  loadModel: LoadModel;
  pattern: MovementPattern;
}

/** How a not-yet-known Strong exercise should be modelled, from its name and the data in the file. */
export function draftExercise(src: SourceExercise): ExerciseDraft {
  const { base, tag } = splitTag(src.name);
  const tagLc = (tag ?? '').toLowerCase();
  let equipment: Equipment = EQUIPMENT_TAGS[tagLc] ?? 'other';
  const nameLc = src.name.toLowerCase();
  let loadModel: LoadModel;
  if (tagLc === 'assisted' || /assisted/.test(nameLc)) {
    equipment = 'machine';
    loadModel = 'assisted';
  } else if (tagLc === 'weighted' || /weighted/.test(nameLc)) {
    equipment = 'bodyweight';
    loadModel = 'bodyweightPlusAdded';
  } else if (!src.hasReps && (src.hasTime || src.hasDistance)) {
    loadModel = 'timeDistance';
  } else if (equipment === 'dumbbell' || equipment === 'kettlebell') {
    loadModel = 'perImplement';
  } else if (tag === undefined && !src.hasWeight) {
    equipment = 'bodyweight';
    loadModel = /pull[- ]?up|chin[- ]?up|dip\b|muscle[- ]up/i.test(base) ? 'bodyweightPlusAdded' : 'repsOnly';
  } else if (equipment === 'bodyweight') {
    loadModel = src.hasWeight || /pull[- ]?up|chin[- ]?up|dip\b/i.test(base) ? 'bodyweightPlusAdded' : 'repsOnly';
  } else {
    loadModel = 'total';
  }
  let pattern: MovementPattern = 'other';
  if (loadModel === 'timeDistance') pattern = /plank|hold|carry/i.test(base) ? (/carry/i.test(base) ? 'carry' : 'core') : 'conditioning';
  const aliases = tag && base && normName(base) !== normName(src.name) ? [base] : [];
  return { name: src.name, aliases, equipment, loadModel, pattern };
}

export interface ExerciseMatch {
  source: SourceExercise;
  /** Set when the name (or an alias) equals the Strong name exactly (case-insensitive). */
  exact?: Exercise;
  /** Close candidates for a manual map, best first. Never auto-applied. */
  suggestions: Exercise[];
  draft: ExerciseDraft;
}

/**
 * Exact match: Strong name equals an exercise name or alias. Failing that, a bare-name match
 * is accepted only when exactly one exercise carries that alias and its equipment agrees with
 * the "(Equipment)" tag (so "Curl (Dumbbell)" never maps to a barbell curl).
 */
export function matchExercises(sources: SourceExercise[], library: Exercise[]): ExerciseMatch[] {
  const live = library.filter((e) => !e.deletedAt);
  const byKey = new Map<string, Exercise[]>();
  for (const e of live) {
    for (const k of new Set([normName(e.name), ...e.aliases.map(normName)])) {
      const list = byKey.get(k) ?? [];
      list.push(e);
      byKey.set(k, list);
    }
  }
  return sources.map((source) => {
    const draft = draftExercise(source);
    const full = byKey.get(normName(source.name));
    // Prefer the exercise whose own name is the Strong name over one that merely aliases it.
    let exact = full?.find((e) => normName(e.name) === normName(source.name)) ?? full?.[0];
    const { base, tag } = splitTag(source.name);
    if (!exact && tag) {
      const sameEquip = (byKey.get(normName(base)) ?? []).filter((e) => draft.equipment === 'other' || e.equipment === draft.equipment);
      if (sameEquip.length === 1) exact = sameEquip[0];
    }
    const suggestions = exact
      ? []
      : live
          .map((e) => ({ e, score: Math.max(similarity(source.name, e.name), ...e.aliases.map((a) => similarity(source.name, a))) }))
          .filter((x) => x.score >= 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((x) => x.e);
    return { source, ...(exact ? { exact } : {}), suggestions, draft };
  });
}

// ---------------------------------------------------------------------------
// Conventions
// ---------------------------------------------------------------------------

/** Only dumbbells were logged as pair totals; kettlebells and everything else are single loads. */
export const isDumbbell = (e: { equipment: Equipment; loadModel: LoadModel }) =>
  e.equipment === 'dumbbell' && e.loadModel === 'perImplement';

/** Applies the dumbbell convention to a logged weight; float noise is trimmed to 3 decimals. */
export function applyConvention(weight: number | undefined, convention: DumbbellConvention | undefined): number | undefined {
  if (weight === undefined) return undefined;
  const v = convention === 'pairTotal' ? weight / 2 : weight;
  return Math.round(v * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

const minuteOf = (iso: ISODateTime) => iso.slice(0, 16);

/**
 * A file workout is a duplicate when an existing (non-deleted) workout started in the same minute.
 * Nobody starts two workouts in the same minute, and this still matches after the user edited sets.
 */
export function findDuplicates(workouts: ParsedWorkout[], existing: { startedAt: ISODateTime }[]): Set<string> {
  const taken = new Set(existing.map((w) => minuteOf(w.startedAt)));
  return new Set(workouts.filter((w) => taken.has(minuteOf(w.startedAt))).map((w) => w.key));
}

// ---------------------------------------------------------------------------
// Building entities
// ---------------------------------------------------------------------------

export type Resolution = { kind: 'map'; exerciseId: ID } | { kind: 'create' };

export interface ImportChoices {
  defaultUnit: WeightUnit;
  /** Applied to every dumbbell exercise unless overridden below. */
  dumbbellConvention: DumbbellConvention;
  /** Strong name → map to an existing exercise or create a new one. Missing = use the match's exact hit, else create. */
  resolutions: Record<string, Resolution>;
  /** Strong name → convention for that exercise only. */
  dumbbellOverrides: Record<string, DumbbellConvention>;
}

export interface BuiltImport {
  newExercises: Exercise[];
  workouts: Workout[];
  workoutExercises: WorkoutExercise[];
  sets: SetEntry[];
  rawRows: RawImportRow[];
  batch: ImportBatch;
  skippedDuplicates: ParsedWorkout[];
}

export interface BuildInput {
  fileName: string;
  workouts: ParsedWorkout[];
  matches: ExerciseMatch[];
  library: Exercise[];
  choices: ImportChoices;
  duplicates: Set<string>;
  ignoredRows: number;
  now: ISODateTime;
  newId: () => ID;
}

/** Resolved target for one Strong exercise name. */
export interface ResolvedExercise {
  exerciseId: ID;
  isNew: boolean;
  dumbbell: boolean;
  convention?: DumbbellConvention;
}

export function resolveExercises(
  matches: ExerciseMatch[],
  library: Exercise[],
  choices: ImportChoices,
  now: ISODateTime,
  newId: () => ID,
): { resolved: Map<string, ResolvedExercise>; newExercises: Exercise[] } {
  const resolved = new Map<string, ResolvedExercise>();
  const newExercises: Exercise[] = [];
  for (const m of matches) {
    const choice: Resolution = choices.resolutions[m.source.name] ?? (m.exact ? { kind: 'map', exerciseId: m.exact.id } : { kind: 'create' });
    let exercise: { id: ID; equipment: Equipment; loadModel: LoadModel };
    let isNew = false;
    const target = choice.kind === 'map' ? library.find((e) => e.id === choice.exerciseId) : undefined;
    if (target) {
      exercise = target;
    } else {
      const d = m.draft;
      const created: Exercise = {
        id: newId(),
        createdAt: now,
        updatedAt: now,
        name: d.name,
        aliases: d.aliases,
        equipment: d.equipment,
        primaryMuscles: [],
        secondaryMuscles: [],
        pattern: d.pattern,
        unilateral: false,
        defaultRestSec: d.loadModel === 'timeDistance' || d.loadModel === 'repsOnly' ? 60 : 90,
        weightIncrement: 5,
        incrementUnit: 'lb',
        loadModel: d.loadModel,
        source: 'import',
      };
      newExercises.push(created);
      exercise = created;
      isNew = true;
    }
    const dumbbell = isDumbbell(exercise);
    const convention = dumbbell ? (choices.dumbbellOverrides[m.source.name] ?? choices.dumbbellConvention) : undefined;
    resolved.set(m.source.name, { exerciseId: exercise.id, isNew, dumbbell, ...(convention ? { convention } : {}) });
  }
  return { resolved, newExercises };
}

function toSet(
  row: StrongRow,
  base: { id: ID; workoutExerciseId: ID; workoutId: ID; exerciseId: ID; order: number; now: ISODateTime; completedAt: ISODateTime },
  unit: WeightUnit,
  convention: DumbbellConvention | undefined,
): SetEntry {
  const set: SetEntry = {
    id: base.id,
    createdAt: base.now,
    updatedAt: base.now,
    workoutExerciseId: base.workoutExerciseId,
    workoutId: base.workoutId,
    exerciseId: base.exerciseId,
    order: base.order,
    type: row.type,
    unit,
    completedAt: base.completedAt,
  };
  const weight = applyConvention(row.weight, convention);
  if (weight !== undefined) set.weight = weight;
  if (row.reps !== undefined && row.reps > 0) set.reps = row.reps;
  if (row.rpe !== undefined) set.rpe = row.rpe;
  if (row.seconds !== undefined) set.durationSec = row.seconds;
  if (row.distanceM !== undefined) set.distanceM = row.distanceM;
  return set;
}

export function buildImport(input: BuildInput): BuiltImport {
  const { workouts, matches, library, choices, duplicates, now, newId } = input;
  const { resolved, newExercises } = resolveExercises(matches, library, choices, now, newId);
  const batchId = newId();
  const kept = workouts.filter((w) => !duplicates.has(w.key));
  const outWorkouts: Workout[] = [];
  const outWes: WorkoutExercise[] = [];
  const outSets: SetEntry[] = [];
  const rawRows: RawImportRow[] = [];
  const usedNew = new Set<ID>();
  const usedNames = new Set<string>();

  for (const pw of kept) {
    const workoutId = newId();
    const startMs = Date.parse(pw.startedAt);
    const durationSec = pw.durationSec ?? 0;
    const endedAt = new Date(startMs + durationSec * 1000).toISOString();
    const totalSets = pw.exercises.reduce((n, e) => n + e.rows.length, 0);
    const timeOnly = pw.exercises.every((e) => e.rows.every((r) => !(r.reps && r.reps > 0) && !(r.weight && r.weight > 0)));
    const workout: Workout = {
      id: workoutId,
      createdAt: now,
      updatedAt: now,
      name: pw.name,
      kind: timeOnly ? 'conditioning' : 'strength',
      startedAt: pw.startedAt,
      endedAt,
      importBatchId: batchId,
    };
    if (pw.notes) workout.notes = pw.notes;
    outWorkouts.push(workout);

    let setIndex = 0;
    pw.exercises.forEach((pe, order) => {
      const target = resolved.get(pe.name)!;
      usedNames.add(pe.name);
      if (target.isNew) usedNew.add(target.exerciseId);
      const weId = newId();
      const notes = [...new Set(pe.rows.map((r) => r.notes).filter(Boolean))].join(' · ');
      const we: WorkoutExercise = {
        id: weId,
        createdAt: now,
        updatedAt: now,
        workoutId,
        exerciseId: target.exerciseId,
        order,
      };
      if (notes) we.notes = notes;
      outWes.push(we);
      pe.rows.forEach((row, i) => {
        setIndex++;
        // Spread completion times across the workout so per-exercise history orders sensibly.
        const completedAt = new Date(startMs + Math.round((durationSec * 1000 * setIndex) / Math.max(totalSets, 1))).toISOString();
        const unit = row.weightUnit ?? choices.defaultUnit;
        const set = toSet(row, { id: newId(), workoutExerciseId: weId, workoutId, exerciseId: target.exerciseId, order: i, now, completedAt }, unit, target.convention);
        outSets.push(set);
        rawRows.push({ id: newId(), batchId, rowIndex: row.rowIndex, data: row.raw, setId: set.id, workoutId });
      });
    });
  }

  const conventions: ImportConventions = { defaultUnit: choices.defaultUnit, exerciseRules: {} };
  for (const [name, r] of resolved) {
    if (!usedNames.has(name)) continue;
    conventions.exerciseRules[name] = { exerciseId: r.exerciseId, ...(r.convention ? { dumbbellConvention: r.convention } : {}) };
  }
  const batch: ImportBatch = {
    id: batchId,
    createdAt: now,
    updatedAt: now,
    source: 'strong',
    fileName: input.fileName,
    importedAt: now,
    rowCount: rawRows.length + input.ignoredRows,
    workoutCount: outWorkouts.length,
    conventions,
    duplicateCount: workouts.length - kept.length,
  };
  return {
    newExercises: newExercises.filter((e) => usedNew.has(e.id)),
    workouts: outWorkouts,
    workoutExercises: outWes,
    sets: outSets,
    rawRows,
    batch,
    skippedDuplicates: workouts.filter((w) => duplicates.has(w.key)),
  };
}
