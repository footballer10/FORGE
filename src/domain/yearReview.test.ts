import { describe, expect, it } from 'vitest';
import { reviewYears, yearReview } from './yearReview';
import type { LiftSet } from './prs';

const set = (workoutId: string, date: string, load: number, reps: number): LiftSet => ({ setId: `${workoutId}-${load}-${reps}`, workoutId, date: `${date}T15:00:00`, load, reps });
const wo = (id: string, date: string, mins = 60) => ({ id, startedAt: `${date}T15:00:00`, endedAt: new Date(Date.parse(`${date}T15:00:00`) + mins * 60000).toISOString() });

describe('yearReview', () => {
  const workouts = [wo('a', '2025-12-20'), wo('b', '2026-01-05', 90), wo('c', '2026-01-07'), wo('d', '2026-01-12'), wo('e', '2026-01-14'), wo('f', '2026-02-02')];
  const squat = { exerciseId: 's', name: 'Squat', sets: [set('a', '2025-12-20', 200, 5), set('b', '2026-01-05', 205, 5), set('d', '2026-01-12', 225, 5), set('d', '2026-01-12', 225, 5)] };
  const bench = { exerciseId: 'b', name: 'Bench', sets: [set('c', '2026-01-07', 135, 8), set('f', '2026-02-02', 155, 8)] };
  const r = yearReview({ year: 2026, workouts, lifts: [squat, bench], weeklyTarget: 2 });

  it('totals the year only', () => {
    expect(r.workouts).toBe(5);
    expect(r.hours).toBe(5.5);
    expect(r.workingSets).toBe(5);
    expect(r.reps).toBe(31);
    expect(r.totalVolume).toBe(205 * 5 + 225 * 10 + 135 * 8 + 155 * 8);
  });

  it('finds most-trained, heaviest set, gains and PRs', () => {
    expect(r.mostTrained[0]).toEqual({ name: 'Squat', sets: 3 });
    expect(r.heaviestSet).toMatchObject({ name: 'Squat', load: 225, reps: 5 });
    // Squat compared with last year's best (200×5); bench is new this year, compared with its first session.
    expect(r.e1rmGains.map((g) => [g.name, g.since])).toEqual([['Squat', 'lastYear'], ['Bench', 'firstSession']]);
    expect(r.e1rmGains[0]!.from).toBe(233.3);
    // Squat: 205×5 and 225×5 are 5-rep PRs and e1RM PRs = 4; bench 155×8 = 2.
    expect(r.prCount).toBe(6);
  });

  it('counts the longest run of weeks meeting the target', () => {
    expect(r.longestStreakWeeks).toBe(2);
    expect(r.busiestWeek).toEqual({ weekOf: '2026-01-05', workouts: 2 });
  });

  it('lists years with workouts', () => {
    expect(reviewYears(workouts)).toEqual([2026, 2025]);
  });
});
