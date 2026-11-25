import { describe, expect, it } from 'vitest';
import data from '../data/free-exercise-db.json';
import { mapLibraryExercise, type LibraryRecord } from './exerciseMapper';

const rec = (over: Partial<LibraryRecord>): LibraryRecord => ({
  id: 'x', name: 'X', force: null, mechanic: 'compound', equipment: 'barbell', category: 'strength',
  primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], instructions: [], ...over,
});

describe('mapLibraryExercise', () => {
  it('maps a barbell compound', () => {
    const e = mapLibraryExercise(rec({ id: 'Barbell_Bench_Press_-_Medium_Grip', name: 'Barbell Bench Press - Medium Grip' }));
    expect(e).toMatchObject({
      equipment: 'barbell', loadModel: 'total', pattern: 'horizontalPush', defaultRestSec: 120,
      weightIncrement: 5, incrementUnit: 'lb', source: 'library', sourceRef: 'Barbell_Bench_Press_-_Medium_Grip',
      barWeight: { value: 45, unit: 'lb' },
    });
    expect(e.aliases).toEqual(expect.arrayContaining(['Barbell Bench Press', 'Bench Press', 'Bench Press (Barbell)']));
    expect(e.aliases).not.toContain(e.name);
  });

  it('dumbbells are perImplement', () => {
    const e = mapLibraryExercise(rec({ name: 'Dumbbell Bicep Curl', equipment: 'dumbbell', mechanic: 'isolation', primaryMuscles: ['biceps'] }));
    expect(e).toMatchObject({ loadModel: 'perImplement', pattern: 'isolation', defaultRestSec: 90 });
    expect(e.barWeight).toBeUndefined();
  });

  it('bodyweight pull-ups add load, push-ups are reps only, assisted is assisted', () => {
    expect(mapLibraryExercise(rec({ name: 'Pullups', equipment: 'body only', primaryMuscles: ['lats'] }))).toMatchObject({ loadModel: 'bodyweightPlusAdded', pattern: 'verticalPull' });
    expect(mapLibraryExercise(rec({ name: 'Pushups', equipment: 'body only' }))).toMatchObject({ loadModel: 'repsOnly', pattern: 'horizontalPush' });
    expect(mapLibraryExercise(rec({ name: 'Assisted Pull-Up', equipment: 'machine', primaryMuscles: ['lats'] })).loadModel).toBe('assisted');
  });

  it('stretches and cardio have no load', () => {
    const s = mapLibraryExercise(rec({ name: 'Hamstring Stretch', category: 'stretching', equipment: 'body only', mechanic: null }));
    expect(s).toMatchObject({ loadModel: 'timeDistance', pattern: 'other', defaultRestSec: 60 });
    expect(mapLibraryExercise(rec({ name: 'Jogging', category: 'cardio', equipment: 'machine' })).pattern).toBe('conditioning');
  });

  it('flags unilateral lifts and null equipment falls back to other', () => {
    expect(mapLibraryExercise(rec({ name: 'Single-Arm Dumbbell Row', equipment: 'dumbbell' })).unilateral).toBe(true);
    expect(mapLibraryExercise(rec({ name: 'Mystery', equipment: null })).equipment).toBe('other');
  });
});

describe('common lifts (regression table)', () => {
  const lift = (name: string, equipment: string | null, category = 'strength', primary = 'chest') =>
    mapLibraryExercise(rec({ name, equipment, category, primaryMuscles: [primary], mechanic: 'compound' }));
  it('classifies squats, hinges, overhead movements and dips', () => {
    expect(lift('Front Squat (Clean Grip)', 'barbell', 'strength', 'quadriceps').pattern).toBe('squat');
    expect(lift('Overhead Squat', 'barbell', 'olympic weightlifting', 'quadriceps').pattern).toBe('squat');
    expect(lift('Power Clean', 'barbell', 'olympic weightlifting', 'hamstrings').pattern).toBe('hinge');
    expect(lift('Snatch', 'barbell', 'olympic weightlifting', 'quadriceps')).toMatchObject({ pattern: 'hinge', loadModel: 'total' });
    expect(lift('Push Press', 'barbell', 'olympic weightlifting', 'shoulders').pattern).toBe('verticalPush');
    expect(lift('Overhead Cable Curl', 'cable', 'strength', 'biceps').pattern).toBe('isolation');
    expect(lift('Standing Overhead Barbell Triceps Extension', 'barbell', 'strength', 'triceps').pattern).toBe('isolation');
    expect(lift('Hanging Leg Raise', 'body only', 'strength', 'abdominals').pattern).toBe('core');
    expect(lift('Dips - Triceps Version', 'body only', 'strength', 'triceps').loadModel).toBe('bodyweightPlusAdded');
  });
  it('push-ups on a ball are reps only', () => {
    expect(lift('Push-Ups With Feet On An Exercise Ball', 'exercise ball').loadModel).toBe('repsOnly');
    expect(lift('Pushups', 'body only').loadModel).toBe('repsOnly');
  });
  it('olympic lifts are never conditioning', () => {
    for (const n of ['Clean', 'Hang Clean', 'Power Snatch', 'Clean and Jerk']) {
      expect(lift(n, 'barbell', 'olympic weightlifting', 'hamstrings').pattern).not.toBe('conditioning');
    }
  });
});

describe('vendored dataset', () => {
  it('maps every record without gaps', () => {
    const rows = data as LibraryRecord[];
    expect(rows.length).toBeGreaterThan(800);
    const refs = new Set(rows.map((r) => r.id));
    expect(refs.size).toBe(rows.length);
    for (const r of rows) {
      const e = mapLibraryExercise(r);
      expect(e.name).toBeTruthy();
      expect(e.primaryMuscles.length).toBeGreaterThan(0);
    }
  });
});
