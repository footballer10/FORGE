/** Pure editing logic for the custom numeric keypad. No React. */

export interface KeypadState {
  text: string;
  /** True until the first key: a digit then replaces the prefilled value instead of appending. */
  fresh: boolean;
}

export type KeypadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | 'back';

const MAX_LEN = 7;
const MAX_DECIMALS = 2;

export function initKeypad(value: number | undefined): KeypadState {
  return { text: value === undefined ? '' : String(value), fresh: true };
}

export function applyKey(s: KeypadState, key: KeypadKey, allowDecimal: boolean): KeypadState {
  if (key === 'back') return { text: s.fresh ? '' : s.text.slice(0, -1), fresh: false };
  const base = s.fresh ? '' : s.text;
  if (key === '.') {
    if (!allowDecimal || base.includes('.')) return { text: s.text, fresh: s.fresh };
    return { text: (base === '' ? '0' : base) + '.', fresh: false };
  }
  if (base.length >= MAX_LEN) return s;
  const dot = base.indexOf('.');
  if (dot >= 0 && base.length - dot - 1 >= MAX_DECIMALS) return s;
  const text = base === '0' ? key : base + key;
  return { text, fresh: false };
}

/** Empty text is "no value". A trailing dot ("5.") parses as 5. */
export function parseKeypad(text: string): number | undefined {
  if (text === '') return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

/** Add `delta` to the current value (missing = 0), never below `min`, without float noise. */
export function stepValue(current: number | undefined, delta: number, min = 0): number {
  return Math.max(min, Math.round(((current ?? 0) + delta) * 100) / 100);
}
