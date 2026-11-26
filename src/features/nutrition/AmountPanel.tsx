import { useMemo, useState } from 'react';
import type { FoodInput } from '../../db/repositories';
import { basisOf, scaleFood, scalingFormula, type Food, type Macros } from '../../domain/foods';
import {
  baseAmount,
  defaultAmount,
  entryLabel,
  formatQuantity,
  parseQuantity,
  plainQuantity,
  snapQuantity,
  unitById,
  unitRange,
  unitsFor,
  type AmountUnit,
} from '../../domain/foodUnits';
import { fieldClass } from './Sheet';

const round1 = (n: number) => Math.round(n * 10) / 10;

function Macro({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="flex-1 text-center">
      <div className="num text-3xl">{round1(value)}</div>
      <div className="text-xs text-muted">{label}{unit ? ` (${unit})` : ''}</div>
    </div>
  );
}

/** A quantity in a new unit that keeps the same amount of food, written the way a person would. */
function carryOver(from: AmountUnit, to: AmountUnit, qty: number): number {
  const q = (qty * from.size) / to.size;
  return Math.max(to.step, to.step >= 5 ? Math.round(q) : Math.round(q * 100) / 100);
}

export interface Chosen {
  food: Food;
  unit: AmountUnit;
  qty: number;
  macros: Macros;
  /** Text for the day list or the recipe part. */
  label: string;
}

/** Entry fields for a chosen amount (grams are kept only for list foods). */
export function foodInputFrom(c: Chosen): FoodInput {
  const grams = basisOf(c.food) === 100 ? round1(baseAmount(c.unit, c.qty)) : undefined;
  return { name: c.label, calories: c.macros.calories, proteinG: c.macros.proteinG, carbsG: c.macros.carbsG, fatG: c.macros.fatG, foodId: c.food.id, ...(grams !== undefined ? { grams } : {}) };
}

/**
 * Pick how much: a number and a unit (grams, ounces, ml, cups, tablespoons, the food's own pieces), with live
 * calories and macros. The unit chips are the food's own portions first.
 */
export function AmountPanel({
  food,
  confirmLabel,
  backLabel,
  onBack,
  onConfirm,
}: {
  food: Food;
  confirmLabel: string;
  backLabel: string;
  onBack: () => void;
  onConfirm: (c: Chosen) => void;
}) {
  const units = useMemo(() => unitsFor(food), [food]);
  const start = useMemo(() => defaultAmount(food), [food]);
  const [unitId, setUnitId] = useState(start.unitId);
  const [text, setText] = useState(plainQuantity(start.qty));
  const unit = unitById(units, unitId) ?? units[0]!;
  const qty = parseQuantity(text);
  const base = qty !== undefined ? baseAmount(unit, qty) : 0;
  const macros = scaleFood(food, base);
  const range = unitRange(food, unit);
  const perServing = basisOf(food) === 1;

  const bump = (dir: 1 | -1) => setText(plainQuantity(snapQuantity(unit, (qty ?? 0) + dir * unit.step)));
  const pickUnit = (u: AmountUnit) => {
    setText(plainQuantity(carryOver(unit, u, qty ?? 1)));
    setUnitId(u.id);
  };

  return (
    <div>
      <button type="button" onClick={onBack} className="min-h-tap text-sm text-muted">← {backLabel}</button>
      <h2 className="pb-1 text-2xl leading-tight">
        {food.name}
        {food.tag && <span className="ml-2 align-middle rounded-full border border-line px-2 py-0.5 text-xs text-muted">{food.tag}</span>}
      </h2>
      <p className="pb-3 text-xs text-muted">
        {perServing ? 'Per serving' : 'Per 100 g'}: {Math.round(food.kcal)} kcal · {round1(food.proteinG)} g protein · {round1(food.carbsG)} g carbs · {round1(food.fatG)} g fat
      </p>

      <section className="rounded-card border border-line bg-surface p-4" aria-label="Amount eaten" aria-live="polite">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={`${plainQuantity(unit.step)} ${unit.label} less`} onClick={() => bump(-1)} className="min-h-tap min-w-tap rounded-card border border-line text-2xl">−</button>
          <input
            className={`${fieldClass} num min-w-0 flex-1 text-center text-4xl`}
            inputMode="decimal"
            aria-label={`Amount in ${unit.label}`}
            aria-invalid={qty === undefined}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="button" aria-label={`${plainQuantity(unit.step)} ${unit.label} more`} onClick={() => bump(1)} className="min-h-tap min-w-tap rounded-card border border-line text-2xl">+</button>
        </div>
        <p className="pt-2 text-center text-lg">{unit.label}</p>
        {qty === undefined && <p role="alert" className="pt-1 text-center text-sm text-accent-text">Type a number, like 2, 1.5 or 1/2.</p>}
        {qty !== undefined && !perServing && unit.id !== 'g' && (
          <p className="num text-center text-sm text-muted">
            {qty === 1 ? `1 ${unit.label} = ${round1(unit.size)} g` : `${formatQuantity(qty)} ${unit.label} = ${round1(base)} g · 1 ${unit.label} = ${round1(unit.size)} g`}
          </p>
        )}
        <input
          type="range"
          aria-label={`Amount in ${unit.label}`}
          className="mt-2 h-11 w-full accent-accent"
          min={range.min}
          max={range.max}
          step={range.step}
          value={Math.min(range.max, Math.max(range.min, qty ?? range.min))}
          onChange={(e) => setText(plainQuantity(snapQuantity(unit, Number(e.target.value))))}
        />
        <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Unit">
          {units.map((u) => (
            <button
              key={u.id}
              type="button"
              aria-pressed={u.id === unit.id}
              onClick={() => pickUnit(u)}
              className={`min-h-tap rounded-card border px-3 text-sm ${u.id === unit.id ? 'border-accent text-accent-text' : 'border-line'}`}
            >
              {u.label}
            </button>
          ))}
        </div>
        {unit.kind === 'volume' && <p className="pt-2 text-xs text-muted">ml, fl oz, tsp, tbsp and cup use the weight USDA gives for this food, so they are as exact as that weight.</p>}
        <div className="mt-4 flex border-t border-line pt-3">
          <Macro label="Calories" value={macros.calories} unit="kcal" />
          <Macro label="Protein" value={macros.proteinG} unit="g" />
          <Macro label="Carbs" value={macros.carbsG} unit="g" />
          <Macro label="Fat" value={macros.fatG} unit="g" />
        </div>
        <p className="pt-3 text-xs text-muted">{scalingFormula(food)}.</p>
      </section>

      <button
        type="button"
        disabled={qty === undefined}
        onClick={() => qty !== undefined && onConfirm({ food, unit, qty, macros, label: entryLabel(food, unit, qty) })}
        className="num mt-4 min-h-[56px] w-full rounded-card bg-accent text-xl font-semibold uppercase tracking-wider text-accent-fg disabled:opacity-40"
      >
        {confirmLabel} · {macros.calories} kcal
      </button>
    </div>
  );
}
