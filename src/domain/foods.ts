/**
 * Food list maths (pure): parse the bundled USDA data, search it, and scale per-100 g values to an amount.
 * Data: USDA FoodData Central (Foundation Foods and SR Legacy), public domain; see scripts/build-foods.mjs.
 */
import type { NutritionEntry } from './types';

export interface FoodPortion {
  label: string;
  grams: number;
}

/** A food with its values per 100 g. */
export interface Food {
  /** Stored on a logged entry as `foodId`. */
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portions: FoodPortion[];
}

export interface FoodsFile {
  source: string;
  foods: [number, string, number, number, number, number, [string, number][]][];
}

export const foodIdOf = (fdcId: number | string): string => `fdc:${fdcId}`;

export function parseFoods(file: FoodsFile): Food[] {
  return file.foods.map(([id, name, kcal, proteinG, carbsG, fatG, portions]) => ({
    id: foodIdOf(id),
    name,
    kcal,
    proteinG,
    carbsG,
    fatG,
    portions: portions.map(([label, grams]) => ({ label, grams })),
  }));
}

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

/** Scale a food's per-100 g values to `grams`: value × grams ÷ 100. Calories whole, macros to 0.1 g. */
export function scaleFood(food: Food, grams: number): Macros {
  const g = Math.max(0, grams);
  return {
    calories: Math.round((food.kcal * g) / 100),
    proteinG: round((food.proteinG * g) / 100, 1),
    carbsG: round((food.carbsG * g) / 100, 1),
    fatG: round((food.fatG * g) / 100, 1),
  };
}

export const SCALING_FORMULA = 'amount = value per 100 g × grams ÷ 100';

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const commas = (s: string) => (s.match(/,/g) ?? []).length;

/**
 * Foods whose name contains every typed word (each as the start of a word). Ranking: recently logged first (in the
 * order given), then names that start with the first typed word, then fewer commas (plainer names), then shorter.
 * An empty query lists the recent foods only.
 */
export function searchFoods(foods: readonly Food[], query: string, recentIds: readonly string[] = [], limit = 40): Food[] {
  const q = words(query);
  const recentRank = new Map(recentIds.map((id, i) => [id, i]));
  if (q.length === 0) {
    return recentIds.map((id) => foods.find((f) => f.id === id)).filter((f): f is Food => !!f).slice(0, limit);
  }
  const hits = foods.filter((f) => {
    const w = words(f.name);
    return q.every((t) => w.some((x) => x.startsWith(t)));
  });
  const first = q[0] ?? '';
  const key = (f: Food): [number, number, number, number] => [
    recentRank.get(f.id) ?? Infinity,
    words(f.name)[0]?.startsWith(first) ? 0 : 1,
    commas(f.name),
    f.name.length,
  ];
  return hits
    .sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      for (let i = 0; i < ka.length; i++) {
        const x = ka[i] ?? 0;
        const y = kb[i] ?? 0;
        if (x !== y) return x < y ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

/** Food IDs from logged entries, newest first, each once. */
export function recentFoodIds(entries: readonly NutritionEntry[], limit = 20): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const sorted = entries.filter((e) => e.foodId && !e.deletedAt).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  for (const e of sorted) {
    if (!e.foodId || seen.has(e.foodId)) continue;
    seen.add(e.foodId);
    out.push(e.foodId);
    if (out.length >= limit) break;
  }
  return out;
}

export interface SliderSpec {
  min: number;
  max: number;
  step: number;
}

/** Slider range: 5 g steps; the top is at least 4 × the largest portion and 500 g. */
export function sliderSpec(food: Food): SliderSpec {
  const biggest = Math.max(0, ...food.portions.map((p) => p.grams));
  const max = Math.ceil(Math.max(500, biggest * 4) / 10) * 10;
  return { min: 5, max, step: 5 };
}

/** Snap to a household portion when within 3 g or 3% of it (whichever is larger); otherwise to the 5 g step. */
export function snapGrams(food: Food, grams: number): number {
  const { min, max, step } = sliderSpec(food);
  const g = Math.min(max, Math.max(min, grams));
  let best: FoodPortion | undefined;
  for (const p of food.portions) {
    const tol = Math.max(3, p.grams * 0.03);
    if (Math.abs(p.grams - g) <= tol && (!best || Math.abs(p.grams - g) < Math.abs(best.grams - g))) best = p;
  }
  if (best) return best.grams;
  return Math.min(max, Math.max(min, Math.round(g / step) * step));
}

/** The portion a gram amount equals (within rounding), for the "1 cup" label next to the grams. */
export function portionAt(food: Food, grams: number): FoodPortion | undefined {
  return food.portions.find((p) => Math.abs(p.grams - grams) < 0.05);
}

/** Starting amount: the first household portion, else 100 g. */
export function defaultGrams(food: Food): number {
  return food.portions[0]?.grams ?? 100;
}

/** Entry name as shown in the day list: "Bananas, raw · 118 g (1 medium)". */
export function entryLabel(food: Food, grams: number): string {
  const p = portionAt(food, grams);
  const amount = `${round(grams, 1)} g`;
  return `${food.name} · ${p ? `${amount} (${p.label})` : amount}`;
}
