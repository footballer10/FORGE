import { useMemo } from 'react';
import { recentFoodIds, searchFoods, type Food } from '../../domain/foods';
import type { NutritionEntry } from '../../domain/types';
import { fieldClass } from './Sheet';

/** The search bar. Used at the top of the Nutrition tab and when adding a part to a recipe. */
export function SearchInput({
  query,
  onQuery,
  onActive,
  onCancel,
  autoFocus,
  placeholder = 'Search foods: burrito, rice, cola, chicken breast',
}: {
  query: string;
  onQuery: (q: string) => void;
  onActive?: () => void;
  onCancel?: () => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        autoFocus={autoFocus}
        className={`${fieldClass} min-w-0 flex-1`}
        placeholder={placeholder}
        aria-label="Search foods"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onFocus={onActive}
      />
      {onCancel && (
        <button type="button" onClick={onCancel} className="min-h-tap px-2 text-sm text-muted">
          Cancel
        </button>
      )}
    </div>
  );
}

const kcalNote = (f: Food) => (f.basis === 1 ? `${Math.round(f.kcal)} kcal / serving` : `${Math.round(f.kcal)} kcal / 100 g`);

function Row({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onPick(food)} className="flex min-h-tap w-full items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="min-w-0 text-sm">
          {food.name}
          {food.tag && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-muted">{food.tag}</span>}
        </span>
        <span className="num shrink-0 text-xs text-muted">{kcalNote(food)}</span>
      </button>
    </li>
  );
}

function List({ label, foods, onPick }: { label: string; foods: Food[]; onPick: (f: Food) => void }) {
  return (
    <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-surface" aria-label={label}>
      {foods.map((f) => (
        <Row key={f.id} food={f} onPick={onPick} />
      ))}
    </ul>
  );
}

/**
 * Search results. With nothing typed: foods eaten recently, then the user's own foods and recipes.
 * `onCustom` / `onRecipe` are the "not here" exits.
 */
export function FoodResults({
  foods,
  mine,
  entries,
  query,
  loading,
  failed,
  onPick,
  onCustom,
  onRecipe,
}: {
  foods: readonly Food[];
  mine: readonly Food[];
  entries: readonly NutritionEntry[];
  query: string;
  loading: boolean;
  failed: boolean;
  onPick: (f: Food) => void;
  onCustom: (name: string) => void;
  onRecipe?: () => void;
}) {
  const typed = query.trim() !== '';
  const recent = useMemo(() => recentFoodIds(entries), [entries]);
  const results = useMemo(() => searchFoods(foods, query, recent), [foods, query, recent]);
  const mineList = useMemo(() => mine.slice(0, 30), [mine]);
  return (
    <div className="pt-2">
      {failed && <p role="alert" className="pb-2 text-sm text-accent-text">The USDA food list could not load. Your own foods still work, and you can add your own.</p>}
      {loading && typed && <p className="pb-2 text-sm text-muted">Loading the food list…</p>}
      {typed && results.length > 0 && <List label="Foods" foods={results} onPick={onPick} />}
      {typed && results.length === 0 && !loading && <p className="text-sm text-muted">No match for “{query.trim()}”. Try a shorter word, or add it yourself below.</p>}
      {!typed && (
        <>
          {results.length > 0 && (
            <>
              <h2 className="pt-1 text-sm uppercase text-muted">Recent</h2>
              <List label="Recent foods" foods={results} onPick={onPick} />
            </>
          )}
          {mineList.length > 0 && (
            <>
              <h2 className="pt-3 text-sm uppercase text-muted">My foods and recipes</h2>
              <List label="My foods and recipes" foods={mineList} onPick={onPick} />
            </>
          )}
          {results.length === 0 && mineList.length === 0 && <p className="pt-1 text-sm text-muted">Type a food. Foods you add show up here first.</p>}
        </>
      )}
      <section className="mt-4 rounded-card border border-line bg-surface p-3" aria-label="Not in the list">
        <p className="pb-2 text-sm text-muted">Can't find it? Add the part you have, or build a meal from parts (a burrito from tortilla, rice, beans, meat, salsa).</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onCustom(query.trim())} className="min-h-tap rounded-card border border-line px-3 text-sm">
            {typed ? `Add “${query.trim()}” myself` : 'Add a food myself'}
          </button>
          {onRecipe && (
            <button type="button" onClick={onRecipe} className="min-h-tap rounded-card border border-line px-3 text-sm">
              Build a recipe
            </button>
          )}
        </div>
      </section>
      <p className="py-3 text-xs text-muted">Values from USDA FoodData Central (Foundation Foods, SR Legacy and the Survey / FNDDS set), public domain.</p>
    </div>
  );
}
