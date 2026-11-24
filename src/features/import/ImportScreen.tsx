import { useEffect, useMemo, useState } from 'react';
import { exerciseRepo, importer, newId, nowIso } from '../../db/repositories';
import { ensureLibrary } from '../../db/seedLibrary';
import {
  buildImport,
  findDuplicates,
  matchExercises,
  resolveExercises,
  summarizeExercises,
  type DumbbellConvention,
  type ExerciseMatch,
  type ImportChoices,
  type Resolution,
} from '../../domain/importPlan';
import { groupStrongWorkouts, parseStrongCsv, type ParsedWorkout } from '../../domain/strongParser';
import type { Exercise, ImportBatch, WeightUnit } from '../../domain/types';
import { ExerciseBrowser } from '../exercises/ExerciseBrowser';
import { labelFor } from '../exercises/options';

const field = 'min-h-tap w-full rounded-card border border-line bg-surface px-3 text-base text-fg';
const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

interface Loaded {
  fileName: string;
  workouts: ParsedWorkout[];
  matches: ExerciseMatch[];
  library: Exercise[];
  duplicates: Set<string>;
  ignoredRows: number;
  warnings: string[];
  fileUnit?: WeightUnit;
}

type Stage = { kind: 'pick' } | { kind: 'preview'; data: Loaded } | { kind: 'done'; batch: ImportBatch; created: number };

export function ImportScreen({ onBack }: { onBack: () => void }) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });

  return (
    <div className="flex min-h-full flex-col pb-6">
      <div className="flex items-center justify-between pb-3 pt-6">
        <h1 className="text-4xl uppercase">Import</h1>
        <button type="button" onClick={onBack} className="min-h-tap px-2 text-sm text-muted">
          Close
        </button>
      </div>
      {stage.kind === 'pick' && <PickFile onLoaded={(data) => setStage({ kind: 'preview', data })} />}
      {stage.kind === 'preview' && (
        <Preview data={stage.data} onCancel={() => setStage({ kind: 'pick' })} onDone={(batch, created) => setStage({ kind: 'done', batch, created })} />
      )}
      {stage.kind === 'done' && (
        <div className="flex flex-col gap-3">
          <div className="rounded-card border border-line bg-surface p-4">
            <h2 className="pb-1 text-2xl uppercase">Imported</h2>
            <p className="num text-base text-fg">
              {stage.batch.workoutCount} workouts{stage.created ? ` · ${stage.created} new exercises` : ''}
            </p>
            {stage.batch.duplicateCount > 0 && <p className="text-sm text-muted">{stage.batch.duplicateCount} workouts skipped as duplicates.</p>}
          </div>
          <button type="button" onClick={onBack} className="num min-h-[56px] rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">
            Done
          </button>
        </div>
      )}
      {stage.kind !== 'done' && <PastImports />}
    </div>
  );
}

