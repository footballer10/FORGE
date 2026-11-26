/**
 * Recipes and custom foods (pure). A recipe is a list of parts, each stored as the amount eaten with its values
 * (so changing the food list later never changes a saved recipe). Per serving = sum of the parts ÷ servings.
 */
import type { Food, Macros } from './foods';
import { scaleFood } from './foods';
import { baseAmount, entryLabel, type AmountUnit } from './foodUnits';
import type { RecipeIngredient, SavedFood } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** One part of a recipe: `qty` of `unit` of `food`, with the values of that amount. */
export function ingredientFrom(food: Food, unit: AmountUnit, qty: number): RecipeIngredient {
  const m = scaleFood(food, baseAmount(unit, qty));
  return { name: entryLabel(food, unit, qty), foodId: food.id, calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG };
}

/** The whole recipe: the sum of its parts (calories whole, macros to 0.1 g). */
export function recipeTotals(ingredients: readonly RecipeIngredient[]): Macros {
  const sum = ingredients.reduce(
    (t, i) => ({ calories: t.calories + i.calories, proteinG: t.proteinG + i.proteinG, carbsG: t.carbsG + i.carbsG, fatG: t.fatG + i.fatG }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return { calories: Math.round(sum.calories), proteinG: round1(sum.proteinG), carbsG: round1(sum.carbsG), fatG: round1(sum.fatG) };
}

/** One serving: the whole recipe ÷ servings (sums are added up unrounded, then divided). */
export function recipePerServing(ingredients: readonly RecipeIngredient[], servings: number): Macros {
  const n = servings > 0 ? servings : 1;
  const sum = ingredients.reduce(
    (t, i) => ({ calories: t.calories + i.calories, proteinG: t.proteinG + i.proteinG, carbsG: t.carbsG + i.carbsG, fatG: t.fatG + i.fatG }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
  return { calories: Math.round(sum.calories / n), proteinG: round1(sum.proteinG / n), carbsG: round1(sum.carbsG / n), fatG: round1(sum.fatG / n) };
}

export const RECIPE_FORMULA = 'Per serving = the sum of the parts ÷ servings.';

export interface RecipeDraft {
  name: string;
  servings: number;
  servingLabel?: string;
  ingredients: readonly RecipeIngredient[];
}

/** What is wrong with a recipe before it is saved, or undefined when it is fine. */
export function recipeProblem(d: RecipeDraft): string | undefined {
  if (!d.name.trim()) return 'Name the recipe.';
  if (d.ingredients.length === 0) return 'Add at least one part.';
  if (!(d.servings > 0)) return 'Say how many servings it makes.';
  return undefined;
}

/** A saved food for a recipe: values per serving, parts and servings kept so it can be edited. */
export function recipeToSavedFood(d: RecipeDraft): Pick<SavedFood, 'name' | 'calories' | 'proteinG' | 'carbsG' | 'fatG' | 'ingredients' | 'servings' | 'servingLabel'> {
  const m = recipePerServing(d.ingredients, d.servings);
  const label = d.servingLabel?.trim();
  return {
    name: d.name.trim(),
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
    ingredients: d.ingredients.map((i) => ({ ...i })),
    servings: d.servings,
    ...(label ? { servingLabel: label } : {}),
  };
}

/** A custom food typed once: values for one serving; blank macros stay unknown. */
export interface CustomFoodDraft {
  name: string;
  servingLabel?: string;
  calories: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
}

export function customFoodProblem(d: Partial<CustomFoodDraft>): string | undefined {
  if (!d.name?.trim()) return 'Name the food.';
  if (d.calories === undefined || !(d.calories >= 0)) return 'Enter the calories for one serving.';
  return undefined;
}
