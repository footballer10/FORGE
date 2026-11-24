import { describe, expect, it } from 'vitest';
import { searchExercises } from './exerciseSearch';
import type { Equipment, Muscle } from './types';

const ex = (id: string, name: string, equipment: Equipment, p: Muscle, aliases: string[] = [], s: Muscle[] = []) => ({
  id, name, equipment, aliases, primaryMuscles: [p], secondaryMuscles: s,
});
const all = [
  ex('1', 'Barbell Bench Press - Medium Grip', 'barbell', 'chest', ['Bench Press', 'Flat Bench'], ['triceps']),
  ex('2', 'Dumbbell Bench Press', 'dumbbell', 'chest', ['Bench Press (Dumbbell)']),
  ex('3', 'Barbell Curl', 'barbell', 'biceps'),
  ex('4', 'Close-Grip Bench Press', 'barbell', 'triceps', [], ['chest']),
  ex('5', 'Pullups', 'bodyweight', 'lats', ['Pull Up']),
];

describe('searchExercises', () => {
  it('matches names and aliases, all words required', () => {
    expect(searchExercises(all, { query: 'bench press' }).map((e) => e.id)).toEqual(['1', '4', '2']);
    expect(searchExercises(all, { query: 'flat' }).map((e) => e.id)).toEqual(['1']);
    expect(searchExercises(all, { query: 'pull up' }).map((e) => e.id)).toEqual(['5']);
    expect(searchExercises(all, { query: 'zzz' })).toEqual([]);
  });

  it('filters by muscle (primary or secondary) and equipment', () => {
    expect(searchExercises(all, { muscle: 'chest' }).map((e) => e.id).sort()).toEqual(['1', '2', '4']);
    expect(searchExercises(all, { equipment: 'barbell', muscle: 'chest' }).map((e) => e.id).sort()).toEqual(['1', '4']);
  });

  it('puts recent first with no query, alphabetical otherwise', () => {
    expect(searchExercises(all, { recentIds: ['5', '3'] }).map((e) => e.id)).toEqual(['5', '3', '1', '4', '2']);
  });

  it('recency breaks ties between equal matches', () => {
    expect(searchExercises(all, { query: 'bench', recentIds: ['4'] })[0]?.id).toBe('4');
  });

  it('skips archived', () => {
    expect(searchExercises([{ ...all[2]!, archived: true }], {})).toEqual([]);
  });
});
