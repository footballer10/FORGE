import { describe, expect, it } from 'vitest';
import type { BodyMetric, LoadModel, SetEntry } from './types';
import { bodyweightOn, displayWeight, effectiveLoad, isAnalyticSet, setVolume } from './load';

const done = '2026-11-24T17:00:00.000Z';
const set = (p: Partial<SetEntry>): Pick<SetEntry, 'type' | 'weight' | 'unit' | 'reps' | 'completedAt'> => ({
  type: 'working',
  unit: 'lb',
  completedAt: done,
  ...p,
});
const ex = (loadModel: LoadModel) => ({ loadModel });
const bw = { value: 180, unit: 'lb' as const };

describe('isAnalyticSet', () => {
  it('excludes warm-ups and incomplete sets', () => {
    expect(isAnalyticSet(set({ type: 'warmup' }))).toBe(false);
    expect(isAnalyticSet(set({ completedAt: undefined }))).toBe(false);
    for (const type of ['working', 'drop', 'failure', 'amrap'] as const) {
      expect(isAnalyticSet(set({ type }))).toBe(true);
    }
  });
});

describe('effectiveLoad', () => {
  it('total: logged weight, converted', () => {
    expect(effectiveLoad(set({ weight: 225 }), ex('total'), bw, 'lb')).toBe(225);
    expect(effectiveLoad(set({ weight: 100, unit: 'kg' }), ex('total'), bw, 'lb')).toBeCloseTo(220.46, 2);
  });

  it('perImplement: one dumbbell, never doubled', () => {
    expect(effectiveLoad(set({ weight: 70 }), ex('perImplement'), bw, 'lb')).toBe(70);
  });

  it('bodyweightPlusAdded: bodyweight + added, 0 added for bodyweight-only', () => {
    expect(effectiveLoad(set({ weight: 45 }), ex('bodyweightPlusAdded'), bw, 'lb')).toBe(225);
    expect(effectiveLoad(set({}), ex('bodyweightPlusAdded'), bw, 'lb')).toBe(180);
    expect(effectiveLoad(set({ weight: 20, unit: 'kg' }), ex('bodyweightPlusAdded'), { value: 80, unit: 'kg' }, 'kg')).toBe(100);
  });

  it('assisted: bodyweight − assistance, floored at 0', () => {
    expect(effectiveLoad(set({ weight: 50 }), ex('assisted'), bw, 'lb')).toBe(130);
    expect(effectiveLoad(set({ weight: 300 }), ex('assisted'), bw, 'lb')).toBe(0);
  });

  it('returns null without bodyweight or without a load model', () => {
    expect(effectiveLoad(set({ weight: 45 }), ex('bodyweightPlusAdded'), undefined, 'lb')).toBeNull();
    expect(effectiveLoad(set({ weight: 10 }), ex('timeDistance'), bw, 'lb')).toBeNull();
    expect(effectiveLoad(set({ reps: 20 }), ex('repsOnly'), bw, 'lb')).toBeNull();
  });
});

describe('setVolume', () => {
  it('load × reps for analytic sets, 0 for warm-ups', () => {
    expect(setVolume(set({ weight: 70, reps: 10 }), ex('perImplement'), bw, 'lb')).toBe(700);
    expect(setVolume(set({ weight: 135, reps: 10, type: 'warmup' }), ex('total'), bw, 'lb')).toBe(0);
    expect(setVolume(set({ reps: 10 }), ex('bodyweightPlusAdded'), bw, 'lb')).toBe(1800);
  });
});

describe('displayWeight', () => {
  it('doubles perImplement only when pair total display is on', () => {
    expect(displayWeight({ weight: 70, unit: 'lb' }, ex('perImplement'), true, 'lb')).toBe(140);
    expect(displayWeight({ weight: 70, unit: 'lb' }, ex('perImplement'), false, 'lb')).toBe(70);
    expect(displayWeight({ weight: 225, unit: 'lb' }, ex('total'), true, 'lb')).toBe(225);
  });
});

describe('bodyweightOn', () => {
  const m = (date: string, value: number, extra: Partial<BodyMetric> = {}): BodyMetric => ({
    id: date,
    createdAt: done,
    updatedAt: done,
    date,
    kind: 'bodyweight',
    value,
    unit: 'lb',
    ...extra,
  });
  const metrics = [m('2026-10-01', 175), m('2026-11-01', 180), m('2026-11-20', 182, { deletedAt: done })];

  it('uses the latest weigh-in on or before the date', () => {
    expect(bodyweightOn('2026-11-24', metrics)).toEqual({ value: 180, unit: 'lb' });
    expect(bodyweightOn('2026-10-15', metrics)).toEqual({ value: 175, unit: 'lb' });
  });

  it('falls back to the earliest weigh-in for older dates, undefined with none', () => {
    expect(bodyweightOn('2025-01-01', metrics)).toEqual({ value: 175, unit: 'lb' });
    expect(bodyweightOn('2026-11-24', [])).toBeUndefined();
  });
});
