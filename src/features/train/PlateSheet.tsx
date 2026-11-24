import { useState } from 'react';
import { platesPerSide } from '../../domain/plates';

interface Props {
  exerciseName: string;
  unit: string;
  initialTarget: number;
  bar: number;
  plates: number[];
  onClose: () => void;
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Plates per side for a target weight, from the equipment profile's bar and plates. */
export function PlateSheet({ exerciseName, unit, initialTarget, bar, plates, onClose }: Props) {
  const [text, setText] = useState(initialTarget > 0 ? fmt(initialTarget) : '');
  const target = Number.parseFloat(text);
  const result = Number.isFinite(target) ? platesPerSide(target, bar, plates) : undefined;

  return (
    <div role="dialog" aria-label="Plate calculator" className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="pb-safe rounded-t-card border-t border-line bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-2xl uppercase">Plates</h2>
        <p className="pb-3 text-sm text-muted">{exerciseName} · bar {fmt(bar)} {unit}</p>
        <label htmlFor="plate-target" className="block pb-1 text-sm text-muted">Target weight ({unit})</label>
        <input
          id="plate-target"
          inputMode="decimal"
          className="num min-h-tap w-full rounded-card border border-line bg-surface-2 px-3 text-2xl text-fg"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="min-h-[72px] pt-4" aria-live="polite">
          {result && result.perSide.length > 0 && (
            <>
              <p className="pb-1 text-sm text-muted">Each side</p>
              <p className="num flex flex-wrap gap-2 text-3xl">
                {result.perSide.map((p, i) => (
                  <span key={i} className="rounded-card border border-line px-3 py-1">{fmt(p)}</span>
                ))}
              </p>
            </>
          )}
          {result && result.perSide.length === 0 && <p className="text-muted">Just the bar.</p>}
          {result && result.remainder > 0 && (
            <p className="pt-2 text-sm text-muted">
              Closest with these plates is {fmt(result.loaded)} {unit} ({fmt(result.remainder)} short).
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="num mt-3 min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg">Done</button>
      </div>
    </div>
  );
}
