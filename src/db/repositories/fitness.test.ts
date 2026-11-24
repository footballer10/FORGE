import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { fitnessRepo } from './index';

beforeEach(async () => {
  await db.fitnessTests.clear();
  await db.testResults.clear();
});

describe('fitnessRepo', () => {
  it('seeds the built-ins once and never resurrects a deleted one', async () => {
    expect((await fitnessRepo.load()).tests).toHaveLength(6);
    expect((await fitnessRepo.load()).tests).toHaveLength(6);
    await fitnessRepo.removeTest('builtin:pullups');
    const after = await fitnessRepo.load();
    expect(after.tests).toHaveLength(5);
    expect(after.tests[0]!.name).toBe('Push-up max');
  });
  it('adds custom tests and results, edits and trashes them', async () => {
    const t = await fitnessRepo.addCustom('  Sled push ', 'timeSec', 'lowerIsBetter');
    expect(t.name).toBe('Sled push');
    const a = await fitnessRepo.addResult(t.id, '2026-03-01', 22.5);
    await fitnessRepo.editResult(a.id, { value: 21 });
    expect((await fitnessRepo.load()).results[0]!.value).toBe(21);
    await fitnessRepo.removeResult(a.id);
    expect((await fitnessRepo.load()).results).toHaveLength(0);
  });
  it('removing a test trashes its results', async () => {
    const t = await fitnessRepo.addCustom('X', 'reps', 'higherIsBetter');
    await fitnessRepo.addResult(t.id, '2026-03-01', 5);
    await fitnessRepo.removeTest(t.id);
    const s = await fitnessRepo.load();
    expect(s.results).toHaveLength(0);
    expect(s.tests.some((x) => x.id === t.id)).toBe(false);
  });
});
