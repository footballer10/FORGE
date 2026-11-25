import { describe, expect, it } from 'vitest';
import { buildCoachSummary, formatTargets, type CoachSummaryInput } from './coachSummary';

const base: CoachSummaryInput = {
  today: '2026-11-24', from: '2026-09-29', days: 56, unit: 'lb', formula: 'epley',
  profile: { age: 20, sex: 'male', heightCm: 180, goals: ['Strength'], sport: 'Rugby', position: 'Fullback', phase: 'preseason', constraints: [], plannedDaysPerWeek: 3,
    equipment: [{ name: 'Rec center', isDefault: true, items: ['barbell'], bar: '45 lb' }] },
  sessions: 16, conditioningSessions: 2, hardSets: 240, volume: 123456,
  muscleSetsPerWeek: [{ muscle: 'quadriceps', sets: 9.5 }], unassignedSets: 4, balance: [],
  lifts: [{ name: 'Back Squat', sets: 40, e1rmBefore: 300, e1rmNow: 315, topSet: '275 × 5', plateau: false }, { name: 'Bench Press', sets: 30, plateau: true }],
  prs: [{ name: 'Back Squat', date: '2026-11-10', kind: 'rep', reps: 5, value: 275, previous: 265 }],
  tests: [], bodyweight: { latest: 180.2, latestDate: '2026-11-23', trend: 179.8, change28: -1.2 },
};

describe('buildCoachSummary', () => {
  const text = buildCoachSummary(base);
  it('states window, units, formula and rules', () => {
    expect(text).toContain('2026-09-29 to 2026-11-24 (56 days, 8 weeks');
    expect(text).toContain('Weights in lb');
    expect(text).toContain('Warm-up sets are excluded');
    expect(text).toContain('epley');
  });
  it('shows per-week figures with inputs', () => {
    expect(text).toContain('Strength/mixed sessions: 16 (2 per week; plan was 3)');
    expect(text).toContain('quadriceps: 9.5');
    expect(text).toContain('4 sets are on exercises with no muscles');
  });
  it('lists lifts, PRs and body', () => {
    expect(text).toContain('Back Squat: 40 sets; e1RM 315 lb (best before window 300)');
    expect(text).toContain('PLATEAU');
    expect(text).toContain('5-rep best 275 lb (was 265)');
    expect(text).toContain('-1.2 lb over 28 days');
  });
  it('includes the fitness-test countdown and asks Claude to aim at it', () => {
    const t = buildCoachSummary({ ...base, tests: [
      { name: 'Pull-up max', latest: '8 reps', latestDate: '2026-11-20', best: '9 reps', goal: 'target 15 reps, 6 reps to gain, test 2026-12-20 (in 26 days)' },
      { name: '1.5 mile run', goal: 'target 10:00, no result yet' },
    ] });
    expect(t).toContain('- Pull-up max: latest 8 reps (2026-11-20); best 9 reps; goal: target 15 reps, 6 reps to gain, test 2026-12-20 (in 26 days)');
    expect(t).toContain('- 1.5 mile run: no results yet; goal: target 10:00, no result yet');
    expect(t).toContain('aim the plan at it');
    expect(buildCoachSummary(base)).not.toContain('aim the plan at it');
  });
  it('handles empty data and no program', () => {
    const t = buildCoachSummary({ ...base, lifts: [], prs: [], muscleSetsPerWeek: [], bodyweight: undefined });
    expect(t).toContain('no loaded lifts');
    expect(t).toContain('- none');
    expect(t).toContain('no weigh-ins');
    expect(t).toContain('no active program');
    expect(t).toContain('Constraints: none recorded');
  });
});

describe('formatTargets', () => {
  it('groups identical sets and shows ranges, load and RPE', () => {
    expect(formatTargets([{ type: 'working', reps: 5, weight: 225, unit: 'lb' }, { type: 'working', reps: 5, weight: 225, unit: 'lb' }, { type: 'amrap', reps: 5, weight: 225, unit: 'lb' }], 'lb'))
      .toBe('2×5 @ 225 lb, 1×AMRAP 5 @ 225 lb');
    expect(formatTargets([{ type: 'working', reps: 8, repsMax: 10, rpe: 8 }], 'lb')).toBe('1×8-10 RPE 8');
    expect(formatTargets([], 'lb')).toBe('no targets');
  });
});
