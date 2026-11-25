import { describe, expect, it } from 'vitest';
import { parseBirthYear, parseDays, parseLines, parsePlates, parsePositive, platesText, withBarAndPlates } from './profileForm';

describe('profile form helpers', () => {
  it('splits lines and drops blanks', () => {
    expect(parseLines(' a, b \n\n  c\r\n')).toEqual(['a, b', 'c']);
  });
  it('parses positive numbers', () => {
    expect(parsePositive('2,5')).toBe(2.5);
    expect(parsePositive('')).toBeUndefined();
    expect(parsePositive('0')).toBeUndefined();
    expect(parsePositive('abc')).toBeUndefined();
  });
  it('parses plates biggest first without duplicates', () => {
    const p = parsePlates('5, 45 25; 45, x, 2.5', 'lb');
    expect(p.map((w) => w.value)).toEqual([45, 25, 5, 2.5]);
    expect(p[0]!.unit).toBe('lb');
    expect(platesText(p)).toBe('45, 25, 5, 2.5');
  });
  it('validates birth year and days', () => {
    expect(parseBirthYear('2006', 2026)).toBe(2006);
    expect(parseBirthYear('2026', 2026)).toBeUndefined();
    expect(parseBirthYear('1800', 2026)).toBeUndefined();
    expect(parseDays('4')).toBe(4);
    expect(parseDays('8')).toBeUndefined();
    expect(parseDays('2.5')).toBeUndefined();
  });
});

describe('withBarAndPlates', () => {
  const gym = { id: 'g', name: 'Home', equipment: ['barbell' as const], barWeight: { value: 45, unit: 'lb' as const }, notes: 'garage' };
  it('updates the default profile and keeps its other fields and the other profiles', () => {
    const other = { id: 'o', name: 'Hotel', equipment: ['dumbbell' as const] };
    const r = withBarAndPlates([gym, other], 'g', '20', '25, 20, 10, 5, 2.5, 1.25', 'kg', () => 'new');
    expect(r.defaultEquipmentProfileId).toBe('g');
    expect(r.equipmentProfiles[0]).toMatchObject({ notes: 'garage', barWeight: { value: 20, unit: 'kg' } });
    expect(r.equipmentProfiles[0]!.plates!.map((p) => p.value)).toEqual([25, 20, 10, 5, 2.5, 1.25]);
    expect(r.equipmentProfiles[1]).toBe(other);
  });
  it('creates a Gym profile when none exists and clears emptied fields', () => {
    const r = withBarAndPlates([], undefined, '45', '', 'lb', () => 'new');
    expect(r.equipmentProfiles).toEqual([{ id: 'new', name: 'Gym', equipment: ['barbell'], barWeight: { value: 45, unit: 'lb' } }]);
    const cleared = withBarAndPlates(r.equipmentProfiles, 'new', '', '', 'lb', () => 'x');
    expect(cleared.equipmentProfiles[0]!.barWeight).toBeUndefined();
  });
});
