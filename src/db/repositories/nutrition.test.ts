import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, nutritionRepo } from './index';

beforeEach(clearAllData);

describe('nutritionRepo food list entries', () => {
  it('keeps the food id and grams of an entry from the food list, and totals still work', async () => {
    await nutritionRepo.addEntry('2026-01-05', { name: 'Bananas, raw · 118 g (1 medium)', calories: 105, proteinG: 1.3, carbsG: 26.9, fatG: 0.4, foodId: 'fdc:173944', grams: 118 });
    await nutritionRepo.addEntry('2026-01-05', { calories: 300 });
    const { entries } = await nutritionRepo.load();
    const banana = entries.find((e) => e.foodId);
    expect(banana).toMatchObject({ foodId: 'fdc:173944', grams: 118, calories: 105, proteinG: 1.3 });
    expect(entries.find((e) => !e.foodId)?.grams).toBeUndefined();
  });
});
