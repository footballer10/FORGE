/**
 * What to do with unfinished workouts when the app starts (pure). A workout left open for hours (closed app,
 * an undone discard, an old copy that came back through a restore or sync) must not pop up as "in progress".
 */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

export interface OpenWorkout {
  id: string;
  /** Latest of start, last change to the workout and last change to any of its sets (ms). */
  lastActivityMs: number;
  completedSets: number;
}

export interface Triage {
  /** Open straight into this one: it was used in the last 3 hours. */
  resume?: string;
  /** Ask the user (Resume / Finish / Discard): the newest one, but idle for longer. */
  ask?: string;
  /** Older extra open workouts: finish those with logged sets at their last activity, discard empty ones. */
  close: { id: string; action: 'finish' | 'discard'; endedAtMs: number }[];
}

export function triageOpenWorkouts(open: readonly OpenWorkout[], nowMs: number, staleMs = STALE_AFTER_MS): Triage {
  const sorted = [...open].sort((a, b) => b.lastActivityMs - a.lastActivityMs);
  const [newest, ...older] = sorted;
  const close = older.map((w) => ({ id: w.id, action: w.completedSets > 0 ? ('finish' as const) : ('discard' as const), endedAtMs: w.lastActivityMs }));
  if (!newest) return { close };
  return nowMs - newest.lastActivityMs <= staleMs ? { resume: newest.id, close } : { ask: newest.id, close };
}
