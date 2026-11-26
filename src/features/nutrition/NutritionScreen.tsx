import { useCallback, useEffect, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { MenuRow } from '../../components/SubScreen';
import { UNDO_EVENT, nutritionRepo, type FoodInput, type NutritionData } from '../../db/repositories';
import { addDays, localDateKey } from '../../domain/calendar';
import { dayTotals } from '../../domain/nutrition';
import { FoodPicker } from './FoodPicker';
import { NutritionTrends } from './NutritionTrends';

const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
const num = (s: string): number | undefined => {
  const n = Number(s.trim().replace(',', '.'));
  return s.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;
};
const fmt = (n: number) => Math.round(n).toLocaleString();
const dayName = (key: string, today: string) =>
  key === today ? 'Today' : key === addDays(today, -1) ? 'Yesterday' : new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

function Bar({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div className="pb-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span className="num text-3xl">
          {fmt(value)}
          <span className="text-base text-muted"> {target ? `/ ${fmt(target)} ` : ''}{unit}</span>
        </span>
      </div>
      {target ? (
        <div className="mt-1 h-2 rounded-full bg-surface-2" role="progressbar" aria-label={`${label} progress`} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

/** Nutrition = log what you ate today in a few taps. Trends, maintenance estimate and targets are one tap away. */
export function NutritionScreen() {
  const today = localDateKey(new Date());
  const [date, setDate] = useState(today);
  const [data, setData] = useState<NutritionData | null>(null);
  const [trends, setTrends] = useState(false);
  const [editFoods, setEditFoods] = useState(false);
  const [picker, setPicker] = useState(false);
  const [name, setName] = useState('');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [more, setMore] = useState(false);
  const [save, setSave] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(() => void nutritionRepo.load().then(setData), []);
  useEffect(reload, [reload]);
  useEffect(() => {
    window.addEventListener(UNDO_EVENT, reload);
    return () => window.removeEventListener(UNDO_EVENT, reload);
  }, [reload]);

  if (!data) return null;
  if (trends) return <NutritionTrends data={data} today={today} onBack={() => setTrends(false)} onChanged={reload} />;

  const totals = dayTotals(data.entries, date);
  const list = data.entries.filter((e) => e.date === date).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));

  async function add(food: FoodInput, remember = false) {
    await nutritionRepo.addEntry(date, food);
    if (remember && food.name) await nutritionRepo.saveFood({ ...food, name: food.name });
    reload();
  }
  async function submit() {
    const calories = num(cal);
    if (calories === undefined || calories <= 0) {
      setError('Enter the calories.');
      return;
    }
    if (save && !name.trim()) {
      setError('Name the food to save it.');
      return;
    }
    const food: FoodInput = { calories, ...(name.trim() ? { name } : {}) };
    for (const [key, v] of [['proteinG', protein], ['carbsG', carbs], ['fatG', fat]] as const) {
      const n = num(v);
      if (n !== undefined) food[key] = n;
    }
    setError('');
    await add(food, save);
    setName(''); setCal(''); setProtein(''); setCarbs(''); setFat(''); setSave(false);
  }

  return (
    <div className="pb-6">
      <ScreenHeader title="Nutrition" />
      <div className="flex items-center justify-between pb-3">
        <button type="button" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))} className="min-h-tap min-w-tap text-2xl text-muted">‹</button>
        <span className="text-lg">{dayName(date, today)}</span>
        <button type="button" aria-label="Next day" disabled={date >= today} onClick={() => setDate(addDays(date, 1))} className="min-h-tap min-w-tap text-2xl text-muted disabled:opacity-30">›</button>
      </div>

      <section className="rounded-card border border-line bg-surface p-4" aria-label="Day totals">
        <Bar label="Calories" value={totals.calories} {...(data.targets.calories ? { target: data.targets.calories } : {})} unit="kcal" />
        <Bar label="Protein" value={totals.proteinG} {...(data.targets.proteinG ? { target: data.targets.proteinG } : {})} unit="g" />
        {!data.targets.calories && !data.targets.proteinG && <p className="text-xs text-muted">Set your targets under Trends and targets.</p>}
      </section>

      {data.foods.length > 0 && (
        <section className="mt-4" aria-label="Quick foods">
          <div className="flex items-baseline justify-between pb-2">
            <h2 className="text-xl uppercase">Quick add</h2>
            <button type="button" onClick={() => setEditFoods(!editFoods)} className="min-h-tap px-2 text-sm text-muted">{editFoods ? 'Done' : 'Edit'}</button>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.foods.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-label={editFoods ? `Remove ${f.name}` : `Add ${f.name}, ${f.calories} calories`}
                onClick={() => (editFoods ? void nutritionRepo.removeFood(f.id).then(reload) : void add({ name: f.name, calories: f.calories, ...(f.proteinG !== undefined ? { proteinG: f.proteinG } : {}), ...(f.carbsG !== undefined ? { carbsG: f.carbsG } : {}), ...(f.fatG !== undefined ? { fatG: f.fatG } : {}) }))}
                className="min-h-tap rounded-card border border-line bg-surface px-3 text-left text-sm"
              >
                {editFoods ? '✕ ' : ''}{f.name}
                <span className="num block text-xs text-muted">{fmt(f.calories)} kcal{f.proteinG !== undefined ? ` · ${fmt(f.proteinG)} g` : ''}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-4" aria-label="Add food">
        <h2 className="pb-2 text-xl uppercase">Add food</h2>
        <button type="button" onClick={() => setPicker(true)} className="mb-3 flex min-h-[56px] w-full items-center justify-between rounded-card border border-line bg-surface px-4 text-left">
          <span>
            <span className="block text-base font-medium">Search the food list</span>
            <span className="block text-sm text-muted">Pick a food, slide the amount, see the macros</span>
          </span>
          <span aria-hidden="true" className="text-muted">›</span>
        </button>
        <p className="pb-2 text-sm text-muted">Or type it in:</p>
        <div className="flex flex-wrap gap-2">
          <input className={`${field} w-28`} inputMode="numeric" placeholder="Calories" aria-label="Calories" value={cal} onChange={(e) => setCal(e.target.value)} />
          <input className={`${field} w-28`} inputMode="decimal" placeholder="Protein g" aria-label="Protein in grams" value={protein} onChange={(e) => setProtein(e.target.value)} />
          <input className={`${field} min-w-0 flex-1`} placeholder="Name (optional)" aria-label="Food name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {more && (
          <div className="mt-2 flex gap-2">
            <input className={`${field} w-28`} inputMode="decimal" placeholder="Carbs g" aria-label="Carbs in grams" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            <input className={`${field} w-28`} inputMode="decimal" placeholder="Fat g" aria-label="Fat in grams" value={fat} onChange={(e) => setFat(e.target.value)} />
          </div>
        )}
        <div className="flex items-center justify-between pt-1">
          <label className="flex min-h-tap items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="h-5 w-5" checked={save} onChange={(e) => setSave(e.target.checked)} /> Save as quick food
          </label>
          <button type="button" onClick={() => setMore(!more)} className="min-h-tap px-2 text-sm text-muted">{more ? 'Fewer' : 'Carbs and fat'}</button>
        </div>
        {error && <p role="alert" className="text-sm text-accent-text">{error}</p>}
        <button type="button" onClick={() => void submit()} className="num mt-1 min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">Add</button>
      </section>

      {list.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-card border border-line bg-surface" aria-label="Entries">
          {list.map((e) => (
            <li key={e.id} className="flex min-h-tap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 truncate">{e.name ?? 'Food'}</span>
              <span className="num shrink-0 text-muted">{fmt(e.calories)} kcal{e.proteinG !== undefined ? ` · ${fmt(e.proteinG)} g` : ''}</span>
              <button type="button" aria-label={`Delete ${e.name ?? 'entry'}`} onClick={() => void nutritionRepo.removeEntry(e.id).then(reload)} className="min-h-tap min-w-tap text-muted">✕</button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <MenuRow title="Trends and targets" detail="Averages, maintenance estimate, your targets" onClick={() => setTrends(true)} />
      </div>
      {picker && <FoodPicker entries={data.entries} onAdd={(food) => add(food)} onClose={() => setPicker(false)} />}
    </div>
  );
}
