import { useState } from 'react';
import type { SavedFoodInput } from '../../db/repositories';
import { savedFoodToFood, type Food } from '../../domain/foods';
import { RECIPE_FORMULA, ingredientFrom, recipePerServing, recipeProblem, recipeToSavedFood, recipeTotals } from '../../domain/recipes';
import type { NutritionEntry, RecipeIngredient, SavedFood } from '../../domain/types';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AmountPanel } from './AmountPanel';
import { CustomFoodForm } from './CustomFoodForm';
import { FoodResults, SearchInput } from './FoodSearch';
import { fieldClass } from './Sheet';

type View = 'main' | 'search' | 'amount' | 'custom';

const fmt = (n: number) => Math.round(n).toLocaleString();
const num1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Build a meal from parts (tortilla + rice + beans + meat + salsa) and save it as one food. Each part is searched
 * like any food and given an amount; a part that does not exist can be added by hand. Per serving = the sum of the
 * parts ÷ the servings it makes.
 */
export function RecipeBuilder({
  foods,
  mine,
  entries,
  loading,
  failed,
  initial,
  onSave,
  onSaveFood,
  onClose,
}: {
  foods: readonly Food[];
  mine: readonly Food[];
  entries: readonly NutritionEntry[];
  loading: boolean;
  failed: boolean;
  initial?: SavedFood;
  onSave: (food: SavedFoodInput) => void | Promise<void>;
  /** Saves a custom part the user typed; resolves to the saved food. */
  onSaveFood: (food: SavedFoodInput) => Promise<SavedFood>;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>('main');
  const [name, setName] = useState(initial?.name ?? '');
  const [servingsText, setServingsText] = useState(String(initial?.servings ?? 1));
  const [label, setLabel] = useState(initial?.servingLabel ?? '');
  const [parts, setParts] = useState<RecipeIngredient[]>(initial?.ingredients ?? []);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Food | null>(null);
  const [customName, setCustomName] = useState('');
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);

  const servings = Number(servingsText.replace(',', '.'));
  const valid = Number.isFinite(servings) && servings > 0;
  const total = recipeTotals(parts);
  const per = recipePerServing(parts, valid ? servings : 1);
  const dirty = parts.length > 0 || name.trim() !== '';

  async function save() {
    const draft = { name, servings: valid ? servings : 0, servingLabel: label, ingredients: parts };
    const problem = recipeProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    await onSave(recipeToSavedFood(draft));
  }

  if (view === 'search')
    return (
      <div>
        <button type="button" onClick={() => setView('main')} className="min-h-tap text-sm text-muted">← Back to recipe</button>
        <h2 className="pb-2 text-3xl uppercase">Add a part</h2>
        <SearchInput query={query} onQuery={setQuery} autoFocus placeholder="Search: tortilla, black beans, steak, salsa" />
        <FoodResults
          foods={foods}
          mine={mine}
          entries={entries}
          query={query}
          loading={loading}
          failed={failed}
          onPick={(f) => {
            setPicked(f);
            setView('amount');
          }}
          onCustom={(n) => {
            setCustomName(n);
            setView('custom');
          }}
        />
      </div>
    );

  if (view === 'amount' && picked)
    return (
      <AmountPanel
        food={picked}
        confirmLabel="Add to recipe"
        backLabel="Search"
        onBack={() => setView('search')}
        onConfirm={(c) => {
          setParts((p) => [...p, ingredientFrom(c.food, c.unit, c.qty)]);
          setQuery('');
          setView('main');
        }}
      />
    );

  if (view === 'custom')
    return (
      <CustomFoodForm
        initial={{ name: customName }}
        onCancel={() => setView('search')}
        onSave={async (f) => {
          const saved = await onSaveFood(f);
          setPicked(savedFoodToFood(saved));
          setView('amount');
        }}
      />
    );

  return (
    <div>
      <button type="button" onClick={() => (dirty ? setLeaving(true) : onClose())} className="min-h-tap text-sm text-muted">← Cancel</button>
      <h2 className="pb-3 text-3xl uppercase">{initial ? 'Edit recipe' : 'Build a recipe'}</h2>
      <input className={`${fieldClass} w-full`} placeholder="Name (Steak burrito)" aria-label="Recipe name" value={name} onChange={(e) => setName(e.target.value)} />

      <h3 className="pt-4 text-xl uppercase">Parts</h3>
      {parts.length > 0 ? (
        <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-surface" aria-label="Parts">
          {parts.map((p, i) => (
            <li key={`${p.name}-${i}`} className="flex min-h-tap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0">{p.name}</span>
              <span className="num shrink-0 text-muted">{fmt(p.calories)} kcal</span>
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setParts(parts.filter((_, j) => j !== i))} className="min-h-tap min-w-tap text-muted">✕</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pt-1 text-sm text-muted">No parts yet. Add each thing that goes into it, with its amount.</p>
      )}
      <button type="button" onClick={() => setView('search')} className="mt-2 min-h-[56px] w-full rounded-card border border-line bg-surface px-4 text-left text-base font-medium">
        + Add a part
      </button>

      <section className="mt-4 rounded-card border border-line bg-surface p-4" aria-label="Servings">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            Makes
            <input className={`${fieldClass} num w-20 text-center`} inputMode="decimal" aria-label="Servings" aria-invalid={!valid} value={servingsText} onChange={(e) => setServingsText(e.target.value)} />
            servings
          </label>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted">
            One serving is 1
            <input className={`${fieldClass} min-w-0 flex-1`} placeholder="burrito" aria-label="What one serving is" value={label} onChange={(e) => setLabel(e.target.value)} />
          </label>
        </div>
        <div className="mt-3 flex border-t border-line pt-3 text-center" aria-live="polite">
          <div className="flex-1">
            <div className="num text-3xl">{fmt(per.calories)}</div>
            <div className="text-xs text-muted">kcal per serving</div>
          </div>
          <div className="flex-1">
            <div className="num text-3xl">{num1(per.proteinG)}</div>
            <div className="text-xs text-muted">protein g</div>
          </div>
          <div className="flex-1">
            <div className="num text-3xl">{num1(per.carbsG)}</div>
            <div className="text-xs text-muted">carbs g</div>
          </div>
          <div className="flex-1">
            <div className="num text-3xl">{num1(per.fatG)}</div>
            <div className="text-xs text-muted">fat g</div>
          </div>
        </div>
        <p className="pt-3 text-xs text-muted">
          Whole recipe: {fmt(total.calories)} kcal · {num1(total.proteinG)} g protein · {num1(total.carbsG)} g carbs · {num1(total.fatG)} g fat. {RECIPE_FORMULA}
        </p>
      </section>

      {error && <p role="alert" className="pt-2 text-sm text-accent-text">{error}</p>}
      <button type="button" onClick={() => void save()} className="num mt-3 min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">
        Save recipe
      </button>
      {leaving && <ConfirmDialog title="Discard this recipe?" body="The parts you added are not saved yet." confirmLabel="Discard" destructive onConfirm={onClose} onCancel={() => setLeaving(false)} />}
    </div>
  );
}
