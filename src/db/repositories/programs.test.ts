import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, exerciseRepo, plannedSessionRepo, programRepo, undoRepo, workoutRepo } from './index';
import type { DraftWeek } from '../../domain/program';

beforeEach(clearAllData);

const weeks = (exerciseId: string): DraftWeek[] => [
  { key: 'a', phase: 'strength', sessions: [{ key: 's', name: 'Push', exercises: [{ exerciseId, order: 0, restSec: 45, targets: [{ type: 'working', reps: 5, weight: 100, unit: 'lb' }] }] }] },
  { key: 'b', isDeload: true, sessions: [{ key: 't', name: 'Push light', exercises: [] }] },
];

describe('programRepo', () => {
  it('saves version 1, then a new version that archives the old one and keeps its rows', async () => {
    const v1 = await programRepo.saveVersion({ fields: { name: 'Base', daysPerWeek: 3 }, weeks: weeks('e'), reason: 'Created' });
    expect(v1).toMatchObject({ version: 1, status: 'draft', changeReason: 'Created' });
    await programRepo.setStatus(v1.id, 'active');

    const tree1 = (await programRepo.getTree(v1.id))!;
    const draft = tree1.weeks.map((w) => ({ key: w.id, sessions: w.sessions.map((s) => ({ key: s.id, name: s.name, exercises: s.exercises })) }));
    const v2 = await programRepo.saveVersion({ previousId: v1.id, fields: { name: 'Base' }, weeks: draft.slice(0, 1), reason: 'Dropped deload' });
    expect(v2).toMatchObject({ version: 2, previousVersionId: v1.id, status: 'active', changeReason: 'Dropped deload' });
    expect((await programRepo.get(v1.id))?.status).toBe('archived');
    expect((await programRepo.getTree(v1.id))?.weeks).toHaveLength(2); // old version untouched
    expect((await programRepo.getTree(v2.id))?.weeks).toHaveLength(1);

    expect((await programRepo.listLatest()).map((p) => p.id)).toEqual([v2.id]);
    expect((await programRepo.history(v2)).map((p) => p.version)).toEqual([2, 1]);
  });

  it('keeps one active program', async () => {
    const a = await programRepo.saveVersion({ fields: { name: 'A' }, weeks: [], reason: 'x' });
    const b = await programRepo.saveVersion({ fields: { name: 'B' }, weeks: [], reason: 'x' });
    await programRepo.setStatus(a.id, 'active');
    await programRepo.setStatus(b.id, 'active');
    expect((await programRepo.get(a.id))?.status).toBe('draft');
    expect((await programRepo.get(b.id))?.status).toBe('active');
  });

  it('deletes all versions with undo', async () => {
    const v1 = await programRepo.saveVersion({ fields: { name: 'A' }, weeks: [], reason: 'x' });
    const v2 = await programRepo.saveVersion({ previousId: v1.id, fields: { name: 'A' }, weeks: [], reason: 'y' });
    await programRepo.deleteUndoable(v2);
    expect(await programRepo.listLatest()).toHaveLength(0);
    expect(await undoRepo.undoLatest()).toBe('Deleted program');
    expect((await programRepo.listLatest()).map((p) => p.id)).toEqual([v2.id]);
  });

  it('starts a workout from a planned session, linked and with targets', async () => {
    const ex = await exerciseRepo.create({ name: 'Bench', aliases: [], equipment: 'barbell', primaryMuscles: [], secondaryMuscles: [], pattern: 'horizontalPush', unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb', loadModel: 'total', source: 'custom' });
    const p = await programRepo.saveVersion({ fields: { name: 'P' }, weeks: weeks(ex.id), reason: 'x' });
    const session = (await plannedSessionRepo.list()).find((s) => s.programId === p.id && s.name === 'Push')!;
    const w = await workoutRepo.startFromPlan({ name: session.name, exercises: session.exercises, plannedSessionId: session.id }, 'lb');
    expect(w.plannedSessionId).toBe(session.id);
    const full = await workoutRepo.getFull(w.id);
    expect(full?.exercises[0]).toMatchObject({ restSec: 45 });
    expect(full?.exercises[0]?.sets[0]).toMatchObject({ weight: 100, reps: 5 });
  });
});
