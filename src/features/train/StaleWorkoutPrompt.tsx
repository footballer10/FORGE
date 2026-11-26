import { TrapFocus } from '../../components/TrapFocus';
import { useUi } from '../../app/uiStore';
import { useWorkout } from './workoutStore';

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Asks what to do with a workout left open for hours, instead of silently showing it as in progress. */
export function StaleWorkoutPrompt() {
  const stale = useWorkout((s) => s.staleWorkout);
  const hasActive = useWorkout((s) => !!s.workout);
  if (!stale || hasActive) return null;
  const { resumeStale, finishStale, discardStale } = useWorkout.getState();
  return (
    <TrapFocus role="dialog" aria-modal="true" aria-label="Unfinished workout" className="fixed inset-0 z-50 flex items-end bg-black/60">
      <div className="pb-safe w-full rounded-t-card border-t border-line bg-surface p-4">
        <h2 className="text-2xl uppercase">Unfinished workout</h2>
        <p className="mt-1 text-base">{stale.name}</p>
        <p className="text-sm text-muted">
          Started {when(stale.startedAt)} · last used {when(stale.lastActivity)} · {stale.completedSets} {stale.completedSets === 1 ? 'set' : 'sets'} logged
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={() => void resumeStale().then(() => useUi.getState().setTab('train'))} className="num min-h-[56px] rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">Resume</button>
          {stale.completedSets > 0 && (
            <button type="button" onClick={() => void finishStale()} className="min-h-tap rounded-card border border-line px-4 text-base">Finish and save {stale.completedSets} {stale.completedSets === 1 ? 'set' : 'sets'}</button>
          )}
          <button type="button" onClick={() => void discardStale()} className="min-h-tap rounded-card border border-line px-4 text-base text-muted">Discard (moves to trash)</button>
        </div>
      </div>
    </TrapFocus>
  );
}
