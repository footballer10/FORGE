/**
 * Food list maths (pure): parse the bundled USDA data, search it together with the user's own foods and recipes,
 * and scale a food's values to an amount. Units (grams, cups, pieces, ...) are in `foodUnits.ts`.
 * Data: USDA FoodData Central (Foundation Foods, SR Legacy and Survey/FNDDS), public domain; see scripts/build-foods.mjs.
 */
import type { NutritionEntry, SavedFood } from './types';

export interface FoodPortion {
  label: string;
  grams: number;
}

/** A food with its values per `basis`: 100 g for a list food, one serving for the user's own foods and recipes. */
export interface Food {
  /** Stored on a logged entry as `foodId`: `fdc:<id>` for the USDA list, `my:<id>` for the user's own foods. */
  id: string;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portions: FoodPortion[];
  /** Amount the values are for: 100 (grams, the default) or 1 (one serving). */
  basis?: number;
  /** Shown beside the name in the list: "Recipe", "My food" (later: a restaurant name). */
  tag?: string;
  /** What one serving is, for foods with `basis` 1. */
  servingLabel?: string;
  /** Sorted before USDA foods in a search. */
  mine?: boolean;
}

export const basisOf = (food: Food): number => food.basis ?? 100;

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

/** Scale a food's values to `amount` base units (grams, or servings): value × amount ÷ basis. Calories whole, macros to 0.1. */
export function scaleFood(food: Food, amount: number): Macros {
  const a = Math.max(0, amount) / basisOf(food);
  return {
    calories: Math.round(food.kcal * a),
    proteinG: round(food.proteinG * a, 1),
    carbsG: round(food.carbsG * a, 1),
    fatG: round(food.fatG * a, 1),
  };
}

/** The formula shown next to the numbers. */
export const scalingFormula = (food: Food): string =>
  basisOf(food) === 100 ? 'amount = value per 100 g × grams ÷ 100 (cups, pieces and ml are first turned into grams)' : 'amount = value per serving × servings';

/** A saved food or recipe as a searchable food: values per serving. */
export function savedFoodToFood(f: SavedFood): Food {
  return {
    id: `my:${f.id}`,
    name: f.name,
    kcal: f.calories,
    proteinG: f.proteinG ?? 0,
    carbsG: f.carbsG ?? 0,
    fatG: f.fatG ?? 0,
    portions: [],
    basis: 1,
    tag: f.ingredients?.length ? 'Recipe' : 'My food',
    ...(f.servingLabel ? { servingLabel: f.servingLabel } : {}),
    mine: true,
  };
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const commas = (s: string) => (s.match(/,/g) ?? []).length;

/** Words people type that USDA writes differently. Each typed word can also be searched as these phrases. */
export const SEARCH_ALIASES: Record<string, string[]> = {
  soda: ['soft drink', 'carbonated'],
  pop: ['soft drink', 'carbonated'],
  coke: ['cola'],
  pepsi: ['cola'],
  fries: ['french fries', 'french fried'],
  sub: ['submarine'],
  burger: ['hamburger', 'cheeseburger'],
  pb: ['peanut butter'],
  pbj: ['peanut butter jelly'],
  oj: ['orange juice'],
  bbq: ['barbecue'],
  ketchup: ['catsup'],
  yoghurt: ['yogurt'],
  mac: ['macaroni'],
  cilantro: ['coriander'],
  scallion: ['green onion'],
  zucchini: ['squash summer'],
  shake: ['milk shake'],
  tenders: ['chicken tender'],
};

/** A typed word matches a name word that starts with it, or with it minus a plural ("eggs" → egg, "fries" → fry). */
function wordMatches(nameWord: string, token: string): boolean {
  if (nameWord.startsWith(token)) return true;
  if (token.length > 3 && token.endsWith('ies') && nameWord.startsWith(`${token.slice(0, -3)}y`)) return true;
  if (token.length > 3 && token.endsWith('es') && nameWord.startsWith(token.slice(0, -2))) return true;
  return token.length > 2 && token.endsWith('s') && nameWord.startsWith(token.slice(0, -1));
}

/** The typed words, plus one variant per alias of a typed word. */
export function queryVariants(query: string): string[][] {
  const q = words(query);
  const out: string[][] = [q];
  q.forEach((t, i) => {
    for (const phrase of SEARCH_ALIASES[t] ?? []) out.push([...q.slice(0, i), ...words(phrase), ...q.slice(i + 1)]);
  });
  return out.slice(0, 8);
}

const MIXED = new Set(['and', 'with', 'on', 'in', 'from']);

const nameWords = new WeakMap<Food, string[]>();
const wordsOf = (f: Food): string[] => {
  let w = nameWords.get(f);
  if (!w) nameWords.set(f, (w = words(f.name)));
  return w;
};

/**
 * Foods whose name has, for every typed word, a word that starts with it (see `queryVariants` for aliases).
 * Ranking: recently logged first (in the order given), then the user's own foods and recipes, then names that start
 * with the first typed word, then fewer commas (plainer names), then shorter.
 * An empty query lists the recent foods only.
 */
export function searchFoods(foods: readonly Food[], query: string, recentIds: readonly string[] = [], limit = 50): Food[] {
  const variants = queryVariants(query).filter((v) => v.length > 0);
  const recentRank = new Map(recentIds.map((id, i) => [id, i]));
  if (variants.length === 0) {
    return recentIds.map((id) => foods.find((f) => f.id === id)).filter((f): f is Food => !!f).slice(0, limit);
  }
  const single = variants[0]?.length === 1;
  type Key = [number, number, number, number, number, number, number, number];
  const scored: { food: Food; key: Key }[] = [];
  for (const f of foods) {
    const w = wordsOf(f);
    let best: Key | undefined;
    for (const v of variants) {
      if (!v.every((t) => w.some((x) => wordMatches(x, t)))) continue;
      const lower = f.name.toLowerCase();
      const first = v[0] ?? '';
      const key: Key = [
        recentRank.get(f.id) ?? Infinity,
        f.mine ? 0 : 1,
        // every typed word is a whole word of the name ("cola", not "colada")
        v.every((t) => w.includes(t)) ? 0 : 1,
        // "Rice, white, cooked" before "Rice cake": the name opens with the single typed word, then a comma or ends
        single && (lower === first || lower.startsWith(`${first},`)) ? 0 : 1,
        w[0] && wordMatches(w[0], first) ? 0 : 1,
        // a mixed item ("Rum and cola", "Cheese sandwich, on wheat bread") after the plain food, unless it was asked for
        w.some((x) => MIXED.has(x) && !v.includes(x)) ? 1 : 0,
        commas(f.name),
        f.name.length,
      ];
      if (!best || compareKeys(key, best) < 0) best = key;
    }
    if (best) scored.push({ food: f, key: best });
  }
  return scored
    .sort((a, b) => compareKeys(a.key, b.key) || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((x) => x.food);
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
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
