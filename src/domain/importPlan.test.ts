import { describe, expect, it } from 'vitest';
import { applyConvention, weightFromRawRow, buildImport, draftExercise, findDuplicates, matchExercises, splitTag, summarizeExercises } from './importPlan';
import { groupStrongWorkouts, parseStrongCsv } from './strongParser';
import type { ImportChoices } from './importPlan';
import type { Exercise } from './types';

const T = '2026-01-01T00:00:00.000Z';
let n = 0;
const id = () => `id-${++n}`;

function lib(partial: Partial<Exercise> & Pick<Exercise, 'id' | 'name' | 'equipment' | 'loadModel'>): Exercise {
  return {
    createdAt: T,
    updatedAt: T,
    aliases: [],
    primaryMuscles: [],
    secondaryMuscles: [],
    pattern: 'other',
    unilateral: false,
    defaultRestSec: 90,
    weightIncrement: 5,
    incrementUnit: 'lb',
    source: 'library',
    ...partial,
  };
}

const bench = lib({ id: 'bench', name: 'Barbell Bench Press - Medium Grip', equipment: 'barbell', loadModel: 'total', aliases: ['Bench Press', 'Bench Press (Barbell)'] });
const dbCurl = lib({ id: 'dbcurl', name: 'Dumbbell Bicep Curl', equipment: 'dumbbell', loadModel: 'perImplement', aliases: ['Bicep Curl', 'Bicep Curl (Dumbbell)'] });
const bbCurl = lib({ id: 'bbcurl', name: 'Barbell Curl', equipment: 'barbell', loadModel: 'total', aliases: ['Curl', 'Curl (Barbell)'] });
const kb = lib({ id: 'kb', name: 'Kettlebell Swing', equipment: 'kettlebell', loadModel: 'perImplement', aliases: ['Swing (Kettlebell)'] });
const library = [bench, dbCurl, bbCurl, kb];

const CSV = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2024-03-05 18:30:12,Push,1h,Bench Press (Barbell),W,95,8,0,0,,Good,',
  '2024-03-05 18:30:12,Push,1h,Bench Press (Barbell),1,185,5,0,0,tempo,Good,8',
  '2024-03-05 18:30:12,Push,1h,Bicep Curl (Dumbbell),1,60,10,0,0,,,',
  '2024-03-05 18:30:12,Push,1h,Pull Up,1,0,10,0,0,,,',
  '2024-03-05 18:30:12,Push,1h,Pull Up (Assisted),1,40,8,0,0,,,',
  '2024-03-05 18:30:12,Push,1h,Plank,1,0,0,0,60,,,',
  '2024-03-05 18:30:12,Push,1h,Weird Machine Thing (Machine),1,100,12,0,0,,,',
].join('\n');

function parse(csv = CSV) {
  const r = parseStrongCsv(csv);
  if ('error' in r) throw new Error(r.error);
  const workouts = groupStrongWorkouts(r.rows);
  const sources = summarizeExercises(workouts);
  return { r, workouts, sources, matches: matchExercises(sources, library) };
}

describe('splitTag', () => {
  it('splits a trailing parenthetical', () => {
    expect(splitTag('Bench Press (Barbell)')).toEqual({ base: 'Bench Press', tag: 'Barbell' });
    expect(splitTag('Pull Up')).toEqual({ base: 'Pull Up' });
  });
});

describe('draftExercise', () => {
  const src = (name: string, o: Partial<{ hasWeight: boolean; hasReps: boolean; hasTime: boolean; hasDistance: boolean }> = {}) =>
    ({ name, setCount: 1, workoutCount: 1, hasWeight: true, hasReps: true, hasTime: false, hasDistance: false, ...o });

  it('models dumbbells per implement, barbell as total, assisted as assisted', () => {
    expect(draftExercise(src('Fly (Dumbbell)'))).toMatchObject({ equipment: 'dumbbell', loadModel: 'perImplement', aliases: ['Fly'] });
    expect(draftExercise(src('Row (Barbell)'))).toMatchObject({ equipment: 'barbell', loadModel: 'total' });
    expect(draftExercise(src('Pull Up (Assisted)'))).toMatchObject({ loadModel: 'assisted' });
    expect(draftExercise(src('Pull Up (Weighted)'))).toMatchObject({ loadModel: 'bodyweightPlusAdded' });
  });

  it('models bodyweight and time/distance exercises from the data', () => {
    expect(draftExercise(src('Pull Up', { hasWeight: false }))).toMatchObject({ equipment: 'bodyweight', loadModel: 'bodyweightPlusAdded' });
    expect(draftExercise(src('Push Up', { hasWeight: false }))).toMatchObject({ loadModel: 'repsOnly' });
    expect(draftExercise(src('Plank', { hasWeight: false, hasReps: false, hasTime: true }))).toMatchObject({ loadModel: 'timeDistance', pattern: 'core' });
    expect(draftExercise(src('Running', { hasWeight: false, hasReps: false, hasTime: true, hasDistance: true }))).toMatchObject({ loadModel: 'timeDistance' });
  });
});

