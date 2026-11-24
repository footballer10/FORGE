import { describe, expect, it } from 'vitest';
import { evaluateAchievements, liftKey, newAchievements, nextMilestone, type AchievementInput } from './achievements';

const day = (n: number) => `2026-01-${String(n).padStart(2, '0')}T10:00:00.000Z`;
const base = (over: Partial<AchievementInput> = {}): AchievementInput => ({ workouts: [], prs: [], lifts: [], unit: 'lb', ...over });

describe('achievements', () => {
  it('earns nothing with no data', () => {
    expect(evaluateAchievements(base())).toEqual([]);
  });

  it('dates workout milestones at the workout that crossed them', () => {
    const workouts = Array.from({ length: 12 }, (_, i) => ({ id: `w${i + 1}`, date: day(i + 1), hardSets: 5 }));
    const got = evaluateAchievements(base({ workouts })).filter((a) => a.key.startsWith('workouts-'));
    expect(got.map((a) => [a.key, a.workoutId])).toEqual([['workouts-1', 'w1'], ['workouts-10', 'w10']]);
  });

  it('is order independent and counts sets cumulatively', () => {
    const workouts = [
      { id: 'b', date: day(2), hardSets: 60 },
      { id: 'a', date: day(1), hardSets: 60 },
    ];
    const sets = evaluateAchievements(base({ workouts })).filter((a) => a.key === 'sets-100');
    expect(sets).toHaveLength(1);
    expect(sets[0]?.workoutId).toBe('b');
  });

  it('counts PRs', () => {
    const prs = Array.from({ length: 10 }, (_, i) => ({ date: day(i + 1), workoutId: `w${i}` }));
    const keys = evaluateAchievements(base({ prs })).map((a) => a.key);
    expect(keys).toEqual(['prs-1', 'prs-10']);
  });

  it('earns lift milestones from the first e1RM at or above the threshold', () => {
    const lifts = [{ exerciseId: 'bench', name: 'Bench Press', points: [
      { date: day(3), workoutId: 'w3', e1rm: 226 },
      { date: day(1), workoutId: 'w1', e1rm: 140 },
    ] }];
    const got = evaluateAchievements(base({ lifts }));
    expect(got.map((a) => [a.key, a.workoutId])).toEqual([
      [liftKey('bench', 135), 'w1'],
      [liftKey('bench', 225), 'w3'],
    ]);
    expect(got[1]?.value).toBe(226);
  });

  it('converts kg e1RMs to lb thresholds', () => {
    const lifts = [{ exerciseId: 'sq', name: 'Squat', points: [{ date: day(1), workoutId: 'w1', e1rm: 100 }] }];
    // 100 kg = 220.5 lb: 135 yes, 225 no
    const keys = evaluateAchievements(base({ lifts, unit: 'kg' })).map((a) => a.key);
    expect(keys).toEqual([liftKey('sq', 135)]);
  });

  it('reports only keys not stored yet', () => {
    const earned = evaluateAchievements(base({ workouts: [{ id: 'w1', date: day(1), hardSets: 1 }] }));
    expect(newAchievements(earned, new Set(['workouts-1']))).toEqual([]);
    expect(newAchievements(earned, new Set())).toHaveLength(1);
  });

  it('finds the next milestone', () => {
    expect(nextMilestone([1, 10, 25], 10)).toBe(25);
    expect(nextMilestone([1, 10], 10)).toBeUndefined();
  });

  it('earns streak achievements when a run reaches the milestone', () => {
    const weeks = Array.from({ length: 5 }, (_, i) => ({ weekStart: `2026-03-${String(2 + i * 7).padStart(2, '0')}`, days: 3, hit: true, hitAt: day(i + 1), workoutId: `w${i + 1}` }));
    const got = evaluateAchievements(base({ weeks })).filter((a) => a.key.startsWith('streak-'));
    expect(got.map((a) => [a.key, a.workoutId])).toEqual([['streak-4', 'w4']]);
    const broken = weeks.map((w, i) => (i === 2 ? { ...w, hit: false } : w));
    expect(evaluateAchievements(base({ weeks: broken })).some((a) => a.key.startsWith('streak-'))).toBe(false);
  });
});
