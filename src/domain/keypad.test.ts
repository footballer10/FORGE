import { describe, expect, it } from 'vitest';
import { applyKey, initKeypad, parseKeypad, stepValue, type KeypadKey } from './keypad';

const type = (start: number | undefined, keys: KeypadKey[], dec = true) =>
  keys.reduce((s, k) => applyKey(s, k, dec), initKeypad(start)).text;

describe('keypad', () => {
  it('first digit replaces the prefilled value, later digits append', () => {
    expect(type(135, ['2'])).toBe('2');
    expect(type(135, ['2', '2', '5'])).toBe('225');
  });
  it('backspace edits the prefilled value, and clears when fresh-then-back', () => {
    expect(type(135, ['back'])).toBe('');
    expect(type(undefined, ['1', '2', 'back'])).toBe('1');
  });
  it('decimals: one dot, max two places, leading 0, blocked when disallowed', () => {
    expect(type(undefined, ['.', '5'])).toBe('0.5');
    expect(type(undefined, ['2', '.', '5', '.', '5'])).toBe('2.55');
    expect(type(undefined, ['2', '.', '5', '5', '5'])).toBe('2.55');
    expect(type(undefined, ['2', '.', '5'], false)).toBe('25');
  });
  it('no leading zeros and a length cap', () => {
    expect(type(undefined, ['0', '5'])).toBe('5');
    expect(type(undefined, ['1', '1', '1', '1', '1', '1', '1', '1', '1'])).toBe('1111111');
  });
  it('parses', () => {
    expect(parseKeypad('')).toBeUndefined();
    expect(parseKeypad('5.')).toBe(5);
    expect(parseKeypad('102.5')).toBe(102.5);
  });
  it('steps without float noise and floors at min', () => {
    expect(stepValue(100, 2.5)).toBe(102.5);
    expect(stepValue(0.1, 0.2)).toBe(0.3);
    expect(stepValue(3, -5)).toBe(0);
    expect(stepValue(undefined, 5)).toBe(5);
  });
});
