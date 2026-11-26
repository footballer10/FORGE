import type { BodyMetric, ISODate, NutritionEntry, NutritionTargets, SavedFood, WeightUnit } from '../../domain/types';
import { db } from '../schema';
import { createRepo } from './base';
import { profileRepo } from './profile';
import { undoRepo } from './undo';

const entries = createRepo(db.nutritionEntries);
const foods = createRepo(db.savedFoods);

/** A saved food, custom food or recipe as the screens build it (values per serving). */
export type SavedFoodInput = Omit<SavedFood, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

export type FoodInput = { name?: string; calories: number; proteinG?: number; carbsG?: number; fatG?: number; foodId?: string; grams?: number };

export interface NutritionData {
  entries: NutritionEntry[];
  foods: SavedFood[];
  targets: NutritionTargets;
  unit: WeightUnit;
  metrics: BodyMetric[];
}

/** Calorie and protein logging. Totals and estimates live in `domain/nutrition.ts`. */
export const nutritionRepo = {
  async load(): Promise<NutritionData> {
    const [e, f, p, metrics] = await Promise.all([
      entries.list(),
      foods.list(),
      profileRepo.get(),
      db.bodyMetrics.filter((m) => !m.deletedAt).toArray(),
    ]);
    return { entries: e, foods: f.sort((a, b) => a.name.localeCompare(b.name)), targets: p.nutritionTargets ?? {}, unit: p.weightUnit, metrics };
  },
  addEntry(date: ISODate, food: FoodInput): Promise<NutritionEntry> {
    const { name, ...rest } = food;
    return entries.create({ date, ...rest, ...(name?.trim() ? { name: name.trim() } : {}) });
  },
  removeEntry(id: string): Promise<void> {
    return undoRepo.run('Deleted food entry', { nutritionEntries: [id] }, () => entries.softDelete(id));
  },
  saveFood(food: FoodInput & { name: string }): Promise<SavedFood> {
    return foods.create({ ...food, name: food.name.trim() });
  },
  /** A custom food or a recipe (see `domain/recipes.ts`); values are per serving. */
  saveSavedFood(food: SavedFoodInput): Promise<SavedFood> {
    return foods.create({ ...food, name: food.name.trim() });
  },
  updateSavedFood(id: string, food: SavedFoodInput): Promise<SavedFood> {
    const { servingLabel, ingredients, servings, proteinG, carbsG, fatG, ...rest } = food;
    // `update` merges, so clear what the edit left out instead of keeping the old value.
    return foods.update(id, {
      ...rest,
      name: food.name.trim(),
      proteinG, carbsG, fatG, servingLabel, ingredients, servings,
    });
  },
  removeFood(id: string): Promise<void> {
    return undoRepo.run('Deleted saved food', { savedFoods: [id] }, () => foods.softDelete(id));
  },
  /** Typed targets; an empty object clears them. */
  async setTargets(targets: NutritionTargets): Promise<void> {
    await profileRepo.update({ nutritionTargets: targets });
  },
};
