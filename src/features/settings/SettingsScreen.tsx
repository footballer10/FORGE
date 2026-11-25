import { useEffect, useState } from 'react';
import { useUi } from '../../app/uiStore';
import { profileRepo } from '../../db/repositories';
import { E1RM_FORMULAS, formulaInfo } from '../../domain/e1rm';
import { parseDays } from '../../domain/profileForm';
import type { E1rmFormula, LengthUnit, Profile, WeightUnit } from '../../domain/types';
import { MenuRow } from '../../components/SubScreen';
import { useWorkout } from '../train/workoutStore';
import { REST_ALERT_LABELS, getRestAlert, setRestAlert, testRestAudio, type RestAlert } from '../train/restAudio';

const isInstalled = (): boolean =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches;

const row = 'flex min-h-tap items-center justify-between gap-3 py-2';
const seg = (on: boolean) => `min-h-tap rounded-card border px-4 ${on ? 'border-accent text-fg' : 'border-line text-muted'}`;

/** App settings. Plate sizes and bar weight are edited in the training profile (Coach tab). */
export function SettingsScreen() {
  const [p, setP] = useState<Profile | null>(null);
  const [days, setDays] = useState('');
  const [error, setError] = useState('');
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const [alert, setAlert] = useState<RestAlert>(getRestAlert);

  useEffect(() => {
    void profileRepo.get().then((x) => {
      setP(x);
      setDays(String(x.plannedDaysPerWeek));
    });
  }, []);

  if (!p) return null;

  async function save(patch: Partial<Profile>) {
    const next = await profileRepo.update(patch);
    setP(next);
    // The logging store reads units and the pair-total flag from the profile; refresh it when no workout is open.
    if (!useWorkout.getState().workout) await useWorkout.getState().load();
  }

  const formula = formulaInfo(p.e1rmFormula);
  return (
    <div className="flex min-h-full flex-col gap-4 pb-6">
      <div className="flex items-center justify-between pb-1 pt-6">
        <h1 className="text-4xl uppercase">Settings</h1>
        <button type="button" onClick={() => useUi.getState().setSettingsOpen(false)} className="min-h-tap px-2 text-sm text-muted">
          Done
        </button>
      </div>

      <section className="flex flex-col gap-2" aria-label="Library and data">
        {([
          ['library', 'Exercise library', 'Browse, edit or add exercises'],
          ['import', 'Import from Strong', 'Bring in your workout history'],
          ['data', 'Backup and restore', 'Export, restore, trash and undo'],
        ] as const).map(([kind, title, detail]) => (
          <MenuRow
            key={kind}
            title={title}
            detail={detail}
            onClick={() => {
              useUi.getState().setOpenTrain(kind);
              useUi.getState().setSettingsOpen(false);
              useUi.getState().setTab('train');
            }}
          />
        ))}
      </section>

      <section className="rounded-card border border-line bg-surface px-4" aria-label="Units">
        <div className={row}>
          <span>Weight unit</span>
          <div className="flex gap-2" role="group" aria-label="Weight unit">
            {(['lb', 'kg'] as WeightUnit[]).map((u) => (
              <button key={u} type="button" aria-pressed={p.weightUnit === u} className={seg(p.weightUnit === u)} onClick={() => void save({ weightUnit: u })}>
                {u}
              </button>
            ))}
          </div>
        </div>
        <div className={`${row} border-t border-line`}>
          <span>Length unit</span>
          <div className="flex gap-2" role="group" aria-label="Length unit">
            {([['in', 'in / mi'], ['cm', 'cm / km']] as [LengthUnit, string][]).map(([u, l]) => (
              <button key={u} type="button" aria-pressed={p.lengthUnit === u} className={seg(p.lengthUnit === u)} onClick={() => void save({ lengthUnit: u })}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <p className="pb-3 text-xs text-muted">Logged sets keep the unit they were entered in. Charts and totals convert to the weight unit chosen here.</p>
      </section>

      <section className="rounded-card border border-line bg-surface px-4 py-3" aria-label="Strength formula">
        <label className="flex flex-col gap-1 text-sm text-muted">
          e1RM formula
          <select
            className="min-h-tap w-full rounded-card border border-line bg-bg px-3 text-base text-fg"
            value={p.e1rmFormula}
            onChange={(e) => void save({ e1rmFormula: e.target.value as E1rmFormula })}
          >
            {E1RM_FORMULAS.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-xs text-muted">{formula.name}: {formula.formula}. Used for PRs, charts and the strength score.</p>
      </section>

      <section className="rounded-card border border-line bg-surface px-4" aria-label="Training">
        <label className={row}>
          <span>Planned training days per week</span>
          <input
            aria-label="Planned training days per week"
            className="num min-h-tap w-16 rounded-card border border-line bg-bg px-3 text-center text-base text-fg"
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onBlur={() => {
              const d = parseDays(days);
              if (!d) {
                setError('Training days must be a whole number from 1 to 7.');
                setDays(String(p.plannedDaysPerWeek));
              } else {
                setError('');
                void save({ plannedDaysPerWeek: d });
              }
            }}
          />
        </label>
        {error && <p role="alert" className="pb-2 text-sm text-accent-text">{error}</p>}
        <label className={`${row} border-t border-line`}>
          <span>Show dumbbell pair total</span>
          <input type="checkbox" className="h-6 w-6" checked={p.showDumbbellPairTotal} onChange={(e) => void save({ showDumbbellPairTotal: e.target.checked })} />
        </label>
        <p className="pb-3 text-xs text-muted">Weeks start on Monday. Pair total is a display line only; dumbbells are stored per implement.</p>
      </section>

      <section className="rounded-card border border-line bg-surface px-4 py-3" aria-label="Rest timer sound">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Rest timer sound
          <select
            className="min-h-tap w-full rounded-card border border-line bg-bg px-3 text-base text-fg"
            value={alert}
            onChange={(e) => {
              const v = e.target.value as RestAlert;
              setRestAlert(v);
              setAlert(v);
            }}
          >
            {(Object.keys(REST_ALERT_LABELS) as RestAlert[]).map((k) => (
              <option key={k} value={k}>{REST_ALERT_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={alert === 'off'} onClick={() => testRestAudio(10)} className="mt-2 min-h-tap rounded-card border border-line px-4 text-sm text-fg disabled:opacity-50">
          Test: three beeps in 10 seconds
        </button>
        <p className="mt-2 text-xs text-muted">Lock your phone after tapping Test to check it sounds with the screen off. Needs the app installed to the Home Screen. Three beeps play when a rest ends, after every set including warm-ups.</p>
      </section>

      <section className="rounded-card border border-line bg-surface px-4" aria-label="Appearance">
        <div className={row}>
          <span>Theme</span>
          <div className="flex gap-2" role="group" aria-label="Theme">
            {(['dark', 'light'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} className={seg(theme === t)} onClick={() => { setTheme(t); void profileRepo.update({ theme: t }); }}>
                {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-card border border-line bg-surface px-4 py-3" aria-label="Install on iPhone">
        <h2 className="text-sm text-muted">Install on your iPhone</h2>
        {isInstalled() ? (
          <p className="mt-1 text-sm">Forge is installed and running from the Home Screen. It works offline.</p>
        ) : (
          <ol className="mt-1 list-decimal pl-5 text-sm">
            <li>Open this page in Safari.</li>
            <li>Tap the Share button.</li>
            <li>Choose Add to Home Screen, then Add.</li>
          </ol>
        )}
        <p className="mt-2 text-xs text-muted">Installing also stops Safari from clearing your data after a few weeks of inactivity. Your workouts live only on this device, so keep exporting backups from Train.</p>
      </section>

      <p className="text-xs text-muted">Plate sizes, bar weight and equipment are in Coach → Training profile. Backup and restore are in Train.</p>
    </div>
  );
}
