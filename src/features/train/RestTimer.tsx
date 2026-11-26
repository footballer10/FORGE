import { useEffect, useState } from 'react';
import { formatClock, isStale, remainingSec } from '../../domain/restTimer';
import { ringIfSilent, syncRestAudio } from './restAudio';
import { useWorkout } from './workoutStore';

const BUZZ = [200, 100, 200];

/**
 * Rest countdown bar, shown above the tab bar on every tab while a rest is running.
 * The display re-renders on an interval but the value is always derived from the stored `endsAt`
 * (CLAUDE.md: timers are timestamp-based), so a locked screen cannot make it drift.
 */
export function RestTimer() {
  const endsAt = useWorkout((s) => s.restEndsAt);
  const total = useWorkout((s) => s.restTotalSec);
  const adjustRest = useWorkout((s) => s.adjustRest);
  const skipRest = useWorkout((s) => s.skipRest);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const sync = () => setNow(Date.now());
    sync();
    const t = setInterval(sync, 250);
    document.addEventListener('visibilitychange', sync);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [endsAt]);

  // Keep the alarm audio in step with the timer (new rest, ±15 s, skip). It beeps even with the screen locked.
  useEffect(() => {
    syncRestAudio(endsAt);
  }, [endsAt]);

  // Finished: buzz (only if it just ended, not when waking up long after) and clear.
  useEffect(() => {
    if (!endsAt || now < Date.parse(endsAt)) return;
    if (!isStale(endsAt, now)) {
      navigator.vibrate?.(BUZZ);
      if (document.visibilityState === 'visible') ringIfSilent();
    }
    void skipRest();
  }, [now, endsAt, skipRest]);

  if (!endsAt) return null;
  const left = remainingSec(endsAt, now);
  const pct = total ? Math.min(100, Math.max(0, (left / total) * 100)) : 0;

  return (
    <div role="timer" aria-label="Rest timer" className="px-safe border-t border-line bg-surface">
      <div className="h-1 bg-surface-2">
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2 px-4 py-1">
        <span className="text-xs uppercase text-muted">Rest</span>
        <span className="num flex-1 text-3xl tabular-nums">{formatClock(left)}</span>
        <button type="button" aria-label="15 seconds less" className="num min-h-tap min-w-tap rounded-card border border-line text-base" onClick={() => void adjustRest(-15)}>−15</button>
        <button type="button" aria-label="15 seconds more" className="num min-h-tap min-w-tap rounded-card border border-line text-base" onClick={() => void adjustRest(15)}>+15</button>
        <button type="button" className="min-h-tap min-w-tap px-2 text-sm text-muted" onClick={() => void skipRest()}>Skip</button>
      </div>
    </div>
  );
}