describe('matchExercises', () => {
  it('matches exact aliases and respects the equipment tag', () => {
    const { matches } = parse();
    const by = (name: string) => matches.find((m) => m.source.name === name)!;
    expect(by('Bench Press (Barbell)').exact?.id).toBe('bench');
    expect(by('Bicep Curl (Dumbbell)').exact?.id).toBe('dbcurl');
    expect(by('Pull Up').exact).toBeUndefined();
  });

  it('does not map a bare-name alias across equipment', () => {
    const p = parse('Date,Exercise Name,Set Order,Weight,Reps\n2024-01-01 10:00:00,Curl (Dumbbell),1,20,10');
    const m = matchExercises(p.sources, [bbCurl]);
    expect(m[0]!.exact).toBeUndefined();
  });

  it('suggests close names without auto-applying them', () => {
    const m = matchExercises(
      [{ name: 'Barbell Bench Press Wide', setCount: 1, workoutCount: 1, hasWeight: true, hasReps: true, hasTime: false, hasDistance: false }],
      library,
    );
    expect(m[0]!.exact).toBeUndefined();
    expect(m[0]!.suggestions.map((e) => e.id)).toContain('bench');
  });
});

describe('applyConvention', () => {
  it('halves pair totals and leaves per-implement weights', () => {
    expect(applyConvention(60, 'pairTotal')).toBe(30);
    expect(applyConvention(55, 'pairTotal')).toBe(27.5);
    expect(applyConvention(60, 'perImplement')).toBe(60);
    expect(applyConvention(undefined, 'pairTotal')).toBeUndefined();
  });
});

describe('findDuplicates', () => {
  it('flags workouts that start in the same minute as an existing one', () => {
    const { workouts } = parse();
    const t = workouts[0]!.startedAt;
    expect(findDuplicates(workouts, [{ startedAt: t }]).size).toBe(1);
    expect(findDuplicates(workouts, [{ startedAt: '1999-01-01T00:00:00.000Z' }]).size).toBe(0);
  });
});

