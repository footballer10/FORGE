import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, buildExport, parseExport, planMerge } from './backup';

const row = (id: string, updatedAt: string, extra: object = {}) => ({ id, createdAt: updatedAt, updatedAt, ...extra });

describe('buildExport / parseExport', () => {
  it('round-trips and records counts for every table', () => {
    const file = buildExport({ workouts: [row('w1', '2026-01-01T00:00:00Z')] }, '2026-02-01T00:00:00Z');
    expect(file.counts.workouts).toBe(1);
    expect(Object.keys(file.counts)).toEqual([...EXPORT_TABLES]);
    const parsed = parseExport(JSON.stringify(file));
    expect('file' in parsed && parsed.file.tables.workouts).toHaveLength(1);
  });

  it('rejects bad input with a clear message', () => {
    expect(parseExport('nope')).toEqual({ error: 'This is not a JSON file.' });
    expect(parseExport('{"a":1}')).toHaveProperty('error', expect.stringMatching(/not a Forge backup/));
    expect(parseExport(JSON.stringify({ format: 'forge-export', version: 99, tables: {} }))).toHaveProperty('error', expect.stringMatching(/version 99/));
    expect(parseExport(JSON.stringify({ format: 'forge-export', version: 1, tables: { sets: [{ x: 1 }] } }))).toHaveProperty('error', expect.stringMatching(/without an id/));
  });
});

describe('planMerge', () => {
  it('adds missing rows, updates older local rows, keeps newer or equal ones', () => {
    const file = buildExport(
      { workouts: [row('new', '2026-01-01'), row('older-local', '2026-03-01'), row('newer-local', '2026-01-01'), row('same', '2026-01-01')] },
      'x',
    );
    const local = new Map<string, Record<string, unknown>>([
      ['older-local', row('older-local', '2026-02-01')],
      ['newer-local', row('newer-local', '2026-02-01')],
      ['same', row('same', '2026-01-01')],
    ]);
    const [plan] = planMerge(file, { workouts: local });
    expect(plan!.add.map((r) => r.id)).toEqual(['new']);
    expect(plan!.update.map((r) => r.id)).toEqual(['older-local']);
    expect(plan!.keep).toBe(2);
  });

  it('skips empty tables', () => {
    expect(planMerge(buildExport({}, 'x'), {})).toEqual([]);
  });
});
