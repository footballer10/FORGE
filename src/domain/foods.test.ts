import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  foodIdOf,
  parseFoods,
  queryVariants,
  recentFoodIds,
  savedFoodToFood,
  scaleFood,
  scalingFormula,
  searchFoods,
  type Food,
  type FoodsFile,
} from './foods';
import { defaultAmount, gramsPerMl, unitsFor } from './foodUnits';
import type { NutritionEntry, SavedFood } from './types';

const food = (id: number, name: string, over: Partial<Food> = {}): Food => ({
  id: foodIdOf(id),
  name,
  kcal: 100,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  portions: [],
  ...over,
});

const banana = food(1, 'Bananas, raw', { kcal: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3, portions: [{ label: '1 medium', grams: 118 }, { label: '1 cup, sliced', grams: 150 }] });
const oatmeal = food(2, 'Oatmeal, cooked with water');
const oats = food(3, 'Oats, raw');
const peanutButter = food(4, 'Peanut butter, smooth style, with salt');
const pbSimple = food(5, 'Peanut butter');
const entry = (foodId: string | undefined, createdAt: string, extra: Partial<NutritionEntry> = {}): NutritionEntry => ({
  id: createdAt + (foodId ?? ''),
  date: '2026-01-01',
  calories: 100,
  createdAt,
  updatedAt: createdAt,
  ...(foodId ? { foodId } : {}),
  ...extra,
});

describe('scaleFood', () => {
  it('scales per-100 g values by grams ÷ 100', () => {
    expect(scaleFood(banana, 118)).toEqual({ calories: 105, proteinG: 1.3, carbsG: 26.9, fatG: 0.4 });
    expect(scaleFood(banana, 100)).toEqual({ calories: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3 });
    expect(scaleFood(banana, 0)).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });
  it('treats a negative amount as zero', () => {
    expect(scaleFood(banana, -5).calories).toBe(0);
  });
});

describe('searchFoods', () => {
  const all = [oatmeal, oats, banana, peanutButter, pbSimple];
  it('needs every typed word to start a word of the name', () => {
    expect(searchFoods(all, 'peanut butter').map((f) => f.name)).toEqual(['Peanut butter', 'Peanut butter, smooth style, with salt']);
    expect(searchFoods(all, 'oat').map((f) => f.name).sort()).toEqual(['Oatmeal, cooked with water', 'Oats, raw']);
    expect(searchFoods(all, 'ana')).toEqual([]);
  });
  it('is case and punctuation insensitive', () => {
    expect(searchFoods(all, '  BANANAS,').map((f) => f.id)).toEqual([banana.id]);
  });
  it('puts plainer names (fewer commas) first and recent foods before that', () => {
    expect(searchFoods(all, 'oat')[0]?.name).toBe('Oats, raw');
    expect(searchFoods(all, 'oat', [oatmeal.id])[0]?.name).toBe('Oatmeal, cooked with water');
  });
  it('lists only recent foods for an empty query, in the given order, skipping unknown ids', () => {
    expect(searchFoods(all, '', [banana.id, 'fdc:999', oats.id]).map((f) => f.id)).toEqual([banana.id, oats.id]);
    expect(searchFoods(all, '')).toEqual([]);
  });
  it('honours the limit', () => {
    expect(searchFoods(all, 'o', [], 2)).toHaveLength(2);
  });
});

describe('recentFoodIds', () => {
  it('returns each food once, newest first, ignoring typed and deleted entries', () => {
    const list = [
      entry('fdc:1', '2026-01-01T08:00:00Z'),
      entry('fdc:2', '2026-01-01T09:00:00Z'),
      entry('fdc:1', '2026-01-01T10:00:00Z'),
      entry(undefined, '2026-01-01T11:00:00Z'),
      entry('fdc:3', '2026-01-01T12:00:00Z', { deletedAt: '2026-01-02T00:00:00Z' }),
    ];
    expect(recentFoodIds(list)).toEqual(['fdc:1', 'fdc:2']);
    expect(recentFoodIds(list, 1)).toEqual(['fdc:1']);
  });
});

describe('own foods in the search', () => {
  const saved = (name: string, over: Partial<SavedFood> = {}): SavedFood => ({ id: name, name, calories: 500, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...over });
  it('turns a saved food into a per-serving food with a tag', () => {
    const f = savedFoodToFood(saved('Veggie burrito', { proteinG: 20, servingLabel: 'burrito', ingredients: [{ name: 'x', calories: 500, proteinG: 20, carbsG: 0, fatG: 0 }], servings: 1 }));
    expect(f).toMatchObject({ id: 'my:Veggie burrito', basis: 1, tag: 'Recipe', kcal: 500, proteinG: 20, servingLabel: 'burrito', mine: true });
    expect(savedFoodToFood(saved('Granola')).tag).toBe('My food');
    expect(scaleFood(f, 1.5).calories).toBe(750);
    expect(scalingFormula(f)).toMatch(/per serving/);
  });
  it('lists the user\'s own foods before list foods with the same words', () => {
    const mine = savedFoodToFood(saved('Chicken burrito'));
    const usda = food(70, 'Burrito, chicken');
    expect(searchFoods([usda, mine], 'burrito').map((f) => f.id)).toEqual([mine.id, usda.id]);
  });
});

