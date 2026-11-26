import { useEffect, useMemo, useState } from 'react';
import { analyticsRepo } from '../../db/repositories';
import { YEAR_REVIEW_NOTES, reviewYears, yearReview } from '../../domain/yearReview';
import type { WeightUnit } from '../../domain/types';

type Data = Awaited<ReturnType<typeof analyticsRepo.yearReviewData>>;
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
const day = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Year in review (Progress). Every number is computed from logged working sets; see the note at the bottom. */
export function YearReviewPanel() {
  const [data, setData] = useState<Data>();
  const [year, setYear] = useState(new Date().getFullYear());
  useEffect(() => {
    void analyticsRepo.yearReviewData().then(setData);
  }, []);
  const years = useMemo(() => {
    const ys = data ? reviewYears(data.workouts) : [];
    return ys.includes(new Date().getFullYear()) ? ys : [new Date().getFullYear(), ...ys];
  }, [data]);
  const r = useMemo(() => (data ? yearReview({ year, workouts: data.workouts, lifts: data.lifts, weeklyTarget: data.weeklyTarget }) : undefined), [data, year]);
  if (!data || !r) return <p className="py-6 text-sm text-muted" role="status">Loading…</p>;
  const u: WeightUnit = data.unit;

  return (
    <div className="pb-6">
      {years.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {years.map((y) => (
            <button key={y} type="button" aria-pressed={y === year} onClick={() => setYear(y)} className={`num min-h-tap min-w-[72px] rounded-card border text-lg ${y === year ? 'border-fg text-fg' : 'border-line text-muted'}`}>
              {y}
            </button>
          ))}
        </div>
      )}
      {r.workouts === 0 ? (
        <p className="py-6 text-sm text-muted">No finished workouts in {year}.</p>
      ) : (
        <>
          <section className="rounded-card border border-line bg-surface p-4 text-center">
            <p className="text-sm uppercase tracking-wider text-muted">Total lifted in {year}</p>
            <p className="num text-5xl text-accent-text">{fmt(r.totalVolume)} <span className="text-2xl">{u}</span></p>
            <p className="num mt-1 text-sm text-muted">{fmt(r.workingSets)} working sets · {fmt(r.reps)} reps</p>
          </section>
          <div className="num mt-3 grid grid-cols-3 gap-2 text-center">
            <Stat label="Workouts" value={fmt(r.workouts)} />
            <Stat label="Hours" value={fmt(r.hours)} />
            <Stat label="PRs" value={fmt(r.prCount)} />
            <Stat label="Longest streak" value={`${r.longestStreakWeeks} wk`} />
            <Stat label="Busiest week" value={r.busiestWeek ? `${r.busiestWeek.workouts}` : '—'} sub={r.busiestWeek ? `week of ${day(r.busiestWeek.weekOf)}` : undefined} />
            <Stat label="Weekly goal" value={`${data.weeklyTarget}`} sub="workouts" />
          </div>

          {r.e1rmGains.length > 0 && (
            <Section title="Biggest strength gains">
              {r.e1rmGains.map((g) => (
                <Row key={g.name} left={g.name} right={`+${fmt(g.gain)} ${u}`} sub={`e1RM ${fmt(g.from)} → ${fmt(g.to)} (${g.since === 'lastYear' ? 'vs best before ' + year : 'vs first session'})`} accent />
              ))}
            </Section>
          )}
          {r.mostTrained.length > 0 && (
            <Section title="Most trained">
              {r.mostTrained.map((m) => (
                <Row key={m.name} left={m.name} right={`${m.sets} sets`} />
              ))}
            </Section>
          )}
          {r.heaviestSet && (
            <Section title="Heaviest set">
              <Row left={r.heaviestSet.name} right={`${fmt(r.heaviestSet.load)} ${u} × ${r.heaviestSet.reps}`} sub={day(r.heaviestSet.date)} />
            </Section>
          )}
        </>
      )}
      <p className="mt-4 text-xs text-muted">{YEAR_REVIEW_NOTES}</p>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-card border border-line p-2">
      <div className="text-2xl">{value}</div>
      <div className="font-sans text-xs text-muted">{label}</div>
      {sub && <div className="font-sans text-[11px] text-muted">{sub}</div>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="pb-1 text-lg uppercase">{title}</h2>
      <ul className="flex flex-col divide-y divide-line rounded-card border border-line">{children}</ul>
    </section>
  );
}

function Row({ left, right, sub, accent }: { left: string; right: string; sub?: string; accent?: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 px-3 py-2">
      <span className="min-w-0">
        <span className="block truncate text-base">{left}</span>
        {sub && <span className="num block text-xs text-muted">{sub}</span>}
      </span>
      <span className={`num shrink-0 text-lg ${accent ? 'text-accent-text' : ''}`}>{right}</span>
    </li>
  );
}
