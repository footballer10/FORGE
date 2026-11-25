import { describe, expect, it } from 'vitest';
import { liftSummary } from './liftSummary';

const p = (date: string, e1rm: number) => ({ date, e1rm });

describe('liftSummary', () => {
  const today = '2026-11-24';
  it('is undefined with no history', () => {
    expect(liftSummary([], today)).toBeUndefined();
  });
  it('uses the best e1RM of the last 4 weeks and the change vs the 4 weeks before', () => {
    const s = [p('2026-09-20T10:00:00', 200), p('2026-10-15T10:00:00', 210), p('2026-11-10T10:00:00', 215), p('2026-11-20T10:00:00', 220)];
    expect(liftSummary(s, today)).toEqual({ current: 220, change: 10, stale: false });
  });
  it('omits the change when the earlier window is empty', () => {
    expect(liftSummary([p('2026-11-20T10:00:00', 220)], today)).toEqual({ current: 220, stale: false });
  });
  it('falls back to the latest session, flagged stale, after a lay-off', () => {
    expect(liftSummary([p('2026-08-01T10:00:00', 180), p('2026-09-01T10:00:00', 190)], today)).toEqual({ current: 190, stale: true });
  });
  it('can be negative', () => {
    expect(liftSummary([p('2026-10-20T10:00:00', 230), p('2026-11-20T10:00:00', 225)], today)?.change).toBe(-5);
  });
});
