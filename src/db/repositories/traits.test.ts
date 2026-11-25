import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, exerciseRepo } from './index';

const base = {
  aliases: [], equipment: 'barbell' as const, primaryMuscles: [], secondaryMuscles: [], pattern: 'other' as const,
  unilateral: false, defaultRestSec: 90, weightIncrement: 5, incrementUnit: 'lb' as const, loadModel: 'total' as const,
};

beforeEach(clearAllData);

describe('exercise trait suggestions', () => {
  it('lists only exercises with no primary muscle and fills them on apply', async () => {
    await exerciseRepo.create({ ...base, name: 'Barbell Bench Press', aliases: ['Bench Press'], primaryMuscles: ['chest'], pattern: 'horizontalPush', source: 'library' });
    const imp = await exerciseRepo.create({ ...base, name: 'Bench Press (Barbell)', source: 'import' });
    const odd = await exerciseRepo.create({ ...base, name: 'Mystery Move', source: 'import' });
    const list = await exerciseRepo.traitSuggestions();
    expect(list.map((x) => x.exercise.name)).toEqual(['Bench Press (Barbell)', 'Mystery Move']);
    expect(list[0]!.traits?.basis).toBe('library');
    expect(list[1]!.traits).toBeUndefined();

    const t = list[0]!.traits!;
    expect(await exerciseRepo.applyTraits([{ id: imp.id, ...t }])).toBe(1);
    expect((await exerciseRepo.get(imp.id))?.primaryMuscles).toEqual(['chest']);
    expect((await exerciseRepo.get(odd.id))?.primaryMuscles).toEqual([]);
    expect((await exerciseRepo.traitSuggestions()).map((x) => x.exercise.name)).toEqual(['Mystery Move']);
  });
});
