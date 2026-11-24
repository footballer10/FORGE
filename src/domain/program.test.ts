import { describe, expect, it } from 'vitest';
import { buildTree, draftToRows, duplicateWeek, latestVersions, nextSession, treeToDraft, versionChain, weekLabel, type DraftWeek } from './program';
import type { PlannedSession, Program, ProgramWeek } from './types';

const t = '2026-01-01T00:00:00.000Z';
const prog = (id: string, o: Partial<Program> = {}): Program => ({ id, createdAt: t, updatedAt: t, name: 'P', version: 1, changeReason: 'x', status: 'active', author: 'user', ...o });
const wk = (id: string, weekNumber: number): ProgramWeek => ({ id, createdAt: t, updatedAt: t, programId: 'p1', weekNumber });
const ses = (id: string, weekId: string, dayNumber: number, o: Partial<PlannedSession> = {}): PlannedSession => ({
  id, createdAt: t, updatedAt: t, programId: 'p1', programWeekId: weekId, dayNumber, name: id, exercises: [], ...o,
});

describe('tree', () => {
  const tree = buildTree(prog('p1'), [wk('w2', 2), wk('w1', 1)], [ses('b', 'w1', 2), ses('a', 'w1', 1, { completedWorkoutId: 'x' }), ses('c', 'w2', 1)]);
  it('orders weeks and sessions', () => {
    expect(tree.weeks.map((w) => w.id)).toEqual(['w1', 'w2']);
    expect(tree.weeks[0]!.sessions.map((s) => s.id)).toEqual(['a', 'b']);
  });
  it('finds the next session that is not done or skipped', () => {
    expect(nextSession(tree)?.session.id).toBe('b');
    const skipped = buildTree(prog('p1'), [wk('w1', 1)], [ses('a', 'w1', 1, { skipped: true })]);
    expect(nextSession(skipped)).toBeUndefined();
  });
});

describe('draft', () => {
  let n = 0;
  const key = () => `k${++n}`;
  const weeks: DraftWeek[] = [
    { key: 'w', phase: 'strength', sessions: [{ key: 's1', name: 'Push', exercises: [{ exerciseId: 'e', order: 5, targets: [] }], completedWorkoutId: 'wo' }, { key: 's2', name: ' ', exercises: [] }] },
  ];
  it('duplicates a week after itself without completion markers', () => {
    const out = duplicateWeek(weeks, 0, key);
    expect(out).toHaveLength(2);
    expect(out[1]!.phase).toBe('strength');
    expect(out[1]!.sessions[0]).not.toHaveProperty('completedWorkoutId');
    expect(out[1]!.key).not.toBe(out[0]!.key);
    expect(weeks).toHaveLength(1);
  });
  it('numbers weeks and days from array order and keeps completion on save', () => {
    let i = 0;
    const rows = draftToRows(duplicateWeek(weeks, 0, key), { week: () => `W${++i}`, session: () => `S${++i}` }, 'newP');
    expect(rows.weeks.map((w) => [w.weekNumber, w.programId])).toEqual([[1, 'newP'], [2, 'newP']]);
    expect(rows.sessions.map((s) => s.dayNumber)).toEqual([1, 2, 1, 2]);
    expect(rows.sessions[1]!.name).toBe('Day 2');
    expect(rows.sessions[0]).toMatchObject({ completedWorkoutId: 'wo' });
    expect(rows.sessions[0]!.exercises[0]!.order).toBe(0);
    expect(rows.sessions[2]!.programWeekId).toBe(rows.weeks[1]!.id);
  });
  it('round trips through treeToDraft', () => {
    const tree = buildTree(prog('p1'), [wk('w1', 1)], [ses('a', 'w1', 1, { notes: 'hi' })]);
    expect(treeToDraft(tree)[0]!.sessions[0]).toMatchObject({ key: 'a', name: 'a', notes: 'hi' });
  });
});

describe('versions', () => {
  const v1 = prog('1', { status: 'archived' });
  const v2 = prog('2', { version: 2, previousVersionId: '1' });
  const other = prog('9');
  it('lists only the newest of each chain', () => {
    expect(latestVersions([v1, v2, other]).map((p) => p.id)).toEqual(['2', '9']);
  });
  it('walks the chain newest first and survives a loop', () => {
    expect(versionChain(v2, [v1, v2]).map((p) => p.version)).toEqual([2, 1]);
    const loop = prog('a', { previousVersionId: 'b' });
    expect(versionChain(loop, [loop, prog('b', { previousVersionId: 'a' })])).toHaveLength(2);
  });
  it('labels weeks', () => {
    expect(weekLabel({ weekNumber: 4, isDeload: true, phase: 'deload' })).toBe('Week 4 · deload');
    expect(weekLabel({ weekNumber: 1 })).toBe('Week 1');
  });
});
