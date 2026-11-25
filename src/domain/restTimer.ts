import type { Exercise, SetType } from './types';

/**
 * Rest timer maths. The timer is an absolute end time (`endsAt`), never a counter, so it
 * survives screen lock, backgrounding and reloads: remaining time is always `endsAt - now`.
 */

/** Warm-up sets rest for at most this long (shorter exercise rests win). */
export const WARMUP_REST_SEC = 60;

/**
 * How long to rest after a completed set. Every set starts a timer, warm-ups included;
 * warm-ups use the exercise's rest capped at WARMUP_REST_SEC. 0 only when the exercise rest is 0.
 */
export function restSecondsFor(exercise: Pick<Exercise, 'defaultRestSec'>, setType: SetType, override?: number, setRest?: number): number {
  // A rest typed for this exact set (routine or program) always wins, warm-ups included.
  if (setRest !== undefined) return Math.max(0, Math.round(setRest));
  const base = Math.max(0, Math.round(override ?? exercise.defaultRestSec));
  return setType === 'warmup' ? Math.min(base, WARMUP_REST_SEC) : base;
}

export function restEndsAt(nowMs: number, seconds: number): string {
  return new Date(nowMs + seconds * 1000).toISOString();
}

/** Whole seconds left, rounded up so the display reads 0:01 until the very end. Never negative. */
export function remainingSec(endsAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - nowMs) / 1000));
}

/** Move the end time by `deltaSec` (±15 s buttons). Result is never earlier than `nowMs`. */
export function adjustRest(endsAt: string, deltaSec: number, nowMs: number): string {
  return new Date(Math.max(nowMs, Date.parse(endsAt) + deltaSec * 1000)).toISOString();
}

/**
 * A timer that ended while the app was away should not buzz late on resume.
 * Returns true when it expired more than `graceMs` ago.
 */
export function isStale(endsAt: string, nowMs: number, graceMs = 3000): boolean {
  return nowMs - Date.parse(endsAt) > graceMs;
}

/** 95 -> "1:35". */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const MAX_REST_SEC = 1800;

/** 90 -> "1:30", 45 -> "0:45". */
export const formatRest = formatClock;

/**
 * Read a typed rest: "1:30", "90" (seconds) or blank. Returns `undefined` for blank and `null` for text
 * that is not a usable rest (so the editor can tell "cleared" from "mistyped").
 */
export function parseRest(text: string): number | undefined | null {
  const t = text.trim();
  if (!t) return undefined;
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  const sec = m ? Number(m[1]) * 60 + Number(m[2]) : /^\d{1,4}$/.test(t) ? Number(t) : null;
  return sec === null || sec > MAX_REST_SEC ? null : sec;
}