function PickFile({ onLoaded }: { onLoaded: (d: Loaded) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    setError('');
    setBusy(true);
    try {
      const parsed = parseStrongCsv(await file.text());
      if ('error' in parsed) return setError(parsed.error);
      if (parsed.rows.length === 0) return setError('No sets found in this file.');
      await ensureLibrary().catch(() => undefined);
      const [library, existing] = await Promise.all([exerciseRepo.list(), importer.existingStarts()]);
      const workouts = groupStrongWorkouts(parsed.rows);
      onLoaded({
        fileName: file.name,
        workouts,
        matches: matchExercises(summarizeExercises(workouts), library),
        library,
        duplicates: findDuplicates(workouts, existing),
        ignoredRows: parsed.ignoredRows,
        warnings: parsed.warnings,
        ...(parsed.fileWeightUnit ? { fileUnit: parsed.fileWeightUnit } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Choose the CSV exported from Strong (Settings → Export Strong Data). You will see exactly what will be created before anything is saved.
      </p>
      <label className="num flex min-h-[56px] cursor-pointer items-center justify-center rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">
        {busy ? 'Reading…' : 'Choose Strong CSV'}
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(f);
          }}
        />
      </label>
      {error && <p role="alert" className="text-sm text-fg">{error}</p>}
    </div>
  );
}

function Preview({ data, onCancel, onDone }: { data: Loaded; onCancel: () => void; onDone: (b: ImportBatch, created: number) => void }) {
  const [defaultUnit, setDefaultUnit] = useState<WeightUnit>('lb');
  const [dumbbellConvention, setDumbbellConvention] = useState<DumbbellConvention>('pairTotal');
  const [resolutions, setResolutions] = useState<Record<string, Resolution>>({});
  const [overrides, setOverrides] = useState<Record<string, DumbbellConvention>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const choices: ImportChoices = useMemo(
    () => ({ defaultUnit, dumbbellConvention, resolutions, dumbbellOverrides: overrides }),
    [defaultUnit, dumbbellConvention, resolutions, overrides],
  );
  const resolved = useMemo(
    () => resolveExercises(data.matches, data.library, choices, nowIso(), newId).resolved,
    [data, choices],
  );

  const kept = data.workouts.filter((w) => !data.duplicates.has(w.key));
  const keptNames = new Set(kept.flatMap((w) => w.exercises.map((e) => e.name)));
  const matches = data.matches.filter((m) => keptNames.has(m.source.name));
  const setCount = kept.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.rows.length, 0), 0);
  const first = data.workouts[0]?.startedAt;
  const last = data.workouts[data.workouts.length - 1]?.startedAt;

  if (picking) {
    return (
      <ExerciseBrowser
        title="Map to exercise"
        onSelect={(e) => {
          setResolutions((r) => ({ ...r, [picking]: { kind: 'map', exerciseId: e.id } }));
          setPicking(null);
        }}
        onCreate={() => {
          setResolutions((r) => ({ ...r, [picking]: { kind: 'create' } }));
          setPicking(null);
        }}
        onBack={() => setPicking(null)}
      />
    );
  }

  const commit = async () => {
    setSaving(true);
    setError('');
    try {
      const built = buildImport({
        fileName: data.fileName,
        workouts: data.workouts,
        matches: data.matches,
        library: data.library,
        choices,
        duplicates: data.duplicates,
        ignoredRows: data.ignoredRows,
        now: nowIso(),
        newId,
      });
      await importer.commit(built);
      onDone(built.batch, built.newExercises.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed. Nothing was saved.');
      setSaving(false);
    }
  };

  const unit = data.fileUnit ?? defaultUnit;
  const anyDumbbell = matches.some((m) => resolved.get(m.source.name)?.dumbbell);

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-line bg-surface p-4">
        <h2 className="pb-1 text-2xl uppercase">{data.fileName}</h2>
        <p className="num text-base text-fg">
          {data.workouts.length} workouts · {data.workouts.reduce((n, w) => n + w.exercises.reduce((m, e) => m + e.rows.length, 0), 0)} sets
        </p>
        {first && last && <p className="text-sm text-muted">{dateFmt.format(new Date(first))} to {dateFmt.format(new Date(last))}</p>}
        {data.duplicates.size > 0 && (
          <p className="pt-1 text-sm text-fg">
            {data.duplicates.size} workouts already exist (same start time) and will be skipped. {kept.length} will be imported.
          </p>
        )}
        {data.ignoredRows > 0 && <p className="text-sm text-muted">{data.ignoredRows} rest-timer or unreadable rows ignored.</p>}
        {data.warnings.slice(0, 3).map((w) => (
          <p key={w} className="text-sm text-muted">{w}</p>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        {data.fileUnit ? (
          <p className="text-sm text-muted">The file states weights in {data.fileUnit}.</p>
        ) : (
          <label className="flex flex-col gap-1 text-sm text-muted">
            The file does not say which unit it uses
            <select aria-label="Weight unit" value={defaultUnit} onChange={(e) => setDefaultUnit(e.target.value as WeightUnit)} className={field}>
              <option value="lb">Weights are in lb</option>
              <option value="kg">Weights are in kg</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm text-muted">
          Dumbbell weights in Strong
          <select
            aria-label="Dumbbell convention"
            value={dumbbellConvention}
            onChange={(e) => setDumbbellConvention(e.target.value as DumbbellConvention)}
            className={field}
          >
            <option value="pairTotal">Pair total: halve to one dumbbell (default)</option>
            <option value="perImplement">One dumbbell: keep as logged</option>
          </select>
        </label>
        {anyDumbbell && (
          <p className="text-sm text-muted">
            Example: a logged {60} {unit} becomes {dumbbellConvention === 'pairTotal' ? 30 : 60} {unit} per dumbbell. Change it per exercise below.
          </p>
        )}
      </section>

      <section>
        <h2 className="pb-2 text-2xl uppercase">Exercises ({matches.length})</h2>
        <ul className="flex flex-col gap-2">
          {matches.map((m) => {
            const r = resolved.get(m.source.name)!;
            const target = r.isNew ? undefined : data.library.find((e) => e.id === r.exerciseId);
            const choice = resolutions[m.source.name];
            return (
              <li key={m.source.name} className="rounded-card border border-line bg-surface p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base text-fg">{m.source.name}</span>
                  <span className="num shrink-0 text-xs text-muted">{m.source.setCount} sets</span>
                </div>
                <p className="text-sm text-muted">
                  {target
                    ? `Maps to ${target.name}${m.ambiguous && !choice ? ` (${m.suggestions.length + 1} library exercises share this name, check it)` : ''}`
                    : `New exercise · ${labelFor(m.draft.equipment)} · ${m.draft.loadModel}`}
                </p>
                <select
                  aria-label={`Match for ${m.source.name}`}
                  value={choice?.kind === 'map' ? `map:${choice.exerciseId}` : choice?.kind === 'create' ? 'create' : m.exact ? `map:${m.exact.id}` : 'create'}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === 'pick') return setPicking(m.source.name);
                    setResolutions((prev) => ({
                      ...prev,
                      [m.source.name]: v === 'create' ? { kind: 'create' } : { kind: 'map', exerciseId: v.slice(4) },
                    }));
                  }}
                  className={`${field} mt-2`}
                >
                  <option value="create">Create new exercise</option>
                  {m.exact && <option value={`map:${m.exact.id}`}>Match: {m.exact.name}</option>}
                  {m.suggestions.map((s) => (
                    <option key={s.id} value={`map:${s.id}`}>{m.ambiguous ? 'Alternative' : 'Map to'}: {s.name}</option>
                  ))}
                  {choice?.kind === 'map' && !m.exact && !m.suggestions.some((s) => s.id === choice.exerciseId) && target && (
                    <option value={`map:${target.id}`}>Map to: {target.name}</option>
                  )}
                  <option value="pick">Choose another exercise…</option>
                </select>
                {r.dumbbell && (
                  <select
                    aria-label={`Dumbbell convention for ${m.source.name}`}
                    value={overrides[m.source.name] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value as DumbbellConvention | '';
                      setOverrides((prev) => {
                        const { [m.source.name]: _drop, ...rest } = prev;
                        return v ? { ...rest, [m.source.name]: v } : rest;
                      });
                    }}
                    className={`${field} mt-2`}
                  >
                    <option value="">Dumbbell: use the setting above</option>
                    <option value="pairTotal">Dumbbell: pair total (halve)</option>
                    <option value="perImplement">Dumbbell: one dumbbell (keep)</option>
                  </select>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {error && <p role="alert" className="text-sm text-fg">{error}</p>}
      <div className="sticky bottom-0 flex flex-col gap-2 bg-bg pt-2">
        <button
          type="button"
          disabled={saving || kept.length === 0}
          onClick={() => void commit()}
          className="num min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-40"
        >
          {saving ? 'Importing…' : kept.length === 0 ? 'Nothing new to import' : `Import ${kept.length} workouts · ${setCount} sets`}
        </button>
        <button type="button" onClick={onCancel} className="min-h-tap text-sm text-muted">
          Choose a different file
        </button>
      </div>
    </div>
  );
}

/** Earlier imports: switch a dumbbell exercise between pair total and one dumbbell without re-importing. */
function PastImports() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState('');

  const load = async () => {
    const [b, ex] = await Promise.all([importer.listBatches(), exerciseRepo.list()]);
    setBatches(b);
    setNames(new Map(ex.map((e) => [e.id, e.name])));
  };
  useEffect(() => {
    void load();
  }, []);

  const withDumbbells = batches.filter((b) => Object.values(b.conventions.exerciseRules).some((r) => r.dumbbellConvention));
  if (batches.length === 0) return null;

  return (
    <section className="pt-6">
      <h2 className="pb-2 text-2xl uppercase">Past imports</h2>
      <ul className="flex flex-col gap-2">
        {batches.map((b) => {
          const dumbbells = Object.entries(b.conventions.exerciseRules).filter(([, r]) => r.dumbbellConvention);
          return (
            <li key={b.id} className="rounded-card border border-line bg-surface p-3">
              <p className="text-base text-fg">{b.fileName}</p>
              <p className="num text-sm text-muted">
                {dateFmt.format(new Date(b.importedAt))} · {b.workoutCount} workouts{b.duplicateCount ? ` · ${b.duplicateCount} skipped` : ''}
              </p>
              {dumbbells.map(([src, r]) => (
                <label key={src} className="flex min-h-tap items-center justify-between gap-2 text-sm text-fg">
                  <span className="truncate">{names.get(r.exerciseId) ?? src}</span>
                  <select
                    aria-label={`Convention for ${src}`}
                    value={r.dumbbellConvention}
                    disabled={busy === `${b.id}${src}`}
                    onChange={(e) => {
                      setBusy(`${b.id}${src}`);
                      void importer.reapplyConvention(b.id, src, e.target.value as DumbbellConvention).then(load).finally(() => setBusy(''));
                    }}
                    className="min-h-tap rounded-card border border-line bg-surface px-2 text-base text-fg"
                  >
                    <option value="pairTotal">Pair total (halved)</option>
                    <option value="perImplement">One dumbbell</option>
                  </select>
                </label>
              ))}
            </li>
          );
        })}
      </ul>
      {withDumbbells.length > 0 && <p className="pt-2 text-xs text-muted">Changing a convention rewrites that exercise's weights in this import from the original rows.</p>}
    </section>
  );
}
