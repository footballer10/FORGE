import { describe, expect, it } from 'vitest';
import { parseBirthYear, parseDays, parseLines, parsePlates, parsePositive, platesText } from './profileForm';

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
