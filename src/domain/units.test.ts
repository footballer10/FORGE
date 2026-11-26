import { describe, expect, it } from 'vitest';
import { convertWeight, formatWeight, roundForDisplay, toUnit } from './units';

describe('units', () => {
  it('converts lb ↔ kg exactly', () => {
    expect(convertWeight(100, 'kg', 'lb')).toBeCloseTo(220.462, 3);
    expect(convertWeight(225, 'lb', 'kg')).toBeCloseTo(102.058, 3);
    expect(convertWeight(135, 'lb', 'lb')).toBe(135);
  });

  it('round-trips without drift', () => {
    expect(convertWeight(convertWeight(47.5, 'lb', 'kg'), 'kg', 'lb')).toBeCloseTo(47.5, 10);
  });

  it('toUnit keeps the unit with the value', () => {
    expect(toUnit({ value: 20, unit: 'kg' }, 'lb')).toEqual({ value: convertWeight(20, 'kg', 'lb'), unit: 'lb' });
  });

  it('formats for display only', () => {
    expect(roundForDisplay(102.0582)).toBe(102.1);
    expect(formatWeight({ value: 100, unit: 'kg' }, 'lb')).toBe('220.5 lb');
    expect(formatWeight({ value: 135, unit: 'lb' })).toBe('135 lb');
  });
});

describe('set distances', () => {
  it('uses yards for an imperial profile and stores metres', async () => {
    const { distanceUnitFor, metresTo, toMetres } = await import('./units');
    expect(distanceUnitFor('in')).toBe('yd');
    expect(distanceUnitFor('cm')).toBe('m');
    expect(metresTo(36.576, 'yd')).toBeCloseTo(40, 6);
    expect(toMetres(40, 'yd')).toBeCloseTo(36.576, 6);
    expect(metresTo(400, 'm')).toBe(400);
  });
});
