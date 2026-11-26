import { describe, expect, it } from 'vitest';
import { rollingLevels, strengthIndex, weekEnds } from './strengthIndex';

const p = (date: string, e1rm: number) => ({ date: `${date}T17:00:00`, e1rm });

describe('strength index', () => {
  it('builds weekly dates ending today', () => {
    const w = weekEnds('2026-11-01', '2026-11-26');
    expect(w.at(-1)).toBe('2026-11-26');
    expect(w[0]! <= '2026-11-01').toBe(true);
    expect(w.every((d, i) => i === 0 || d > w[i - 1]!)).toBe(true);
  });

  it('uses the best of the last 4 weeks, holds it for a while, then drops it', () => {
    const ends = ['2026-01-07', '2026-01-14', '2026-02-11', '2026-05-20'];
    const levels = rollingLevels([p('2026-01-05', 200), p('2026-01-12', 190)], ends);
    expect(levels).toEqual([200, 200, 200, undefined]); // held 12 weeks after the last window, then gone
  });

  it('averages each lift against its own start, so 100 = where you began', () => {
    const lifts = new Map([
      ['squat', [p('2026-10-05', 200), p('2026-11-23', 220)]], // +10%
      ['curl', [p('2026-10-05', 30), p('2026-11-23', 30)]], // flat
    ]);
    const idx = strengthIndex(lifts, '2026-11-26');
    expect(idx[0]!.index).toBe(100);
    expect(idx.at(-1)).toMatchObject({ index: 105, lifts: 2 }); // (1.10 + 1.00) / 2
  });

  it('a lift added later starts at its own 100, so the line does not jump', () => {
    const lifts = new Map([
      ['squat', [p('2026-10-05', 200), p('2026-10-26', 200)]],
      ['bench', [p('2026-11-16', 150)]],
    ]);
    const idx = strengthIndex(lifts, '2026-11-26');
    expect(idx.every((x) => x.index === 100)).toBe(true);
    expect(idx.at(-1)!.lifts).toBe(2);
  });

  it('is empty with no data', () => {
    expect(strengthIndex(new Map(), '2026-11-26')).toEqual([]);
  });
});
