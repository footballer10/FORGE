import { useEffect, useState } from 'react';
import { useUi } from '../../app/uiStore';
import { profileRepo } from '../../db/repositories';
import { convertWeight } from '../../domain/units';
import { E1RM_FORMULAS, formulaInfo } from '../../domain/e1rm';
import { defaultEquipment, parseDays, platesText, withBarAndPlates } from '../../domain/profileForm';
import type { E1rmFormula, LengthUnit, Profile, WeightUnit } from '../../domain/types';
import { MenuRow } from '../../components/SubScreen';
import { ClaudeScreen } from '../coach/ClaudeScreen';
import { coachRepo } from '../../db/repositories';
import { useWorkout } from '../train/workoutStore';
import { disablePushAlerts, enablePushAlerts, pushAlertsOn, scheduleRestPush } from '../train/restPush';
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
  const [pushOn, setPushOn] = useState(pushAlertsOn);
  const [pushNote, setPushNote] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [page, setPage] = useState<'main' | 'claude'>(() => {
    const want = useUi.getState().settingsPage;
    if (want) useUi.getState().setSettingsPage(null);
    return want ?? 'main';
  });
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    void profileRepo.get().then((x) => {
      setP(x);
      setDays(String(x.plannedDaysPerWeek));
    });
  }, []);

  useEffect(() => {
    if (page === 'main') void coachRepo.pendingProposals().then((x) => setWaiting(x.length)).catch(() => undefined);
  }, [page]);

  if (!p) return null;
  if (page === 'claude') return <ClaudeScreen onBack={() => setPage('main')} />;

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
        <MenuRow title="Claude" detail={waiting ? `${waiting} ${waiting === 1 ? 'proposal' : 'proposals'} waiting for you` : 'Connection, proposals, training profile'} onClick={() => setPage('claude')} />
        {([
          ['library', 'Exercise library', 'Browse, edit or add exercises'],
          ['review', 'Review exercise muscles', 'Fill in muscles for imported exercises'],
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
        <label className={`${row} border-t border-line`}>
          <span>Fill warm-up weights automatically</span>
          <input type="checkbox" className="h-6 w-6" checked={p.autoWarmups !== false} onChange={(e) => { void useWorkout.getState().setAutoWarmup(e.target.checked); setP({ ...p, autoWarmups: e.target.checked }); }} />
        </label>
        <p className="pb-3 text-xs text-muted">
          Warm-ups follow your first working weight, by how many warm-up sets the exercise has: 1 set 60%; 2 sets 65%, 85%; 3 sets bar, 70%, 85%;
          4 sets bar, 60%, 75%, 90%; 5 sets bar, 40%, 55%, 75%, 90%. Each is rounded to the easiest load near it (fewest plates, no 2.5s if
          avoidable). A warm-up you type yourself, or have done, is never changed.
        </p>
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
          Test: bell in 10 seconds
        </button>
        <p className="mt-2 text-xs text-muted">A boxing bell rings when every rest ends while Forge is open. With the screen locked, iPhone silences "Sound" mode; "Loud" keeps ringing when locked but pauses your music during rests. For alerts with Forge closed or the phone locked, turn on lock-screen alerts below.</p>
      </section>

      <section className="rounded-card border border-line bg-surface px-4 py-3" aria-label="Lock-screen rest alerts">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span>Lock-screen rest alerts</span>
          <button
            type="button"
            aria-pressed={pushOn}
            disabled={pushBusy}
            className={seg(pushOn)}
            onClick={async () => {
              setPushBusy(true);
              setPushNote('');
              if (pushOn) {
                await disablePushAlerts();
                setPushOn(false);
              } else {
                const r = await enablePushAlerts();
                setPushOn(r.ok);
                setPushNote(r.message);
              }
              setPushBusy(false);
            }}
          >
            {pushOn ? 'On' : 'Off'}
          </button>
        </div>
        {pushNote && <p role="status" className="mt-2 text-sm">{pushNote}</p>}
        <button type="button" disabled={!pushOn} onClick={() => { void scheduleRestPush(new Date(Date.now() + 10_000).toISOString()); setPushNote('Sent. Lock your phone now; a notification should arrive in about 10 seconds.'); }} className="mt-2 min-h-tap rounded-card border border-line px-4 text-sm text-fg disabled:opacity-50">
          Test: alert in 10 seconds
        </button>
        <p className="mt-2 text-xs text-muted">Your own Cloudflare Worker sends a notification when the rest ends, even with Forge closed. It needs Cloud sync, the Worker set up for alerts (docs/connector.md) and Forge installed on the Home Screen. The notification uses the iPhone's standard sound, not the bell.</p>
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
        <p className="mt-2 text-xs text-muted">Installing also stops Safari from clearing your data after a few weeks of inactivity. Removing Forge from the Home Screen deletes its data on this phone. With Cloud sync on, everything except photos is also in your own Cloudflare account: save the restore code (Settings → Claude → Cloud sync) and paste it on the welcome screen after reinstalling. Backups are a second copy.</p>
      </section>

      <BarAndPlates profile={p} onSave={save} />

      <p className="text-xs text-muted">Other equipment (dumbbell limits, extra places) is in Coach → Training profile.</p>
    </div>
  );
}

/** Bar weight and plate sizes for the plate calculator, stored on the default equipment profile (profile unit). */
function BarAndPlates({ profile, onSave }: { profile: Profile; onSave: (patch: Partial<Profile>) => Promise<void> }) {
  const eq = defaultEquipment(profile.equipmentProfiles, profile.defaultEquipmentProfileId);
  const unit = profile.weightUnit;
  const inUnit = (w?: { value: number; unit: WeightUnit }) => (w ? Math.round(convertWeight(w.value, w.unit, unit) * 100) / 100 : undefined);
  const [bar, setBar] = useState(String(inUnit(eq?.barWeight) ?? ''));
  const [plates, setPlates] = useState(platesText(eq?.plates?.map((x) => ({ value: inUnit(x)!, unit }))));
  const [saved, setSaved] = useState(false);
  async function save() {
    await onSave(withBarAndPlates(profile.equipmentProfiles, profile.defaultEquipmentProfileId, bar, plates, unit, () => crypto.randomUUID()));
    setSaved(true);
  }
  const box = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base';
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4" aria-label="Bar and plates">
      <h2 className="text-lg font-medium">Bar and plates</h2>
      <p className="text-sm text-muted">Used by the plate calculator and warm-ups{eq ? ` (${eq.name})` : ''}. Empty falls back to a 45 lb bar and standard plates.</p>
      <label className="text-sm text-muted">Bar ({unit})
        <input className={`${box} num`} inputMode="decimal" value={bar} onChange={(e) => { setBar(e.target.value); setSaved(false); }} />
      </label>
      <label className="text-sm text-muted">Plates per side ({unit}, comma separated)
        <input className={`${box} num`} value={plates} onChange={(e) => { setPlates(e.target.value); setSaved(false); }} />
      </label>
      <button type="button" onClick={() => void save()} className="min-h-tap rounded-card border border-line px-4">Save bar and plates</button>
      {saved && <p role="status" className="text-sm text-muted">Saved.</p>}
    </section>
  );
}
