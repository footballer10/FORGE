import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../schema';
import { bodyRepo } from './index';

beforeEach(async () => {
  await db.bodyMetrics.clear();
});

describe('bodyRepo', () => {
  it('adds, lists newest first, edits and soft-deletes weigh-ins', async () => {
    const a = await bodyRepo.add('2026-02-01', 180, 'lb');
    await bodyRepo.add('2026-02-03', 181, 'lb');
    expect((await bodyRepo.weighIns()).map((m) => m.date)).toEqual(['2026-02-03', '2026-02-01']);
    await bodyRepo.edit(a.id, { value: 179.5 });
    expect((await db.bodyMetrics.get(a.id))!.value).toBe(179.5);
    await bodyRepo.remove(a.id);
    expect((await bodyRepo.weighIns()).map((m) => m.date)).toEqual(['2026-02-03']);
    await bodyRepo.restore(a.id);
    expect(await bodyRepo.weighIns()).toHaveLength(2);
  });
});