describe('search words', () => {
  const all = [food(20, 'Egg, whole, raw'), food(21, 'Soft drink, cola'), food(22, 'French fries'), food(23, 'Beverages, carbonated, lemon-lime soda'), food(24, 'Tomatoes, red, raw')];
  it('matches a plural typed word to the singular name word', () => {
    expect(searchFoods(all, 'eggs').map((f) => f.name)).toEqual(['Egg, whole, raw']);
    expect(searchFoods(all, 'tomatoes').map((f) => f.name)).toEqual(['Tomatoes, red, raw']);
  });
  it('also tries the words USDA uses (soda, coke, fries)', () => {
    expect(queryVariants('diet coke')).toEqual([['diet', 'coke'], ['diet', 'cola']]);
    expect(searchFoods(all, 'coke').map((f) => f.name)).toEqual(['Soft drink, cola']);
    expect(searchFoods(all, 'soda').map((f) => f.name)).toEqual(['Soft drink, cola', 'Beverages, carbonated, lemon-lime soda']);
    expect(searchFoods(all, 'fries').map((f) => f.name)).toContain('French fries');
  });
});

describe('bundled USDA data', () => {
  const file = JSON.parse(readFileSync(new URL('../data/foods.json', import.meta.url), 'utf8')) as FoodsFile;
  const foods = parseFoods(file);
  it('has 5000 or more foods with unique ids and names', () => {
    expect(foods.length).toBeGreaterThanOrEqual(5000);
    expect(new Set(foods.map((f) => f.id)).size).toBe(foods.length);
    expect(new Set(foods.map((f) => f.name.toLowerCase())).size).toBe(foods.length);
  });
  it('names its source', () => {
    expect(file.source).toMatch(/USDA/);
  });
  it('has plausible per-100 g values', () => {
    for (const f of foods) {
      expect(f.kcal, f.name).toBeGreaterThanOrEqual(0);
      expect(f.kcal, f.name).toBeLessThanOrEqual(910);
      expect(f.proteinG + f.carbsG + f.fatG, f.name).toBeLessThanOrEqual(100.5);
      for (const p of f.portions) expect(p.grams, `${f.name} ${p.label}`).toBeGreaterThan(0);
    }
  });
  it('finds common foods and the basics to build a recipe from', () => {
    const basics = [
      'banana', 'egg', 'chicken breast', 'rice', 'oats', 'milk', 'salmon', 'peanut butter', 'broccoli', 'yogurt',
      'tortilla', 'flour tortilla', 'taco shell', 'black beans', 'pinto beans', 'refried beans', 'white rice cooked', 'brown rice', 'steak', 'ground beef',
      'cheddar', 'mozzarella', 'sour cream', 'salsa', 'guacamole', 'lettuce', 'tomato', 'onion', 'garlic', 'cilantro', 'lime', 'avocado',
      'olive oil', 'butter', 'flour', 'sugar', 'brown sugar', 'salt', 'honey', 'bread', 'bagel', 'pasta', 'spaghetti', 'noodles', 'tomato sauce', 'mayonnaise', 'ketchup', 'mustard', 'soy sauce', 'hot sauce',
      'burrito', 'burrito bowl', 'taco', 'quesadilla', 'pizza', 'hamburger', 'cheeseburger', 'french fries', 'chicken sandwich', 'chicken nuggets', 'hot dog', 'sub sandwich',
      'cola', 'diet cola', 'root beer', 'ginger ale', 'lemon-lime soda', 'orange soda', 'dr pepper', 'orange juice', 'apple juice', 'coffee', 'tea', 'beer', 'wine', 'whey protein', 'protein bar',
      'ice cream', 'cookie', 'cake', 'chocolate', 'potato chips', 'popcorn', 'almonds', 'walnuts', 'cashews', 'oatmeal', 'cereal', 'granola', 'pancakes', 'bacon', 'sausage', 'ham', 'turkey', 'tuna', 'shrimp', 'tofu',
      'apple', 'orange', 'grapes', 'strawberries', 'blueberries', 'pineapple', 'mango', 'watermelon', 'carrots', 'spinach', 'cucumber', 'bell pepper', 'jalapeno', 'mushrooms', 'corn', 'sweet potato', 'potato', 'cinnamon', 'cumin', 'chili powder',
    ];
    const missing = basics.filter((q) => searchFoods(foods, q).length === 0);
    expect(missing).toEqual([]);
  });
  it('lets a drink be measured in ml and cups, and a tortilla in pieces', () => {
    const milk = searchFoods(foods, 'milk whole')[0];
    expect(milk && gramsPerMl(milk)).toBeGreaterThan(0.95);
    expect(milk && unitsFor(milk).map((u) => u.id)).toEqual(expect.arrayContaining(['ml', 'cup', 'floz', 'tbsp', 'tsp', 'g', 'oz']));
    const tortilla = foods.find((f) => f.name === 'Tortilla, flour');
    expect(tortilla && unitsFor(tortilla).some((u) => u.kind === 'portion')).toBe(true);
    expect(tortilla && defaultAmount(tortilla).unitId).toMatch(/^p\d+$/);
  });
});
