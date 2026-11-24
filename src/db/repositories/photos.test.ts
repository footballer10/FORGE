import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { backupRepo, clearAllData, photoRepo } from './index';

beforeEach(async () => {
  await clearAllData();
});

describe('photoRepo', () => {
  it('stores a blob, lists newest first, edits and permanently removes', async () => {
    const a = await photoRepo.add(new Blob(['aaa'], { type: 'image/jpeg' }), '2026-02-01', 'front');
    await photoRepo.add(new Blob(['bbb'], { type: 'image/jpeg' }), '2026-03-01');
    const list = await photoRepo.list();
    expect(list.map((p) => p.date)).toEqual(['2026-03-01', '2026-02-01']);
    expect(list[1]!.blob.size).toBe(3);
    await photoRepo.edit(a.id, { pose: 'side' });
    expect((await photoRepo.list())[1]!.pose).toBe('side');
    await photoRepo.remove(a.id);
    expect(await photoRepo.list()).toHaveLength(1);
  });
  it('photos are not part of the JSON backup', async () => {
    await photoRepo.add(new Blob(['x']), '2026-02-01');
    const file = await backupRepo.exportAll();
    expect(JSON.stringify(file)).not.toContain('progressPhotos');
  });
});
