import { useState } from 'react';
import { applyKey, initKeypad, parseKeypad, stepValue, type KeypadKey, type KeypadState } from '../domain/keypad';

interface Props {
  label: string;
  value: number | undefined;
  /** ± button step (the exercise increment for weight, 1 for reps). */
  step: number;
  allowDecimal: boolean;
  /** Called on every key so the value is persisted immediately. */
  onChange: (value: number | undefined) => void;
  /** Label of the advance button, e.g. "Reps" or "Done". */
  nextLabel: string;
  onNext: () => void;
  onClose: () => void;
}

const DIGITS: KeypadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const key = 'num min-h-[56px] rounded-card bg-surface-2 text-2xl text-fg active:opacity-70';

/** Custom numeric keypad (no iOS keyboard). Bottom sheet; the first digit replaces the prefilled value. */
export function Keypad({ label, value, step, allowDecimal, onChange, nextLabel, onNext, onClose }: Props) {
  const [state, setState] = useState<KeypadState>(() => initKeypad(value));

  const press = (k: KeypadKey) => {
    const next = applyKey(state, k, allowDecimal);
    setState(next);
    onChange(parseKeypad(next.text));
  };
  const stepBy = (delta: number) => {
    const next = stepValue(parseKeypad(state.text), delta);
    setState({ text: String(next), fresh: true });
    onChange(next);
  };

  return (
    <div role="dialog" aria-label={`Edit ${label}`} className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-3 pt-2 shadow-2xl">
      <div className="flex items-center justify-between pb-2">
        <span className="text-sm text-muted">{label}</span>
        <span className="num text-3xl text-fg" aria-live="polite">{state.text || '—'}</span>
        <button type="button" onClick={onClose} className="min-h-tap min-w-tap text-sm text-muted">Hide</button>
      </div>
      <div className="grid grid-cols-4 gap-2 pb-3">
        {DIGITS.map((d, i) => (
          <button key={d} type="button" className={`${key} ${i % 3 === 0 ? 'col-start-1' : ''}`} onClick={() => press(d)}>{d}</button>
        ))}
        <button type="button" className={`${key} col-start-1`} onClick={() => press('.')} disabled={!allowDecimal} aria-label="Decimal point">.</button>
        <button type="button" className={key} onClick={() => press('0')}>0</button>
        <button
          type="button"
          onClick={onNext}
          className="num col-span-2 col-start-3 row-start-4 min-h-[56px] rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg"
        >
          {nextLabel}
        </button>
        <button type="button" className={`${key} col-start-4 row-start-1`} onClick={() => stepBy(-step)} aria-label={`Minus ${step}`}>−</button>
        <button type="button" className={`${key} col-start-4 row-start-2`} onClick={() => stepBy(step)} aria-label={`Plus ${step}`}>+</button>
        <button type="button" className={`${key} col-start-4 row-start-3`} onClick={() => press('back')} aria-label="Backspace">⌫</button>
      </div>
    </div>
  );
}
