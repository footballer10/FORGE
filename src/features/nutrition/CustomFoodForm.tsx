import { useState } from 'react';
import type { SavedFoodInput } from '../../db/repositories';
import { customFoodProblem } from '../../domain/recipes';
import type { SavedFood } from '../../domain/types';
import { fieldClass } from './Sheet';

const num = (s: string): number | undefined => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const text = (n: number | undefined) => (n === undefined ? '' : String(n));

/** A food that is not in the list: values for ONE serving, typed from a label. Used as a part of a recipe or on its own. */
export function CustomFoodForm({
  initial,
  existing,
  onSave,
  onCancel,
}: {
  initial?: { name?: string };
  existing?: SavedFood;
  onSave: (food: SavedFoodInput) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? initial?.name ?? '');
  const [label, setLabel] = useState(existing?.servingLabel ?? '');
  const [cal, setCal] = useState(text(existing?.calories));
  const [protein, setProtein] = useState(text(existing?.proteinG));
  const [carbs, setCarbs] = useState(text(existing?.carbsG));
  const [fat, setFat] = useState(text(existing?.fatG));
  const [error, setError] = useState('');

  async function save() {
    const calories = num(cal);
    const problem = customFoodProblem({ name, ...(calories !== undefined ? { calories } : {}) });
    if (problem || calories === undefined) {
      setError(problem ?? 'Enter the calories for one serving.');
      return;
    }
    const food: SavedFoodInput = { name: name.trim(), calories };
    const p = num(protein), c = num(carbs), f = num(fat);
    if (p !== undefined) food.proteinG = p;
    if (c !== undefined) food.carbsG = c;
    if (f !== undefined) food.fatG = f;
    if (label.trim()) food.servingLabel = label.trim();
    if (existing?.ingredients) food.ingredients = existing.ingredients;
    if (existing?.servings) food.servings = existing.servings;
    setError('');
    await onSave(food);
  }

  return (
    <div>
      <button type="button" onClick={onCancel} className="min-h-tap text-sm text-muted">← Cancel</button>
      <h2 className="pb-1 text-3xl uppercase">{existing ? 'Edit food' : 'Add a food'}</h2>
      <p className="pb-3 text-sm text-muted">Type the values for one serving, from the package label or a recipe. Leave a macro blank if you do not know it.</p>
      <div className="flex flex-col gap-2">
        <input className={fieldClass} placeholder="Name (tortilla, small)" aria-label="Food name" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="flex items-center gap-2 text-sm text-muted">
          One serving is 1
          <input className={`${fieldClass} min-w-0 flex-1`} placeholder="tortilla, slice, scoop, bowl" aria-label="What one serving is" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <input className={`${fieldClass} w-28`} inputMode="decimal" placeholder="Calories" aria-label="Calories per serving" value={cal} onChange={(e) => setCal(e.target.value)} />
          <input className={`${fieldClass} w-28`} inputMode="decimal" placeholder="Protein g" aria-label="Protein in grams" value={protein} onChange={(e) => setProtein(e.target.value)} />
          <input className={`${fieldClass} w-28`} inputMode="decimal" placeholder="Carbs g" aria-label="Carbs in grams" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          <input className={`${fieldClass} w-28`} inputMode="decimal" placeholder="Fat g" aria-label="Fat in grams" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-accent-text">{error}</p>}
        <button type="button" onClick={() => void save()} className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">
          {existing ? 'Save changes' : 'Save food'}
        </button>
      </div>
    </div>
  );
}
