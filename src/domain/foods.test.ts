import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  defaultGrams,
  entryLabel,
  foodIdOf,
  parseFoods,
  portionAt,
  recentFoodIds,
  scaleFood,
  searchFoods,
  sliderSpec,
  snapGrams,
  type Food,
  type FoodsFile,
} from './foods';
import type { NutritionEntry } from './types';

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

describe('slider', () => {
  it('spans 5 g to at least 500 g, or 4 × the biggest portion', () => {
    expect(sliderSpec(oats)).toEqual({ min: 5, max: 500, step: 5 });
    const big = food(9, 'Watermelon', { portions: [{ label: '1 wedge', grams: 572 }] });
    expect(sliderSpec(big).max).toBe(2290);
  });
  it('snaps to a household portion when close, else to 5 g', () => {
    expect(snapGrams(banana, 116)).toBe(118);
    expect(snapGrams(banana, 121)).toBe(118);
    expect(snapGrams(banana, 130)).toBe(130);
    expect(snapGrams(banana, 132)).toBe(130);
    expect(snapGrams(banana, 148)).toBe(150);
  });
  it('clamps to the range', () => {
    expect(snapGrams(oats, 0)).toBe(5);
    expect(snapGrams(oats, 9999)).toBe(500);
  });
  it('starts at the first portion, else 100 g', () => {
    expect(defaultGrams(banana)).toBe(118);
    expect(defaultGrams(oats)).toBe(100);
  });
});

describe('labels', () => {
  it('names the portion when the amount matches one', () => {
    expect(portionAt(banana, 118)?.label).toBe('1 medium');
    expect(portionAt(banana, 120)).toBeUndefined();
    expect(entryLabel(banana, 118)).toBe('Bananas, raw · 118 g (1 medium)');
    expect(entryLabel(banana, 130)).toBe('Bananas, raw · 130 g');
  });
});

describe('bundled USDA data', () => {
  const file = JSON.parse(readFileSync(new URL('../data/foods.json', import.meta.url), 'utf8')) as FoodsFile;
  const foods = parseFoods(file);
  it('has 500 or more foods with unique ids and names', () => {
    expect(foods.length).toBeGreaterThanOrEqual(500);
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
  it('finds common foods', () => {
    for (const q of ['banana', 'egg', 'chicken breast', 'rice', 'oats', 'milk', 'salmon', 'peanut butter', 'broccoli', 'yogurt']) {
      expect(searchFoods(foods, q).length, q).toBeGreaterThan(0);
    }
  });
});
