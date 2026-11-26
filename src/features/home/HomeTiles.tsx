import { useEffect, useState } from 'react';
import { useUi, type Tab } from '../../app/uiStore';
import { achievementsRepo, analyticsRepo, nutritionRepo, type NamedPr } from '../../db/repositories';
import { localDateKey } from '../../domain/calendar';
import { weekSummary, weightSummary, type WeekSummary, type WeightSummary } from '../../domain/homeSummary';
import { dayTotals, type Totals } from '../../domain/nutrition';
import type { NutritionTargets } from '../../domain/types';
import { prLabel } from './prLabel';

interface Data {
  week: WeekSummary;
  weight?: WeightSummary;
  food: Totals;
  targets: NutritionTargets;
  pr?: NamedPr;
}

const n = (v: number) => Math.round(v).toLocaleString();

function Tile({ label, value, sub, tab }: { label: string; value: string; sub: string; tab: Tab }) {
  return (
    <button type="button" onClick={() => useUi.getState().setTab(tab)} className="flex min-h-[76px] flex-col justify-between rounded-card border border-line bg-surface p-2 text-left">
      <span className="text-xs uppercase text-muted">{label}</span>
      <span className="num text-2xl leading-none">{value}</span>
      <span className="num truncate text-xs text-muted">{sub}</span>
    </button>
  );
}

/** Three glanceable numbers (this week, today's food, bodyweight) and the latest PR. Each opens its tab. */
export function HomeTiles() {
  const [d, setD] = useState<Data>();
  useEffect(() => {
    let live = true;
    void (async () => {
      const today = localDateKey(new Date());
      const [t, nut, prs] = await Promise.all([analyticsRepo.trainingData(), nutritionRepo.load(), achievementsRepo.recentPrs(1)]);
      const weight = weightSummary(nut.metrics, nut.unit);
      const data: Data = { week: weekSummary(t.sets, t.workouts, today), food: dayTotals(nut.entries, today), targets: nut.targets, ...(weight ? { weight } : {}), ...(prs[0] ? { pr: prs[0] } : {}) };
      if (live) setD(data);
    })().catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  if (!d) return null;
  const diff = d.week.hardSets - d.week.lastWeekSets;
  return (
    <div className="mb-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="This week" value={`${d.week.hardSets}`} sub={`sets · ${d.week.sessions} ${d.week.sessions === 1 ? 'session' : 'sessions'}`} tab="strength" />
        <Tile
          label="Food today"
          value={n(d.food.calories)}
          sub={d.targets.calories ? `of ${n(d.targets.calories)} kcal · ${n(d.food.proteinG)} g P` : `kcal · ${n(d.food.proteinG)} g protein`}
          tab="nutrition"
        />
        <Tile
          label="Weight"
          value={d.weight ? `${d.weight.latest}` : '—'}
          sub={d.weight ? (d.weight.weekChange !== undefined ? `${d.weight.unit} · ${d.weight.weekChange > 0 ? '+' : ''}${d.weight.weekChange} this wk` : d.weight.unit) : 'tap to log'}
          tab="progress"
        />
      </div>
      <p className="num mt-2 text-xs text-muted">
        Last week {d.week.lastWeekSets} sets{d.week.lastWeekSets > 0 ? ` (${diff >= 0 ? '+' : ''}${diff} so far)` : ''} · warm-ups not counted
      </p>
      {d.pr && (
        <p className="mt-2 text-sm">
          <span className="font-semibold text-accent-text">PR</span> {d.pr.exerciseName}: {prLabel(d.pr)} <span className="text-muted">· {new Date(d.pr.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
        </p>
      )}
    </div>
  );
}
