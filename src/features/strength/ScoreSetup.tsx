import { useEffect, useState } from 'react';
import { analyticsRepo } from '../../db/repositories';
import { STANDARD_TEMPLATES, TIERS, templateForPattern, validThresholds, type Thresholds } from '../../domain/strengthScore';
import type { Exercise, ID, StrengthStandard, StrengthTier } from '../../domain/types';
import { ExerciseBrowser } from '../exercises/ExerciseBrowser';

interface Row {
  exerciseId: ID;
  name: string;
  weight: string;
  th: Record<StrengthTier, string>;
}

const field = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg';
const toStr = (t: Thresholds) => Object.fromEntries(TIERS.map((x) => [x, String(t[x])])) as Record<StrengthTier, string>;
const toNum = (t: Record<StrengthTier, string>) => Object.fromEntries(TIERS.map((x) => [x, Number(t[x])])) as Thresholds;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Choose score lifts, their weights and tier thresholds (e1RM ÷ bodyweight). Saved on the profile. */
export function ScoreSetup({ onDone }: { onDone: () => void; unit: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [names, setNames] = useState<Map<ID, string>>(new Map());

  useEffect(() => {
    void (async () => {
      const s = await analyticsRepo.scoreSetup();
      const ex = await analyticsRepo.exercisesByIds(s.strengthScoreLifts.map((l) => l.exerciseId));
      setNames(new Map([...ex].map(([id, e]) => [id, e.name])));
      setRows(
        s.strengthScoreLifts.map((l) => {
          const st = s.strengthStandards.find((x) => x.exerciseId === l.exerciseId);
          return { exerciseId: l.exerciseId, name: ex.get(l.exerciseId)?.name ?? 'Deleted exercise', weight: String(l.weight), th: toStr(st?.thresholds ?? (STANDARD_TEMPLATES[0] as { thresholds: Thresholds }).thresholds) };
        }),
      );
    })();
  }, []);

  if (picking) {
    return (
      <ExerciseBrowser
        title="Add a lift"
        onBack={() => setPicking(false)}
        onCreate={() => setPicking(false)}
        onSelect={(e: Exercise) => {
          setPicking(false);
          setRows((r) => (r ?? []).some((x) => x.exerciseId === e.id) ? r : [...(r ?? []), { exerciseId: e.id, name: e.name, weight: '1', th: toStr(templateForPattern(e.pattern).thresholds) }]);
        }}
      />
    );
  }
  if (!rows) return null;

  const patch = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const errors = rows.map((r) => !(Number(r.weight) > 0) || !validThresholds(toNum(r.th)));
  const bad = errors.some(Boolean);

  const save = async () => {
    const standards: StrengthStandard[] = rows.map((r) => ({ exerciseId: r.exerciseId, thresholds: toNum(r.th), source: 'user-edited' }));
    await analyticsRepo.saveScoreSetup({ strengthScoreLifts: rows.map((r) => ({ exerciseId: r.exerciseId, weight: Number(r.weight) })), strengthStandards: standards });
    onDone();
  };

  return (
    <section className="mb-6 rounded-card border border-line bg-surface p-4">
      <h2 className="pb-2 text-2xl uppercase">Score lifts</h2>
      {rows.length === 0 && <p className="pb-2 text-sm text-muted">No lifts yet. Add the big lifts you want the score to reflect.</p>}
      <ul className="flex flex-col gap-4">
        {rows.map((r, i) => (
          <li key={r.exerciseId} className="rounded-card bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{names.get(r.exerciseId) ?? r.name}</span>
              <button type="button" className="min-h-tap px-2 text-sm text-muted underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button>
            </div>
            <label className="mt-1 block text-xs text-muted">
              Weight in score
              <input inputMode="decimal" className={`${field} mt-1`} value={r.weight} onChange={(e) => patch(i, { weight: e.target.value })} />
            </label>
            <div className="mt-2 text-xs text-muted">Tier thresholds (e1RM ÷ bodyweight)</div>
            <div className="mt-1 grid grid-cols-5 gap-1">
              {TIERS.map((t) => (
                <label key={t} className="text-[10px] uppercase text-muted">
                  {t.slice(0, 4)}
                  <input
                    inputMode="decimal"
                    aria-label={`${cap(t)} threshold`}
                    className={`${field} mt-1 px-1 text-center tabular-nums`}
                    value={r.th[t]}
                    onChange={(e) => patch(i, { th: { ...r.th, [t]: e.target.value } })}
                  />
                </label>
              ))}
            </div>
            <label className="mt-2 block text-xs text-muted">
              Reset thresholds from a starting template
              <select
                className={`${field} mt-1`}
                value=""
                onChange={(e) => {
                  const tpl = STANDARD_TEMPLATES.find((x) => x.id === e.target.value);
                  if (tpl) patch(i, { th: toStr(tpl.thresholds) });
                }}
              >
                <option value="">Choose…</option>
                {STANDARD_TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            {errors[i] && <p className="mt-1 text-xs text-accent">Weight and thresholds must be positive, and thresholds must not decrease.</p>}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setPicking(true)} className="min-h-tap flex-1 rounded-card border border-line px-4 text-sm">Add lift</button>
        <button type="button" onClick={onDone} className="min-h-tap rounded-card border border-line px-4 text-sm">Cancel</button>
        <button type="button" disabled={bad} onClick={() => void save()} className="min-h-tap rounded-card bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-40">Save</button>
      </div>
      <p className="mt-3 text-xs text-muted">Thresholds are minimums for each tier. Starting values come from a template chosen by movement pattern; they are rough defaults you should adjust.</p>
    </section>
  );
}
