import { useEffect, useMemo, useState } from 'react';
import { TrapFocus } from '../../components/TrapFocus';
import type { FoodInput } from '../../db/repositories';
import {
  SCALING_FORMULA,
  defaultGrams,
  entryLabel,
  parseFoods,
  portionAt,
  recentFoodIds,
  scaleFood,
  searchFoods,
  sliderSpec,
  snapGrams,
  type Food,
  type FoodsFile,
} from '../../domain/foods';
import type { NutritionEntry } from '../../domain/types';

const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
const grams1 = (n: number) => String(Math.round(n * 10) / 10);

/** Loaded once, on first open (the data file is a separate chunk). */
let cache: Promise<Food[]> | undefined;
const loadFoods = () => (cache ??= import('../../data/foods.json').then((m) => parseFoods(m.default as unknown as FoodsFile)));

function Macro({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="num text-3xl">{Math.round(value * 10) / 10}</div>
      <div className="text-xs text-muted">{label}{unit ? ` (${unit})` : ''}</div>
    </div>
  );
}

function Amount({ food, onBack, onAdd }: { food: Food; onBack: () => void; onAdd: (input: FoodInput) => void }) {
  const spec = sliderSpec(food);
  const [grams, setGrams] = useState(() => defaultGrams(food));
  const m = scaleFood(food, grams);
  const portion = portionAt(food, grams);
  const set = (g: number) => setGrams(snapGrams(food, g));
  return (
    <div>
      <button type="button" onClick={onBack} className="min-h-tap text-sm text-muted">← Search</button>
      <h2 className="pb-1 text-2xl leading-tight">{food.name}</h2>
      <p className="pb-3 text-xs text-muted">Per 100 g: {food.kcal} kcal · {food.proteinG} g protein · {food.carbsG} g carbs · {food.fatG} g fat</p>

      <section className="rounded-card border border-line bg-surface p-4" aria-label="Amount eaten" aria-live="polite">
        <div className="flex items-baseline justify-center gap-2 pb-3">
          <span className="num text-5xl">{grams1(grams)}</span>
          <span className="text-lg text-muted">g{portion ? ` · ${portion.label}` : ''}</span>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="5 grams less" onClick={() => set(grams - 5)} className="min-h-tap min-w-tap rounded-card border border-line text-2xl">−</button>
          <input
            type="range"
            aria-label="Amount in grams"
            className="h-11 min-w-0 flex-1 accent-accent"
            min={spec.min}
            max={spec.max}
            step={1}
            value={Math.min(spec.max, Math.max(spec.min, grams))}
            onChange={(e) => set(Number(e.target.value))}
          />
          <button type="button" aria-label="5 grams more" onClick={() => set(grams + 5)} className="min-h-tap min-w-tap rounded-card border border-line text-2xl">+</button>
        </div>
        {food.portions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Household portions">
            {food.portions.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={portion?.label === p.label}
                onClick={() => setGrams(p.grams)}
                className={`min-h-tap rounded-card border px-3 text-sm ${portion?.label === p.label ? 'border-accent text-accent-text' : 'border-line'}`}
              >
                {p.label}
                <span className="num block text-xs text-muted">{grams1(p.grams)} g</span>
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex border-t border-line pt-3">
          <Macro label="Calories" value={m.calories} unit="kcal" />
          <Macro label="Protein" value={m.proteinG} unit="g" />
          <Macro label="Carbs" value={m.carbsG} unit="g" />
          <Macro label="Fat" value={m.fatG} unit="g" />
        </div>
        <p className="pt-3 text-xs text-muted">{SCALING_FORMULA}. USDA FoodData Central.</p>
      </section>

      <button
        type="button"
        onClick={() => onAdd({ name: entryLabel(food, grams), calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, foodId: food.id, grams })}
        className="num mt-4 min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg"
      >
        Add · {m.calories} kcal
      </button>
    </div>
  );
}

/** Full-screen food list: search, pick, set the amount with a slider, add. Recent foods show first. */
export function FoodPicker({ entries, onAdd, onClose }: { entries: readonly NutritionEntry[]; onAdd: (input: FoodInput) => Promise<void> | void; onClose: () => void }) {
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);

  useEffect(() => {
    loadFoods().then(setFoods, () => setFailed(true));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const recent = useMemo(() => recentFoodIds(entries), [entries]);
  const results = useMemo(() => (foods ? searchFoods(foods, query, recent) : []), [foods, query, recent]);

  return (
    <div role="dialog" aria-modal="true" aria-label="Food list" className="fixed inset-0 z-50 overflow-y-auto bg-bg px-4 pb-safe pt-safe">
      <TrapFocus>
        <div className="mx-auto max-w-xl">
          <div className="flex items-center justify-between pt-3">
            <h1 className="text-3xl uppercase">Food list</h1>
            <button type="button" onClick={onClose} className="min-h-tap px-2 text-sm text-muted">Close</button>
          </div>
          {picked ? (
            <Amount
              food={picked}
              onBack={() => setPicked(null)}
              onAdd={async (food) => {
                await onAdd(food);
                onClose();
              }}
            />
          ) : (
            <div>
              <input
                type="search"
                className={`${field} mt-2 w-full`}
                placeholder="Search foods (banana, chicken breast, oats)"
                aria-label="Search foods"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {failed && <p role="alert" className="pt-3 text-sm text-accent-text">The food list could not load. Use the typed entry instead.</p>}
              {!foods && !failed && <p className="pt-3 text-sm text-muted">Loading the food list…</p>}
              {foods && query.trim() === '' && results.length === 0 && (
                <p className="pt-3 text-sm text-muted">Type to search {foods.length} foods. Foods you add show up here first.</p>
              )}
              {foods && query.trim() !== '' && results.length === 0 && <p className="pt-3 text-sm text-muted">No match. Try a shorter word, or use the typed entry.</p>}
              {results.length > 0 && (
                <>
                  {query.trim() === '' && <h2 className="pt-3 text-sm uppercase text-muted">Recent</h2>}
                  <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-surface" aria-label="Foods">
                    {results.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => setPicked(f)} className="flex min-h-tap w-full items-center justify-between gap-3 px-3 py-2 text-left">
                          <span className="min-w-0 text-sm">{f.name}</span>
                          <span className="num shrink-0 text-xs text-muted">{f.kcal} kcal/100 g</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="py-4 text-xs text-muted">Values per 100 g from USDA FoodData Central (Foundation Foods and SR Legacy), public domain.</p>
            </div>
          )}
        </div>
      </TrapFocus>
    </div>
  );
}
