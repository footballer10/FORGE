import type { SavedFood } from '../../domain/types';

const fmt = (n: number) => Math.round(n).toLocaleString();

/** The user's own foods and recipes: edit, delete (undoable), or start a new one. */
export function MyFoods({
  saved,
  onEdit,
  onDelete,
  onNewFood,
  onNewRecipe,
  onClose,
}: {
  saved: readonly SavedFood[];
  onEdit: (f: SavedFood) => void;
  onDelete: (f: SavedFood) => void;
  onNewFood: () => void;
  onNewRecipe: () => void;
  onClose: () => void;
}) {
  const sorted = [...saved].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <button type="button" onClick={onClose} className="min-h-tap text-sm text-muted">← Back</button>
      <h2 className="pb-1 text-3xl uppercase">My foods and recipes</h2>
      <p className="pb-3 text-sm text-muted">They show up first when you search. Values are per serving.</p>
      <div className="flex flex-wrap gap-2 pb-3">
        <button type="button" onClick={onNewFood} className="min-h-tap rounded-card border border-line bg-surface px-3 text-sm">+ New food</button>
        <button type="button" onClick={onNewRecipe} className="min-h-tap rounded-card border border-line bg-surface px-3 text-sm">+ New recipe</button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. A recipe is a meal built from parts; a food is one thing you type once.</p>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-surface" aria-label="My foods and recipes">
          {sorted.map((f) => (
            <li key={f.id} className="flex min-h-tap items-center justify-between gap-2 px-3 py-2 text-sm">
              <button type="button" onClick={() => onEdit(f)} className="min-w-0 flex-1 py-1 text-left" aria-label={`Edit ${f.name}`}>
                {f.name}
                <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-xs text-muted">{f.ingredients?.length ? `Recipe · ${f.ingredients.length} parts` : 'Food'}</span>
              </button>
              <span className="num shrink-0 text-muted">{fmt(f.calories)} kcal</span>
              <button type="button" aria-label={`Delete ${f.name}`} onClick={() => onDelete(f)} className="min-h-tap min-w-tap text-muted">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
