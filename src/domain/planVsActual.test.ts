import { describe, expect, it } from 'vitest';
import { compareSession, repsStatus, weightStatus } from './planVsActual';

const done = (o: object) => ({ type: 'working' as const, unit: 'lb' as const, completedAt: 'x', ...o });

describe('statuses', () => {
  it('compares reps with the range', () => {
    const t = { type: 'working' as const, reps: 6, repsMax: 8 };
    expect(repsStatus(t, { reps: 5 })).toBe('below');
    expect(repsStatus(t, { reps: 6 })).toBe('hit');
    expect(repsStatus(t, { reps: 8 })).toBe('hit');
    expect(repsStatus(t, { reps: 9 })).toBe('above');
    expect(repsStatus(t, undefined)).toBe('missed');
  });
  it('compares weight across units', () => {
    const t = { type: 'working' as const, reps: 5, weight: 100, unit: 'lb' as const };
    expect(weightStatus(t, { weight: 45.36, unit: 'kg' })).toBe('match');
    expect(weightStatus(t, { weight: 95, unit: 'lb' })).toBe('lighter');
    expect(weightStatus(t, { weight: 105, unit: 'lb' })).toBe('heavier');
    expect(weightStatus({ type: 'working', reps: 5 }, { weight: 95, unit: 'lb' })).toBe('none');
  });
});

describe('compareSession', () => {
  const planned = [
    { exerciseId: 'bench', order: 0, targets: [{ type: 'warmup' as const, reps: 5 }, { type: 'working' as const, reps: 5, weight: 135, unit: 'lb' as const }, { type: 'working' as const, reps: 5, weight: 135, unit: 'lb' as const }] },
    { exerciseId: 'row', order: 1, targets: [{ type: 'working' as const, reps: 8 }] },
  ];
  it('matches sets by position, counts extras, unplanned exercises and adherence', () => {
    const r = compareSession(planned, [
      { exerciseId: 'bench', sets: [done({ type: 'warmup', reps: 5, weight: 95 }), done({ reps: 5, weight: 135 }), done({ reps: 3, weight: 145 }), done({ reps: 5, weight: 135 }), { type: 'working', unit: 'lb', reps: 9 }] },
      { exerciseId: 'curl', sets: [done({ reps: 10 })] },
    ]);
    const bench = r.exercises[0]!;
    expect(bench.sets.map((s) => s.repsStatus)).toEqual(['hit', 'hit', 'below']);
    expect(bench.sets[2]!.weightStatus).toBe('heavier');
    expect(bench.extra).toHaveLength(1); // third working set; the unticked one is ignored
    expect(r.exercises[1]).toMatchObject({ exerciseId: 'row', doneSets: 0 });
    expect(r.exercises[1]!.sets[0]!.repsStatus).toBe('missed');
    expect(r.exercises[2]).toMatchObject({ exerciseId: 'curl', unplanned: true });
    expect(r.plannedSets).toBe(4);
    expect(r.doneSets).toBe(3);
    expect(r.adherence).toBeCloseTo(0.75);
  });
  it('adherence is 0 for an empty plan', () => {
    expect(compareSession([], []).adherence).toBe(0);
  });
});
