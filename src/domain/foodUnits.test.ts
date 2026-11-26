import { describe, expect, it } from 'vitest';
import { foodIdOf, scaleFood, type Food } from './foods';
import {
  ML,
  OZ_G,
  baseAmount,
  classifyPortion,
  defaultAmount,
  entryLabel,
  formatQuantity,
  gramsPerMl,
  parseQuantity,
  plainQuantity,
  snapQuantity,
  unitById,
  unitRange,
  unitsFor,
} from './foodUnits';

const food = (id: number, name: string, over: Partial<Food> = {}): Food => ({ id: foodIdOf(id), name, kcal: 100, proteinG: 10, carbsG: 20, fatG: 5, portions: [], ...over });
const milk = food(1, 'Milk, whole', { kcal: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3, portions: [{ label: '1 fl oz', grams: 30.5 }, { label: '1 cup', grams: 244 }] });
const banana = food(2, 'Bananas, raw', { kcal: 89, portions: [{ label: '1 medium (7" to 7-7/8" long)', grams: 118 }, { label: '1 cup, sliced', grams: 150 }, { label: '1 large (8" to 8-7/8" long)', grams: 136 }] });
const oil = food(3, 'Oil, olive', { kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, portions: [{ label: '1 tbsp', grams: 13.5 }, { label: '1 cup', grams: 216 }] });
const cola = food(4, 'Soft drink, cola', { kcal: 42, portions: [{ label: '1 fl oz', grams: 30.7 }, { label: '1 can or bottle (12 fl oz)', grams: 370 }] });
const oats = food(5, 'Oats, raw');
const burrito = food(6, 'Burrito', { portions: [{ label: '1 miniature', grams: 110 }, { label: '1 cup', grams: 120 }, { label: '1 small/regular', grams: 220 }, { label: '1 large', grams: 330 }] });
const veggie: Food = { id: 'my:x', name: 'Veggie burrito', kcal: 600, proteinG: 25, carbsG: 80, fatG: 20, portions: [], basis: 1, servingLabel: 'burrito', mine: true };

describe('parseQuantity', () => {
  it('reads decimals, fractions, mixed numbers and a decimal comma', () => {
    expect(parseQuantity('2')).toBe(2);
    expect(parseQuantity('1.5')).toBe(1.5);
    expect(parseQuantity('1,5')).toBe(1.5);
    expect(parseQuantity('.5')).toBe(0.5);
    expect(parseQuantity('1/2')).toBe(0.5);
    expect(parseQuantity('1 1/2')).toBe(1.5);
    expect(parseQuantity('3/4')).toBe(0.75);
    expect(parseQuantity('1½')).toBe(1.5);
    expect(parseQuantity('¼')).toBe(0.25);
  });
  it('rejects empty, zero, negative and nonsense', () => {
    for (const t of ['', ' ', '0', '-1', 'abc', '1/0', '1 1/0', '1..5', '9999999']) expect(parseQuantity(t), t).toBeUndefined();
  });
});

describe('formatQuantity', () => {
  it('shows quarters, halves and thirds as fractions', () => {
    expect([0.25, 0.5, 0.75, 1.5, 2.25, 3, 1 / 3, 2 + 2 / 3, 1.4, 120, 0.1].map(formatQuantity)).toEqual(['¼', '½', '¾', '1½', '2¼', '3', '⅓', '2⅔', '1.4', '120', '0.1']);
    expect(plainQuantity(1.5)).toBe('1.5');
  });
});

