import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { formatDuration, toStrongCsv, type ExportableWorkout } from './strongExport';
import { groupStrongWorkouts, parseStrongCsv } from './strongParser';
import type { Exercise, SetEntry } from './types';

const T = '2026-01-01T00:00:00.000Z';
const ex = (id: string, name: string, equipment: Exercise['equipment'], loadModel: Exercise['loadModel']): Exercise => ({
  id, name, equipment, loadModel, createdAt: T, updatedAt: T, aliases: [], primaryMuscles: [], secondaryMuscles: [],
  pattern: 'other', unilateral: false, defaultRestSec: 90, weightIncrement: 5, incrementUnit: 'lb', source: 'custom',
});
const exercises = [ex('b', 'Bench Press (Barbell)', 'barbell', 'total'), ex('d', 'Curl (Dumbbell)', 'dumbbell', 'perImplement')];
const set = (o: Partial<SetEntry> & Pick<SetEntry, 'exerciseId' | 'order'>): SetEntry => ({
  id: `s${o.order}${o.exerciseId}`, createdAt: T, updatedAt: T, workoutExerciseId: 'we', workoutId: 'w', type: 'working', unit: 'lb', completedAt: T, ...o,
});
const start = new Date(2026, 2, 5, 18, 30, 0).toISOString();
const data: ExportableWorkout[] = [
  {
    workout: { id: 'w', createdAt: T, updatedAt: T, name: 'Push', kind: 'strength', startedAt: start, endedAt: new Date(2026, 2, 5, 19, 35, 0).toISOString(), notes: 'good' },
    exercises: [
      { exerciseId: 'b', notes: 'tempo', sets: [set({ exerciseId: 'b', order: 0, type: 'warmup', weight: 95, reps: 8 }), set({ exerciseId: 'b', order: 1, weight: 185, reps: 5, rpe: 8 }), set({ exerciseId: 'b', order: 2, weight: 135, reps: 5, completedAt: undefined })] },
      { exerciseId: 'd', sets: [set({ exerciseId: 'd', order: 0, weight: 30, unit: 'lb', reps: 10 }), set({ exerciseId: 'd', order: 1, weight: 10, unit: 'kg', reps: 10 })] },
    ],
  },
];

describe('toStrongCsv', () => {
  it('writes Strong columns, W/number set order, skips unticked sets, doubles dumbbells', () => {
    const rows = parseCsv(toStrongCsv(data, exercises, 'lb'));
    expect(rows[0]).toEqual(['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE']);
    expect(rows).toHaveLength(5);
    expect(rows[1]!.slice(0, 7)).toEqual(['2026-03-05 18:30:00', 'Push', '1h 5m', 'Bench Press (Barbell)', 'W', '95', '8']);
    expect(rows[2]!.slice(4, 7)).toEqual(['1', '185', '5']);
    expect(rows[2]![9]).toBe('tempo');
    expect(rows[2]![11]).toBe('8');
    expect(rows[3]![5]).toBe('60');
    expect(rows[4]![5]).toBe('44.092');
  });

  it('converts to kg when asked', () => {
    const rows = parseCsv(toStrongCsv(data, exercises, 'kg'));
    expect(rows[2]![5]).toBe('83.915');
  });

  it('round-trips through the importer', () => {
    const parsed = parseStrongCsv(toStrongCsv(data, exercises, 'lb'));
    if ('error' in parsed) throw new Error(parsed.error);
    const [w] = groupStrongWorkouts(parsed.rows);
    expect(w).toMatchObject({ name: 'Push', startedAt: start, durationSec: 3900, notes: 'good' });
    expect(w!.exercises.map((e) => e.rows.length)).toEqual([2, 2]);
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(3900)).toBe('1h 5m');
    expect(formatDuration(7200)).toBe('2h');
    expect(formatDuration(2700)).toBe('45m');
  });
});
