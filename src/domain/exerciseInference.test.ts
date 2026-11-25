import { describe, expect, it } from 'vitest';
import { closestLibraryExercise, inferTraits } from './exerciseInference';
import type { Exercise } from './types';

const ex = (o: Partial<Exercise> & { name: string }): Exercise => ({
  id: o.name, createdAt: '', updatedAt: '', aliases: [], equipment: 'barbell', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'],
  pattern: 'horizontalPush', unilateral: false, defaultRestSec: 90, weightIncrement: 5, incrementUnit: 'lb', loadModel: 'total', source: 'library', ...o,
});

const lib = [
  ex({ name: 'Barbell Bench Press' }),
  ex({ name: 'Incline Dumbbell Press', primaryMuscles: ['chest', 'shoulders'], secondaryMuscles: ['triceps'], pattern: 'horizontalPush' }),
  ex({ name: 'Imported Thing', source: 'import', primaryMuscles: [] }),
];

describe('inferTraits', () => {
  it('copies the library exercise when names match apart from the equipment tag', () => {
    const t = inferTraits('Bench Press (Barbell)', lib)!;
    expect(t.basis).toBe('library');
    expect(t.primaryMuscles).toEqual(['chest']);
    expect(t.reason).toContain('Barbell Bench Press');
  });
  it('ignores imported and muscle-less library rows', () => {
    expect(closestLibraryExercise('Imported Thing', lib)).toBeUndefined();
  });
  it('uses name rules when no library name is close', () => {
    const t = inferTraits('Zottman Curl (Dumbbell)', [])!;
    expect(t).toMatchObject({ basis: 'name', pattern: 'isolation', primaryMuscles: ['biceps'] });
  });
  it('classifies the common lifts', () => {
    const cases: [string, string, string][] = [
      ['Squat (Barbell)', 'squat', 'quadriceps'],
      ['Romanian Deadlift (Barbell)', 'hinge', 'hamstrings'],
      ['Deadlift (Barbell)', 'hinge', 'hamstrings'],
      ['Overhead Press (Barbell)', 'verticalPush', 'shoulders'],
      ['Pull Up', 'verticalPull', 'lats'],
      ['Bent Over Row (Barbell)', 'horizontalPull', 'middle back'],
      ['Lat Pulldown (Cable)', 'verticalPull', 'lats'],
      ['Bulgarian Split Squat (Dumbbell)', 'lunge', 'quadriceps'],
      ['Triceps Pushdown (Cable)', 'isolation', 'triceps'],
      ['Hanging Leg Raise', 'core', 'abdominals'],
    ];
    for (const [name, pattern, muscle] of cases) {
      const t = inferTraits(name, [])!;
      expect([name, t.pattern]).toEqual([name, pattern]);
      expect(t.primaryMuscles[0]).toBe(muscle);
    }
  });
  it('flags unilateral names and returns undefined for unknown ones', () => {
    expect(inferTraits('Single Arm Row (Dumbbell)', [])!.unilateral).toBe(true);
    expect(inferTraits('Mystery Move', [])).toBeUndefined();
  });
});