describe('classifyPortion', () => {
  it('finds the count and the unit text', () => {
    expect(classifyPortion('1 medium')).toEqual({ count: 1, text: 'medium' });
    expect(classifyPortion('10 chips')).toEqual({ count: 10, text: 'chips' });
    expect(classifyPortion('1/2 cup')).toMatchObject({ count: 0.5, plainVolume: 'cup' });
    expect(classifyPortion('1 1/2 cup')).toMatchObject({ count: 1.5, plainVolume: 'cup' });
    expect(classifyPortion('shredded')).toEqual({ count: 1, text: 'shredded' });
  });
  it('knows a plain volume row from a prepared one, and weights', () => {
    expect(classifyPortion('1 cup').plainVolume).toBe('cup');
    expect(classifyPortion('1 cup (8 fl oz)').plainVolume).toBe('cup');
    expect(classifyPortion('1 tablespoon').plainVolume).toBe('tbsp');
    expect(classifyPortion('1 fl oz').plainVolume).toBe('floz');
    expect(classifyPortion('1 cup, chopped').plainVolume).toBeUndefined();
    expect(classifyPortion('1 can or bottle (12 fl oz)').plainVolume).toBeUndefined();
    expect(classifyPortion('3 oz').weight).toBe(true);
    expect(classifyPortion('1 oz, cooked').weight).toBeUndefined();
  });
});

describe('density and volume units', () => {
  it('derives grams per ml from the food\'s own cup row', () => {
    expect(gramsPerMl(milk)).toBeCloseTo(244 / ML.cup, 6);
    expect(gramsPerMl(oil)).toBeCloseTo(216 / ML.cup, 6);
  });
  it('gives no volume for a food with no plain volume row, and none for a saved food', () => {
    expect(gramsPerMl(banana)).toBeUndefined();
    expect(gramsPerMl(oats)).toBeUndefined();
    expect(gramsPerMl(veggie)).toBeUndefined();
    expect(unitsFor(banana).some((u) => u.kind === 'volume')).toBe(false);
  });
  it('turns a cup, a tablespoon and ml into the right number of grams', () => {
    const units = unitsFor(milk);
    const cup = unitById(units, 'cup')!;
    expect(baseAmount(cup, 1)).toBeCloseTo(244, 6);
    expect(baseAmount(unitById(units, 'ml')!, 250)).toBeCloseTo((250 * 244) / ML.cup, 6);
    expect(baseAmount(unitById(units, 'tbsp')!, 2)).toBeCloseTo((2 * ML.tbsp * 244) / ML.cup, 6);
    expect(baseAmount(unitById(units, 'floz')!, 8)).toBeCloseTo(244, 0);
    expect(baseAmount(unitById(units, 'oz')!, 4)).toBeCloseTo(4 * OZ_G, 6);
    expect(baseAmount(unitById(units, 'g')!, 150)).toBe(150);
  });
  it('prefers the cup row to a tablespoon row for the density', () => {
    const f = food(7, 'Flour', { portions: [{ label: '1 tbsp', grams: 7.8 }, { label: '1 cup', grams: 125 }] });
    expect(gramsPerMl(f)).toBeCloseTo(125 / ML.cup, 6);
  });
});

describe('unitsFor', () => {
  it('lists the food\'s own portions first, then g and oz, then volumes; a plain cup is not listed twice', () => {
    expect(unitsFor(banana).map((u) => u.label)).toEqual(['medium (7" to 7-7/8" long)', 'cup, sliced', 'large (8" to 8-7/8" long)', 'g', 'oz']);
    expect(unitsFor(milk).map((u) => u.label)).toEqual(['g', 'oz', 'ml', 'fl oz', 'tsp', 'tbsp', 'cup']);
  });
  it('makes a counted portion a unit of one: 10 chips weigh 16 g, so one chip is 1.6 g', () => {
    const chips = food(8, 'Chips', { portions: [{ label: '10 chips', grams: 16 }] });
    const u = unitById(unitsFor(chips), 'p0')!;
    expect(u.label).toBe('chips');
    expect(u.size).toBeCloseTo(1.6, 6);
    expect(u.step).toBe(1);
  });
  it('gives a saved food one unit, named by its serving label', () => {
    expect(unitsFor(veggie)).toEqual([{ id: 'serving', label: 'burrito', size: 1, step: 0.25, kind: 'serving' }]);
    expect(unitsFor({ ...veggie, servingLabel: undefined })[0]?.label).toBe('serving');
  });
});

