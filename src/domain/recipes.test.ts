import { describe, expect, it } from 'vitest';
import { foodIdOf, savedFoodToFood, type Food } from './foods';
import { unitById, unitsFor } from './foodUnits';
import { customFoodProblem, ingredientFrom, recipePerServing, recipeProblem, recipeToSavedFood, recipeTotals } from './recipes';
import type { RecipeIngredient } from './types';

const rice: Food = { id: foodIdOf(1), name: 'Rice, white, cooked', kcal: 130, proteinG: 2.7, carbsG: 28.2, fatG: 0.3, portions: [{ label: '1 cup', grams: 158 }] };
const part = (name: string, calories: number, proteinG: number, carbsG: number, fatG: number): RecipeIngredient => ({ name, calories, proteinG, carbsG, fatG });

describe('ingredientFrom', () => {
  it('stores the amount eaten with its values', () => {
    const cup = unitById(unitsFor(rice), 'cup')!;
    expect(ingredientFrom(rice, cup, 0.5)).toEqual({
      name: 'Rice, white, cooked · ½ cup (79 g)',
      foodId: 'fdc:1',
      calories: 103,
      proteinG: 2.1,
      carbsG: 22.3,
      fatG: 0.2,
    });
  });
  it('takes one serving of a saved food', () => {
    const f = savedFoodToFood({ id: 's1', name: 'Salsa', calories: 20, proteinG: 1, createdAt: '', updatedAt: '' });
    expect(ingredientFrom(f, unitsFor(f)[0]!, 2)).toMatchObject({ name: 'Salsa · 2 servings', foodId: 'my:s1', calories: 40, proteinG: 2, carbsG: 0, fatG: 0 });
  });
});

describe('recipe maths', () => {
  const burrito = [part('Tortilla', 140, 4, 24, 3.5), part('Rice', 200, 4, 44, 0.4), part('Black beans', 120, 8, 22, 0.5), part('Steak', 190, 24, 0, 10), part('Salsa', 20, 1, 4, 0)];
  it('totals the parts', () => {
    expect(recipeTotals(burrito)).toEqual({ calories: 670, proteinG: 41, carbsG: 94, fatG: 14.4 });
    expect(recipeTotals([])).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
  it('divides by the servings (sums first, rounds after)', () => {
    expect(recipePerServing(burrito, 1)).toEqual({ calories: 670, proteinG: 41, carbsG: 94, fatG: 14.4 });
    expect(recipePerServing(burrito, 2)).toEqual({ calories: 335, proteinG: 20.5, carbsG: 47, fatG: 7.2 });
    expect(recipePerServing(burrito, 3).calories).toBe(223);
  });
  it('treats zero or negative servings as one', () => {
    expect(recipePerServing(burrito, 0).calories).toBe(670);
  });
});

describe('saving a recipe', () => {
  const parts = [part('Rice', 200, 4, 44, 0.4), part('Beans', 120, 8, 22, 0.5)];
  it('keeps the parts and servings and stores values per serving', () => {
    expect(recipeToSavedFood({ name: '  Rice and beans ', servings: 2, servingLabel: ' bowl ', ingredients: parts })).toEqual({
      name: 'Rice and beans',
      calories: 160,
      proteinG: 6,
      carbsG: 33,
      fatG: 0.5,
      ingredients: parts,
      servings: 2,
      servingLabel: 'bowl',
    });
  });
  it('leaves the serving label out when blank', () => {
    expect('servingLabel' in recipeToSavedFood({ name: 'x', servings: 1, servingLabel: ' ', ingredients: parts })).toBe(false);
  });
  it('says what is missing', () => {
    expect(recipeProblem({ name: ' ', servings: 1, ingredients: parts })).toBe('Name the recipe.');
    expect(recipeProblem({ name: 'x', servings: 1, ingredients: [] })).toBe('Add at least one part.');
    expect(recipeProblem({ name: 'x', servings: 0, ingredients: parts })).toBe('Say how many servings it makes.');
    expect(recipeProblem({ name: 'x', servings: 1, ingredients: parts })).toBeUndefined();
  });
});

describe('custom food check', () => {
  it('needs a name and calories (zero is fine)', () => {
    expect(customFoodProblem({ name: '', calories: 10 })).toBe('Name the food.');
    expect(customFoodProblem({ name: 'x' })).toBe('Enter the calories for one serving.');
    expect(customFoodProblem({ name: 'x', calories: 0 })).toBeUndefined();
  });
});
