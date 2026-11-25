import { describe, expect, it } from 'vitest';
import { parseWorkoutDetails, toLocalInput } from './workoutDetails';

const now = new Date(2026, 10, 25, 12, 0);

describe('parseWorkoutDetails', () => {
  it('accepts a valid edit and returns ISO times', () => {
    const r = parseWorkoutDetails('  Push  ', '2026-11-24T18:00', '2026-11-24T19:05', now);
    expect(r).toMatchObject({ ok: true, name: 'Push' });
    if (r.ok) expect(new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()).toBe(65 * 60_000);
  });
  it('rejects empty name, bad times, end before start and future end', () => {
    expect(parseWorkoutDetails(' ', '2026-11-24T18:00', '2026-11-24T19:00', now)).toMatchObject({ ok: false });
    expect(parseWorkoutDetails('A', '', '2026-11-24T19:00', now)).toMatchObject({ ok: false });
    expect(parseWorkoutDetails('A', '2026-11-24T19:00', '2026-11-24T19:00', now)).toMatchObject({ ok: false });
    expect(parseWorkoutDetails('A', '2026-11-25T10:00', '2026-11-26T10:00', now)).toMatchObject({ ok: false });
  });
  it('round-trips through the local input format', () => {
    expect(toLocalInput(new Date(2026, 10, 24, 7, 5).toISOString())).toBe('2026-11-24T07:05');
  });
});
