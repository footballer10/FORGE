import { describe, expect, it } from 'vitest';
import type { ImportBatch } from './types';
import { STRONG_NAME_HINTS, importedStrongNames, resolveStrongName, strongNameMap } from './strongNames';

const batch = (importedAt: string, rules: Record<string, string>, deletedAt?: string): Pick<ImportBatch, 'importedAt' | 'conventions' | 'deletedAt'> => ({
  importedAt,
  ...(deletedAt ? { deletedAt } : {}),
  conventions: { defaultUnit: 'lb', exerciseRules: Object.fromEntries(Object.entries(rules).map(([n, id]) => [n, { exerciseId: id }])) },
});

describe('importedStrongNames', () => {
  it('maps exercise ids back to the exact Strong name, earliest import first', () => {
    const m = importedStrongNames([batch('2026-02-01T00:00:00Z', { 'Back Squat': 'sq' }), batch('2026-01-01T00:00:00Z', { 'Squat (Barbell)': 'sq', 'Pull Up': 'pu' })]);
    expect(m.get('sq')).toBe('Squat (Barbell)');
    expect(m.get('pu')).toBe('Pull Up');
  });
  it('ignores trashed imports', () => {
    expect(importedStrongNames([batch('2026-01-01T00:00:00Z', { X: 'a' }, '2026-03-01T00:00:00Z')]).size).toBe(0);
  });
});

describe('resolveStrongName', () => {
  const imported = new Map([['sq', 'Squat (Barbell)']]);
  it('prefers a typed name, then the import, then the hint table, then the Forge name as a guess', () => {
    expect(resolveStrongName({ id: 'sq', name: 'Barbell Squat', strongName: ' My Squat ' }, imported)).toEqual({ name: 'My Squat', source: 'set' });
    expect(resolveStrongName({ id: 'sq', name: 'Barbell Squat' }, imported)).toEqual({ name: 'Squat (Barbell)', source: 'import' });
    expect(resolveStrongName({ id: 'x', name: 'barbell deadlift' }, imported)).toEqual({ name: 'Deadlift (Barbell)', source: 'hint' });
    expect(resolveStrongName({ id: 'y', name: 'Zercher Squat' }, imported)).toEqual({ name: 'Zercher Squat', source: 'guess' });
  });
  it('covers the eighteen exercises in the A, B and C Day templates', () => {
    expect(Object.keys(STRONG_NAME_HINTS)).toHaveLength(18);
    expect(new Set(Object.values(STRONG_NAME_HINTS)).size).toBe(18);
  });
});

describe('strongNameMap', () => {
  it('has a name for every exercise', () => {
    const m = strongNameMap([{ id: 'a', name: 'Butterfly' }, { id: 'b', name: 'Mystery' }], new Map());
    expect(m.get('a')).toBe('Chest Fly');
    expect(m.get('b')).toBe('Mystery');
  });
});
