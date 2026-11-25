import { useState } from 'react';
import { SubScreen } from '../../components/SubScreen';
import { nutritionRepo, type NutritionData } from '../../db/repositories';
import { MAINTENANCE_FORMULA, averageIntake, estimateMaintenance, intakeByDay, proteinRange } from '../../domain/nutrition';
import { dailyWeights, ewmaTrend } from '../../domain/bodyweight';

const field = 'min-h-tap rounded-card border border-line bg-surface px-3 text-base text-fg placeholder:text-muted';
const card = 'mb-4 rounded-card border border-line bg-surface p-4';
const fmt = (n: number) => Math.round(n).toLocaleString();

export function NutritionTrends({ data, today, onBack, onChanged }: { data: NutritionData; today: string; onBack: () => void; onChanged: () => void }) {
  const [cal, setCal] = useState(data.targets.calories ? String(data.targets.calories) : '');
  const [pro, setPro] = useState(data.targets.proteinG ? String(data.targets.proteinG) : '');
  const [saved, setSaved] = useState(false);

  const week = averageIntake(data.entries, today, 7);
  const month = averageIntake(data.entries, today, 28);
  const days = intakeByDay(data.entries, today, 14);
  const peak = Math.max(1, ...days.map((d) => d.totals.calories));
  const maintenance = estimateMaintenance(data.entries, data.metrics, today, data.unit);
  const trend = ewmaTrend(dailyWeights(data.metrics, data.unit)).at(-1);
  const range = trend ? proteinRange(trend.trend, data.unit) : undefined;

  async function saveTargets() {
    const c = Number(cal);
    const p = Number(pro);
    await nutritionRepo.setTargets({ ...(cal.trim() && c > 0 ? { calories: Math.round(c) } : {}), ...(pro.trim() && p > 0 ? { proteinG: Math.round(p) } : {}) });
    setSaved(true);
    onChanged();
  }

  return (
    <SubScreen title="Trends" onBack={onBack} backLabel="Nutrition">
      <section className={card} aria-label="Averages">
        <h2 className="pb-2 text-xl uppercase">Averages</h2>
        {week ? (
          <p className="num text-sm">
            Last 7 days: <span className="text-lg">{fmt(week.avgCalories)}</span> kcal · {fmt(week.avgProteinG)} g protein
            <span className="block text-muted">logged on {week.loggedDays} of {week.days} days</span>
          </p>
        ) : (
          <p className="text-sm text-muted">Nothing logged in the last 7 days.</p>
        )}
        {month && (
          <p className="num mt-1 text-sm">
            Last 28 days: <span className="text-lg">{fmt(month.avgCalories)}</span> kcal · {fmt(month.avgProteinG)} g protein
            <span className="block text-muted">logged on {month.loggedDays} of {month.days} days</span>
          </p>
        )}
        <p className="mt-1 text-xs text-muted">Averages count only the days you logged, so a forgotten day does not pull them down.</p>
        <div className="mt-3 flex h-20 items-end gap-1" role="img" aria-label="Calories for the last 14 days">
          {days.map((d) => (
            <div key={d.date} className="flex-1 rounded-t bg-surface-2" style={{ height: `${Math.max(2, (d.totals.calories / peak) * 100)}%` }} title={`${d.date}: ${fmt(d.totals.calories)} kcal`}>
              <div className={`h-full w-full rounded-t ${d.totals.entries ? 'bg-fg/40' : ''}`} />
            </div>
          ))}
        </div>
        <p className="text-xs text-muted">Last 14 days, oldest on the left.</p>
      </section>

      <section className={card} aria-label="Maintenance estimate">
        <h2 className="pb-2 text-xl uppercase">Maintenance estimate</h2>
        {maintenance.estimate ? (
          <>
            <p className="num text-3xl">{fmt(maintenance.estimate.maintenance)} <span className="text-base text-muted">kcal a day</span></p>
            <p className="num mt-1 text-sm text-muted">
              Average intake {fmt(maintenance.estimate.avgCalories)} kcal on {maintenance.estimate.loggedDays} logged days; weight trend {maintenance.estimate.fromTrend} to {maintenance.estimate.toTrend} {maintenance.estimate.unit} over {maintenance.estimate.spanDays} days ({maintenance.estimate.changePerWeek > 0 ? '+' : ''}{maintenance.estimate.changePerWeek} {maintenance.estimate.unit} a week).
            </p>
            <button type="button" onClick={() => setCal(String(Math.round(maintenance.estimate!.maintenance)))} className="mt-2 min-h-tap rounded-card border border-line px-4 text-sm">Use as my calorie target</button>
          </>
        ) : (
          <p className="text-sm text-muted">{maintenance.reason}</p>
        )}
        <p className="mt-2 text-xs text-muted">{MAINTENANCE_FORMULA}. It is an estimate: the 3,500 kcal per lb rule is approximate and food logging is never exact.</p>
      </section>

      <section className={card} aria-label="Targets">
        <h2 className="pb-2 text-xl uppercase">Your targets</h2>
        <div className="flex gap-2">
          <input className={`${field} w-32`} inputMode="numeric" placeholder="Calories" aria-label="Calorie target" value={cal} onChange={(e) => { setCal(e.target.value); setSaved(false); }} />
          <input className={`${field} w-32`} inputMode="numeric" placeholder="Protein g" aria-label="Protein target in grams" value={pro} onChange={(e) => { setPro(e.target.value); setSaved(false); }} />
          <button type="button" onClick={() => void saveTargets()} className="min-h-tap rounded-card bg-accent px-4 text-sm font-medium text-white">{saved ? 'Saved' : 'Save'}</button>
        </div>
        {range && (
          <button type="button" onClick={() => { setPro(String(Math.round(range.lowG))); setSaved(false); }} className="mt-2 min-h-tap text-left text-sm text-muted underline">
            A starting protein range for your weight is {fmt(range.lowG)} to {fmt(range.highG)} g. Tap to use {fmt(range.lowG)}.
          </button>
        )}
        {range && <p className="text-xs text-muted">{range.basis}. Targets are yours to set; Forge does not prescribe a diet.</p>}
      </section>
    </SubScreen>
  );
}