describe('buildImport', () => {
  const choices: ImportChoices = { defaultUnit: 'lb', dumbbellConvention: 'pairTotal', resolutions: {}, dumbbellOverrides: {} };
  const build = (over: Partial<ImportChoices> = {}, csv?: string, dupes = new Set<string>()) => {
    const p = parse(csv);
    return buildImport({
      fileName: 'strong.csv',
      workouts: p.workouts,
      matches: p.matches,
      library,
      choices: { ...choices, ...over },
      duplicates: dupes,
      ignoredRows: p.r.ignoredRows,
      now: T,
      newId: id,
    });
  };

  it('halves dumbbell pair totals by default and keeps barbell weights', () => {
    const out = build();
    const curl = out.sets.find((s) => s.exerciseId === 'dbcurl')!;
    expect(curl.weight).toBe(30);
    const benchSets = out.sets.filter((s) => s.exerciseId === 'bench');
    expect(benchSets.map((s) => [s.type, s.weight, s.unit])).toEqual([
      ['warmup', 95, 'lb'],
      ['working', 185, 'lb'],
    ]);
    expect(benchSets[1]!.rpe).toBe(8);
  });

  it('can keep dumbbell weights as logged, globally or per exercise', () => {
    expect(build({ dumbbellConvention: 'perImplement' }).sets.find((s) => s.exerciseId === 'dbcurl')!.weight).toBe(60);
    expect(build({ dumbbellOverrides: { 'Bicep Curl (Dumbbell)': 'perImplement' } }).sets.find((s) => s.exerciseId === 'dbcurl')!.weight).toBe(60);
  });

  it('uses the default unit, or the unit the file states', () => {
    expect(build({ defaultUnit: 'kg' }).sets.every((s) => s.unit === 'kg')).toBe(true);
    const kgFile = CSV.replace('Date,Workout Name,Duration,Exercise Name,Set Order,Weight,', 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight (kg),');
    expect(build({ defaultUnit: 'lb' }, kgFile).sets.every((s) => s.unit === 'kg')).toBe(true);
  });

  it('creates new exercises with the inferred model and maps exact matches', () => {
    const out = build();
    const byName = Object.fromEntries(out.newExercises.map((e) => [e.name, e]));
    expect(Object.keys(byName).sort()).toEqual(['Plank', 'Pull Up', 'Pull Up (Assisted)', 'Weird Machine Thing (Machine)']);
    expect(byName['Pull Up']).toMatchObject({ loadModel: 'bodyweightPlusAdded', source: 'import' });
    expect(byName['Pull Up (Assisted)']).toMatchObject({ loadModel: 'assisted' });
    expect(byName['Plank']).toMatchObject({ loadModel: 'timeDistance' });
    const assistedSet = out.sets.find((s) => s.exerciseId === byName['Pull Up (Assisted)']!.id)!;
    expect(assistedSet.weight).toBe(40);
    const plankSet = out.sets.find((s) => s.exerciseId === byName['Plank']!.id)!;
    expect(plankSet).toMatchObject({ durationSec: 60 });
    expect(plankSet.reps).toBeUndefined();
  });

  it('fills muscles and pattern on new exercises from the name; unknown names stay empty', () => {
    const byName = Object.fromEntries(build().newExercises.map((e) => [e.name, e]));
    expect(byName['Pull Up']).toMatchObject({ pattern: 'verticalPull', primaryMuscles: ['lats'] });
    expect(byName['Plank']).toMatchObject({ pattern: 'core' }); // file-based pattern wins
    expect(byName['Weird Machine Thing (Machine)']!.primaryMuscles).toEqual([]);
  });

  it('honours a manual map to an existing exercise', () => {
    const out = build({ resolutions: { 'Weird Machine Thing (Machine)': { kind: 'map', exerciseId: 'kb' } } });
    expect(out.newExercises.map((e) => e.name)).not.toContain('Weird Machine Thing (Machine)');
    expect(out.sets.some((s) => s.exerciseId === 'kb')).toBe(true);
  });

  it('writes workout, notes, times, batch and raw rows', () => {
    const out = build();
    expect(out.workouts).toHaveLength(1);
    const w = out.workouts[0]!;
    expect(w).toMatchObject({ name: 'Push', notes: 'Good', importBatchId: out.batch.id, kind: 'strength' });
    expect(Date.parse(w.endedAt!) - Date.parse(w.startedAt)).toBe(3600_000);
    expect(out.workoutExercises.find((we) => we.exerciseId === 'bench')!.notes).toBe('tempo');
    expect(out.rawRows).toHaveLength(out.sets.length);
    expect(out.rawRows.every((r) => out.sets.some((s) => s.id === r.setId) && r.data['Exercise Name'])).toBe(true);
    expect(out.batch).toMatchObject({ source: 'strong', fileName: 'strong.csv', workoutCount: 1, duplicateCount: 0 });
    expect(out.batch.conventions.exerciseRules['Bicep Curl (Dumbbell)']).toEqual({ exerciseId: 'dbcurl', dumbbellConvention: 'pairTotal' });
    expect(out.batch.conventions.exerciseRules['Bench Press (Barbell)']).toEqual({ exerciseId: 'bench' });
    for (const s of out.sets) expect(Date.parse(s.completedAt!)).toBeLessThanOrEqual(Date.parse(w.endedAt!));
  });

  it('skips duplicate workouts and counts them', () => {
    const p = parse();
    const out = build({}, undefined, new Set([p.workouts[0]!.key]));
    expect(out.workouts).toHaveLength(0);
    expect(out.sets).toHaveLength(0);
    expect(out.newExercises).toHaveLength(0);
    expect(out.batch.duplicateCount).toBe(1);
    expect(out.skippedDuplicates).toHaveLength(1);
  });
});

describe('weightFromRawRow', () => {
  it('recomputes a set weight from the untouched row', () => {
    const p = parse();
    const row = p.r.rows.find((x) => x.exerciseName === 'Bicep Curl (Dumbbell)')!;
    expect(weightFromRawRow(row.raw, 'pairTotal', 'lb')).toMatchObject({ weight: 30, unit: 'lb', exerciseName: 'Bicep Curl (Dumbbell)' });
    expect(weightFromRawRow(row.raw, 'perImplement', 'lb')).toMatchObject({ weight: 60 });
    expect(weightFromRawRow(row.raw, 'perImplement', 'kg')!.unit).toBe('kg');
  });
});

describe('ambiguous library aliases', () => {
  it('ranks the plain Barbell form first and offers the rest', () => {
    const pl = lib({ id: 'pl', name: 'Bench Press - Powerlifting', equipment: 'barbell', loadModel: 'total', aliases: ['Bench Press (Barbell)'] });
    const medium = lib({ id: 'med', name: 'Barbell Bench Press - Medium Grip', equipment: 'barbell', loadModel: 'total', aliases: ['Bench Press (Barbell)'] });
    const src = { name: 'Bench Press (Barbell)', setCount: 1, workoutCount: 1, hasWeight: true, hasReps: true, hasTime: false, hasDistance: false };
    const [m] = matchExercises([src], [pl, medium]);
    expect(m!.exact?.id).toBe('med');
    expect(m!.ambiguous).toBe(true);
    expect(m!.suggestions.map((e) => e.id)).toEqual(['pl']);
  });
});
