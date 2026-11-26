import { useEffect, useMemo, useState } from 'react';
import { parseFoods, savedFoodToFood, type Food, type FoodsFile } from '../../domain/foods';
import type { SavedFood } from '../../domain/types';

/** The USDA list is a separate chunk; it loads once, when the Nutrition tab first opens. */
let usda: Promise<Food[]> | undefined;
const loadUsda = () => (usda ??= import('../../data/foods.json').then((m) => parseFoods(m.default as unknown as FoodsFile)));

/** Every food that can be searched: the user's own foods and recipes first, then the USDA list. */
export function useFoodCatalog(saved: readonly SavedFood[]): { foods: Food[]; mine: Food[]; loading: boolean; failed: boolean } {
  const [list, setList] = useState<Food[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loadUsda().then((l) => live && setList(l), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  const mine = useMemo(() => saved.map(savedFoodToFood).sort((a, b) => a.name.localeCompare(b.name)), [saved]);
  const foods = useMemo(() => (list ? [...mine, ...list] : mine), [mine, list]);
  return { foods, mine, loading: !list && !failed, failed };
}
