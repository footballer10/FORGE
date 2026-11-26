import { useState } from 'react';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Number input that shows a stored value in display units. While focused it keeps exactly what is typed
 * (so "92." is not snapped back), and commits the converted value as you type.
 */
export function UnitField({
  value,
  toDisplay,
  fromDisplay,
  label,
  placeholder,
  className,
  inputMode = 'decimal',
  onChange,
}: {
  value: number | undefined;
  toDisplay: (v: number) => number;
  fromDisplay: (v: number) => number;
  label: string;
  placeholder?: string;
  className: string;
  inputMode?: 'decimal' | 'numeric';
  onChange: (v: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : String(r2(toDisplay(value))));
  return (
    <input
      aria-label={label}
      className={className}
      inputMode={inputMode}
      placeholder={placeholder}
      value={shown}
      onFocus={() => setDraft(shown)}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const t = e.target.value.trim().replace(',', '.');
        if (t === '') return onChange(undefined);
        const n = Number(t);
        if (Number.isFinite(n) && n >= 0) onChange(fromDisplay(n));
      }}
    />
  );
}
