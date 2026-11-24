import { describe, expect, it } from 'vitest';
import { carryOverHistory, diffDrafts, extractJson, proposalToDraft, validateProposal } from './programProposal';

const good = {
  schemaVersion: 1, name: 'Preseason', reason: 'More posterior chain', daysPerWeek: 3,
  weeks: [{ phase: 'preseason', sessions: [{ name: 'Lower', exercises: [
    { exercise: 'Back Squat', restSec: 180, sets: [{ type: 'warmup', reps: 5, weight: 135 }, { count: 3, reps: 5, weight: 225, unit: 'lb' }] },
    { exercise: 'Pull-up', superset: 'A', sets: [{ count: 2, reps: 6, repsMax: 8 }], progression: { kind: 'doubleProgression', repsMin: 6, repsMax: 8 } },
  ] }] }],
};
const ids: Record<string, string> = { 'back squat': 'sq', 'pull-up': 'pu' };
const lookup = (n: string) => ids[n.toLowerCase()];
let k = 0;
const key = () => `k${k++}`;

describe('extractJson', () => {
  it('reads fenced blocks and surrounding chatter', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nEnjoy').value).toEqual({ a: 1 });
    expect(extractJson('{"a":1}').value).toEqual({ a: 1 });
  });
  it('reports empty, missing and broken JSON', () => {
    expect(extractJson('  ').error).toMatch(/Nothing/);
    expect(extractJson('hello').error).toMatch(/No JSON/);
    expect(extractJson('{"a":').error).toMatch(/No JSON|Not valid/);
    expect(extractJson('{"a": 1,}').error).toMatch(/Not valid JSON/);
  });
});

describe('validateProposal', () => {
  it('accepts a good proposal', () => {
    const r = validateProposal(good);
    expect(r.errors).toEqual([]);
    expect(r.proposal!.weeks[0]!.sessions[0]!.exercises).toHaveLength(2);
  });
  it('lists every problem with its path', () => {
    const bad = { schemaVersion: 2, name: '', weeks: [{ phase: 'summer', sessions: [{ name: 'A', exercises: [{ exercise: 'X', sets: [{ reps: 5, repsMax: 3, weight: 100, percentE1rm: 0.8, foo: 1 }, {}] }] }] }] };
    const errors = validateProposal(bad).errors.join('\n');
    expect(errors).toContain('schemaVersion: must be 1');
    expect(errors).toContain('$.name: must be non-empty text');
    expect(errors).toContain('$.reason: required');
    expect(errors).toContain('weeks[0].phase: must be one of');
    expect(errors).toContain('sets[0].repsMax: needs reps and must be at least reps');
    expect(errors).toContain('give weight or percentE1rm, not both');
    expect(errors).toContain('sets[0].foo: unknown field');
    expect(errors).toContain('sets[1]: needs reps, durationSec or distanceM');
  });
  it('rejects bad progression and non-objects', () => {
    expect(validateProposal([]).errors[0]).toMatch(/object/);
    const p = structuredClone(good) as any;
    p.weeks[0].sessions[0].exercises[0].progression = { kind: 'magic' };
    expect(validateProposal(p).errors.join()).toContain('progression.kind');
  });
});

describe('proposalToDraft', () => {
  it('expands counts, applies unit default and supersets', () => {
    const { draft, missing } = proposalToDraft(validateProposal(good).proposal!, lookup, 'kg', key);
    expect(missing).toEqual([]);
    const ex = draft[0]!.sessions[0]!.exercises;
    expect(ex[0]!.targets.map((t) => t.type)).toEqual(['warmup', 'working', 'working', 'working']);
    expect(ex[0]!.targets[0]!.unit).toBe('kg');
    expect(ex[0]!.targets[1]!.unit).toBe('lb');
    expect(ex[0]!.restSec).toBe(180);
    expect(ex[1]!.supersetGroup).toBe('A');
    expect(ex[1]!.targets).toHaveLength(2);
    expect(draft[0]!.phase).toBe('preseason');
  });
  it('reports names it cannot match', () => {
    const { missing } = proposalToDraft(validateProposal(good).proposal!, (n) => (n === 'Back Squat' ? 'sq' : undefined), 'lb', key);
    expect(missing).toEqual(['Pull-up']);
  });
});

describe('diffDrafts and carryOverHistory', () => {
  const names = new Map([['sq', 'Back Squat'], ['pu', 'Pull-up'], ['bp', 'Bench']]);
  const make = (reps: number, extra = false) => proposalToDraft(validateProposal({
    ...good, weeks: [{ sessions: [{ name: 'Lower', exercises: [{ exercise: 'Back Squat', sets: [{ count: 3, reps, weight: 225 }] }, ...(extra ? [{ exercise: 'Pull-up', sets: [{ reps: 5 }] }] : [])] }] }],
  }).proposal!, lookup, 'lb', key).draft;
  it('reports changed, added and removed', () => {
    const lines = diffDrafts(make(5, true), make(3), names, 'lb');
    expect(lines.find((l) => l.kind === 'changed')!.text).toContain('3×5 @ 225 lb → 3×3 @ 225 lb');
    expect(lines.find((l) => l.kind === 'removed')!.text).toContain('Pull-up');
    expect(diffDrafts(make(5), make(5, true), names, 'lb')[0]!.kind).toBe('added');
  });
  it('is empty when identical, and flags whole added/removed weeks', () => {
    expect(diffDrafts(make(5), make(5), names, 'lb')).toEqual([]);
    expect(diffDrafts([], make(5), names, 'lb')[0]!.text).toContain('new week');
    expect(diffDrafts(make(5), [], names, 'lb')[0]!.kind).toBe('removed');
  });
  it('carries completed history to the same session in the same place', () => {
    const old = make(5);
    old[0]!.sessions[0]!.completedWorkoutId = 'w1';
    expect(carryOverHistory(make(3), old)[0]!.sessions[0]!.completedWorkoutId).toBe('w1');
    const renamed = make(3);
    renamed[0]!.sessions[0]!.name = 'Other';
    expect(carryOverHistory(renamed, old)[0]!.sessions[0]!.completedWorkoutId).toBeUndefined();
  });
});
