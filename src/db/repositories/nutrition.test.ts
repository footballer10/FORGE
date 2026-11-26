import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearAllData, nutritionRepo, undoRepo } from './index';

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

describe('nutritionRepo custom foods and recipes', () => {
  const parts = [
    { name: 'Rice, white, cooked · 1 cup (158 g)', foodId: 'fdc:1', calories: 205, proteinG: 4.3, carbsG: 44.5, fatG: 0.4 },
    { name: 'Beans · 1 cup', foodId: 'fdc:2', calories: 227, proteinG: 15.2, carbsG: 40.8, fatG: 0.9 },
  ];
  it('saves a recipe with its parts and servings, and lists it with the saved foods', async () => {
    await nutritionRepo.saveSavedFood({ name: ' Rice and beans ', calories: 216, proteinG: 9.8, carbsG: 42.7, fatG: 0.7, ingredients: parts, servings: 2, servingLabel: 'bowl' });
    await nutritionRepo.saveSavedFood({ name: 'Tortilla, small', calories: 90, servingLabel: 'tortilla' });
    const { foods } = await nutritionRepo.load();
    expect(foods.map((f) => f.name)).toEqual(['Rice and beans', 'Tortilla, small']);
    expect(foods[0]).toMatchObject({ servings: 2, servingLabel: 'bowl', ingredients: parts });
    expect(foods[1]?.ingredients).toBeUndefined();
  });
  it('edits a recipe and clears what the edit left out', async () => {
    const saved = await nutritionRepo.saveSavedFood({ name: 'Bowl', calories: 216, proteinG: 9.8, ingredients: parts, servings: 2, servingLabel: 'bowl' });
    await nutritionRepo.updateSavedFood(saved.id, { name: 'Bowl', calories: 432, ingredients: parts, servings: 1 });
    const { foods } = await nutritionRepo.load();
    expect(foods[0]).toMatchObject({ calories: 432, servings: 1 });
    expect(foods[0]?.proteinG).toBeUndefined();
    expect(foods[0]?.servingLabel).toBeUndefined();
  });
  it('logs a serving of a saved food as an entry keyed my:<id>, and a deleted saved food can be undone', async () => {
    const saved = await nutritionRepo.saveSavedFood({ name: 'Bowl', calories: 216, servings: 2, ingredients: parts });
    await nutritionRepo.addEntry('2026-01-06', { name: 'Bowl · 1½ servings', calories: 324, foodId: `my:${saved.id}` });
    expect((await nutritionRepo.load()).entries[0]).toMatchObject({ foodId: `my:${saved.id}`, calories: 324 });
    await nutritionRepo.removeFood(saved.id);
    expect((await nutritionRepo.load()).foods).toHaveLength(0);
    await undoRepo.undoLatest();
    expect((await nutritionRepo.load()).foods).toHaveLength(1);
  });
});
