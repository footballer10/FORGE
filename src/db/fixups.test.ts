import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, exerciseRepo } from './repositories';
import { LAT_NOTE, fixLatPulldownGrip } from './fixups';

const base = { aliases: ['Close-Grip Front Lat Pulldown (Cable)'], equipment: 'cable' as const, primaryMuscles: ['lats' as const], secondaryMuscles: [], pattern: 'verticalPull' as const, unilateral: false, defaultRestSec: 90, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const, source: 'library' as const };

beforeEach(clearAllData);

describe('fixLatPulldownGrip', () => {
  it('renames the close-grip pulldown once, keeps the old name as an alias and adds the grip note', async () => {
    const ex = await exerciseRepo.create({ ...base, name: 'Close-Grip Front Lat Pulldown' });
    expect(await fixLatPulldownGrip()).toBe(true);
    const after = await exerciseRepo.get(ex.id);
    expect(after).toMatchObject({ name: 'Lat Pulldown', stickyNote: LAT_NOTE, strongName: 'Lat Pulldown (Cable)' });
    expect(after!.aliases).toEqual(expect.arrayContaining(['Close-Grip Front Lat Pulldown', 'Lat Pulldown (Cable)', 'Close-Grip Front Lat Pulldown (Cable)']));
    expect((await exerciseRepo.findByName('close-grip front lat pulldown'))?.id).toBe(ex.id);
    expect(await fixLatPulldownGrip()).toBe(false); // only once
  });
  it('keeps an existing note and does nothing when a Lat Pulldown already exists', async () => {
    const a = await exerciseRepo.create({ ...base, name: 'Close-Grip Front Lat Pulldown', stickyNote: 'seat 4' });
    await exerciseRepo.create({ ...base, name: 'Lat Pulldown' });
    expect(await fixLatPulldownGrip()).toBe(false);
    expect((await exerciseRepo.get(a.id))?.name).toBe('Close-Grip Front Lat Pulldown');
  });
});
