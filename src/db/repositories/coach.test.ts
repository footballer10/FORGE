import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { bodyRepo, clearAllData, coachRepo, exerciseRepo, profileRepo, workoutRepo } from './index';

const ex = { name: 'Bench', aliases: [], equipment: 'barbell' as const, primaryMuscles: ['chest' as const], secondaryMuscles: ['triceps' as const], pattern: 'horizontalPush' as const, unilateral: false, defaultRestSec: 120, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'custom' as const };

async function session(exerciseId: string, day: string, weight: number) {
  const w = await workoutRepo.start({ startedAt: `${day}T10:00:00.000Z` });
  const we = await workoutRepo.addExercise(w.id, exerciseId);
  await workoutRepo.addSet(we.id, { weight, reps: 5, completedAt: `${day}T10:30:00.000Z` });
  await workoutRepo.addSet(we.id, { weight, reps: 5, completedAt: `${day}T10:40:00.000Z` });
  await workoutRepo.addSet(we.id, { type: 'warmup', weight: 45, reps: 10, completedAt: `${day}T10:20:00.000Z` });
  await workoutRepo.finish(w.id);
}

beforeEach(clearAllData);

describe('coachRepo.summaryText', () => {
  it('summarises the window, ignoring warm-ups and sessions outside it', async () => {
    const e = await exerciseRepo.create(ex);
    await session(e.id, '2026-09-01', 130); // before the window
    await session(e.id, '2026-11-03', 135);
    await session(e.id, '2026-11-17', 145);
    await bodyRepo.add('2026-11-20', 180, 'lb');
    await profileRepo.update({ constraints: ['Sore left shoulder'] });
    const input = await coachRepo.summaryInput(56, '2026-11-24');
    expect(input.sessions).toBe(2);
    expect(input.hardSets).toBe(4);
    expect(input.lifts).toHaveLength(1);
    expect(input.lifts[0]!.sets).toBe(4);
    expect(input.lifts[0]!.e1rmBefore).toBeDefined();
    expect(input.prs.some((p) => p.kind === 'rep' && p.value === 145 && p.previous === 135)).toBe(true);
    expect(input.muscleSetsPerWeek.find((m) => m.muscle === 'chest')!.sets).toBe(0.5); // 4 sets over 8 weeks
    const text = await coachRepo.summaryText(56, '2026-11-24');
    expect(text).toContain('Sore left shoulder');
    expect(text).toContain('Bench: 4 sets');
    expect(text).toContain('180 lb on 2026-11-20');
  });

  it('works with no data at all', async () => {
    const text = await coachRepo.summaryText(28, '2026-11-24');
    expect(text).toContain('Hard sets (completed, non-warm-up): 0');
    expect(text).toContain('no active program');
  });
});

import { db } from '../schema';
import { programRepo } from './index';

describe('coachRepo proposals', () => {
  const prop = (reps: number, exercise = 'Bench') => JSON.stringify({
    schemaVersion: 1, name: 'Block', reason: 'Because', weeks: [{ sessions: [{ name: 'Push', exercises: [{ exercise, sets: [{ count: 3, reps, weight: 135 }] }] }] }],
  });

  it('reports parse, validation and missing-exercise problems without saving', async () => {
    await exerciseRepo.create(ex);
    expect((await coachRepo.prepareProposal('nope')).errors[0]).toMatch(/No JSON/);
    expect((await coachRepo.prepareProposal('{"name":"x"}')).errors.length).toBeGreaterThan(0);
    const miss = await coachRepo.prepareProposal(prop(5, 'Mystery Lift'));
    expect(miss.missing).toEqual(['Mystery Lift']);
    expect(await db.programs.count()).toBe(0);
  });

  it('creates a program, then updates it as a new version, logging each decision', async () => {
    await exerciseRepo.create({ ...ex, aliases: ['Flat Bench'] });
    const first = await coachRepo.prepareProposal('```json\n' + prop(5, 'flat bench') + '\n```');
    expect(first.errors).toEqual([]);
    expect(first.missing).toEqual([]);
    expect(first.current).toBeUndefined();
    const created = await coachRepo.approveProposal(first, 'update', prop(5, 'flat bench'));
    expect(created.version).toBe(1);
    expect(created.author).toBe('claude');
    await programRepo.setStatus(created.id, 'active');

    const second = await coachRepo.prepareProposal(prop(3));
    expect(second.current?.id).toBe(created.id);
    expect(second.diff[0]!.text).toContain('3×5 @ 135 lb → 3×3 @ 135 lb');
    const v2 = await coachRepo.approveProposal(second, 'update', prop(3));
    expect(v2.version).toBe(2);
    expect(v2.previousVersionId).toBe(created.id);
    expect(v2.status).toBe('active');

    const third = await coachRepo.prepareProposal(prop(8));
    await coachRepo.rejectProposal(third, prop(8));
    const decisions = await db.aiDecisions.toArray();
    expect(decisions.map((d) => d.status).sort()).toEqual(['approved', 'approved', 'rejected']);
    expect(decisions.find((d) => d.programVersion === 2)!.payload).toContain('"reps":3');
    expect((await programRepo.listLatest()).length).toBe(1);
  });

  it('can save as a separate program instead of updating', async () => {
    await exerciseRepo.create(ex);
    const a = await coachRepo.approveProposal(await coachRepo.prepareProposal(prop(5)), 'new', prop(5));
    await programRepo.setStatus(a.id, 'active');
    const b = await coachRepo.approveProposal(await coachRepo.prepareProposal(prop(4)), 'new', prop(4));
    expect(b.version).toBe(1);
    expect(b.previousVersionId).toBeUndefined();
    expect(b.status).toBe('draft');
    expect((await programRepo.listLatest()).length).toBe(2);
  });
});
