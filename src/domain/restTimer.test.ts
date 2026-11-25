import { describe, expect, it } from 'vitest';
import { adjustRest, formatClock, formatRest, isStale, parseRest, remainingSec, restEndsAt, restSecondsFor } from './restTimer';

const T0 = Date.parse('2026-01-05T10:00:00.000Z');

describe('rest timer', () => {
  it('uses the exercise rest; warm-ups also rest, capped at 60 s', () => {
    expect(restSecondsFor({ defaultRestSec: 120 }, 'working')).toBe(120);
    expect(restSecondsFor({ defaultRestSec: 90 }, 'failure')).toBe(90);
    expect(restSecondsFor({ defaultRestSec: 120 }, 'warmup')).toBe(60);
    expect(restSecondsFor({ defaultRestSec: 45 }, 'warmup')).toBe(45);
    expect(restSecondsFor({ defaultRestSec: 0 }, 'warmup')).toBe(0);
    expect(restSecondsFor({ defaultRestSec: 120 }, 'warmup', 30)).toBe(30);
  });

  it('computes remaining time from the absolute end, so it survives a lock', () => {
    const end = restEndsAt(T0, 90);
    expect(end).toBe('2026-01-05T10:01:30.000Z');
    expect(remainingSec(end, T0)).toBe(90);
    expect(remainingSec(end, T0 + 60_000)).toBe(30); // phone locked for a minute
    expect(remainingSec(end, T0 + 89_100)).toBe(1); // rounds up
    expect(remainingSec(end, T0 + 200_000)).toBe(0); // never negative
  });

  it('adjusts by ±15 s and never goes before now', () => {
    const end = restEndsAt(T0, 60);
    expect(remainingSec(adjustRest(end, 15, T0), T0)).toBe(75);
    expect(remainingSec(adjustRest(end, -15, T0), T0)).toBe(45);
    expect(remainingSec(adjustRest(end, -500, T0), T0)).toBe(0);
  });

  it('treats a long-expired timer as stale (no late buzz on resume)', () => {
    const end = restEndsAt(T0, 60);
    expect(isStale(end, T0 + 61_000)).toBe(false);
    expect(isStale(end, T0 + 120_000)).toBe(true);
  });

  it('formats clock', () => {
    expect(formatClock(95)).toBe('1:35');
    expect(formatClock(5)).toBe('0:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('per-set rest', () => {
  it('a rest typed for the set wins over the exercise rest, warm-ups included', () => {
    expect(restSecondsFor({ defaultRestSec: 120 }, 'working', undefined, 180)).toBe(180);
    expect(restSecondsFor({ defaultRestSec: 120 }, 'warmup', undefined, 90)).toBe(90);
    expect(restSecondsFor({ defaultRestSec: 120 }, 'working', 100, 0)).toBe(0);
    expect(restSecondsFor({ defaultRestSec: 120 }, 'working', 100)).toBe(100);
  });
  it('parses m:ss and seconds, blank is undefined, junk is null', () => {
    expect(parseRest('1:30')).toBe(90);
    expect(parseRest('3:00')).toBe(180);
    expect(parseRest('90')).toBe(90);
    expect(parseRest(' 0:45 ')).toBe(45);
    expect(parseRest('')).toBeUndefined();
    expect(parseRest('1:7')).toBeNull();
    expect(parseRest('1:75')).toBeNull();
    expect(parseRest('abc')).toBeNull();
    expect(parseRest('31:00')).toBeNull();
    expect(parseRest('99999')).toBeNull();
  });
  it('formats as m:ss', () => {
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(60)).toBe('1:00');
    expect(formatRest(45)).toBe('0:45');
    expect(formatRest(180)).toBe('3:00');
  });
});
