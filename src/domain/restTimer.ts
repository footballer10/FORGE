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
export function restSecondsFor(exercise: Pick<Exercise, 'defaultRestSec'>, setType: SetType, override?: number): number {
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