describe('defaultAmount', () => {
  it('starts a drink at its can, else a cup', () => {
    expect(defaultAmount(cola)).toEqual({ unitId: 'p1', qty: 1 });
    expect(defaultAmount(milk)).toEqual({ unitId: 'cup', qty: 1 });
  });
  it('starts oil at a tablespoon (a cup would be over 700 kcal)', () => {
    expect(defaultAmount(oil)).toEqual({ unitId: 'tbsp', qty: 1 });
  });
  it('starts a counted food at the medium one, a named one first', () => {
    expect(defaultAmount(banana)).toEqual({ unitId: 'p0', qty: 1 });
    expect(unitById(unitsFor(burrito), defaultAmount(burrito).unitId)?.label).toBe('small/regular');
    const banana2 = food(9, 'Banana, raw', { portions: [{ label: '1 slice', grams: 6 }, { label: '1 linear inch', grams: 15 }, { label: '1 banana', grams: 126 }] });
    expect(unitById(unitsFor(banana2), defaultAmount(banana2).unitId)?.label).toBe('banana');
  });
  it('starts a plain food at 100 g and a saved food at one serving', () => {
    expect(defaultAmount(oats)).toEqual({ unitId: 'g', qty: 100 });
    expect(defaultAmount(veggie)).toEqual({ unitId: 'serving', qty: 1 });
  });
});

describe('scaling an amount', () => {
  it('uses grams for list foods and servings for saved foods', () => {
    expect(scaleFood(milk, baseAmount(unitById(unitsFor(milk), 'cup')!, 1)).calories).toBe(149);
    expect(scaleFood(veggie, baseAmount(unitsFor(veggie)[0]!, 1.5))).toEqual({ calories: 900, proteinG: 37.5, carbsG: 120, fatG: 30 });
  });
});

describe('range and snapping', () => {
  it('spans one step to 500 g worth of the unit, or 20 servings', () => {
    expect(unitRange(oats, unitById(unitsFor(oats), 'g')!)).toEqual({ min: 5, max: 500, step: 5 });
    expect(unitRange(oats, unitById(unitsFor(oats), 'oz')!).max).toBe(17.75); // 500 g = 17.64 oz, rounded up to the next ¼
    expect(unitRange(veggie, unitsFor(veggie)[0]!)).toEqual({ min: 0.25, max: 20, step: 0.25 });
  });
  it('snaps a quantity to the unit\'s step, never below one step', () => {
    const cup = unitById(unitsFor(milk), 'cup')!;
    expect(snapQuantity(cup, 1.1)).toBe(1);
    expect(snapQuantity(cup, 1.2)).toBe(1.25);
    expect(snapQuantity(cup, 0)).toBe(0.25);
  });
});

describe('entryLabel', () => {
  it('names the amount in the unit it was eaten in, with the grams', () => {
    const u = unitsFor(banana);
    expect(entryLabel(banana, u[0]!, 2)).toBe('Bananas, raw · 2 medium (7" to 7-7/8" long) (236 g)');
    expect(entryLabel(milk, unitById(unitsFor(milk), 'cup')!, 1.5)).toBe('Milk, whole · 1½ cup (366 g)');
    expect(entryLabel(milk, unitById(unitsFor(milk), 'ml')!, 250)).toMatch(/^Milk, whole · 250 ml \(2\d\d(\.\d)? g\)$/);
    expect(entryLabel(oats, unitById(unitsFor(oats), 'g')!, 60)).toBe('Oats, raw · 60 g');
    expect(entryLabel(veggie, unitsFor(veggie)[0]!, 1.5)).toBe('Veggie burrito · 1½ burrito');
    expect(entryLabel({ ...veggie, servingLabel: undefined }, unitsFor({ ...veggie, servingLabel: undefined })[0]!, 2)).toBe('Veggie burrito · 2 servings');
  });
});
