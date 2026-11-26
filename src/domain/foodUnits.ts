/**
 * Amounts you can actually estimate after eating (pure): a count of a unit instead of only grams.
 *
 * Every unit has a `size`: how many base units of the food (grams for a list food, servings for a saved food) one
 * of it is. Weight units are exact. Volume units (ml, fl oz, tsp, tbsp, cup) are exact US measures turned into grams
 * with the density of the food, taken from the food's own USDA row for a plain cup, fl oz, tbsp or tsp (grams ÷
 * millilitres). Foods with no such row get no volume units; nothing is guessed. USDA portions ("1 medium",
 * "1 slice", "1 can") become units whose size is their gram weight ÷ their count.
 */
import type { Food } from './foods';
import { basisOf } from './foods';

export const OZ_G = 28.349523125;
/** US customary volumes in millilitres. */
export const ML = { tsp: 4.92892159375, tbsp: 14.78676478125, floz: 29.5735295625, cup: 236.5882365 } as const;
type VolumeKey = keyof typeof ML;
/** Which plain volume row gives the density when a food has several: the biggest unit has the least rounding. */
const DENSITY_ORDER: VolumeKey[] = ['cup', 'floz', 'tbsp', 'tsp'];

export type UnitKind = 'weight' | 'volume' | 'portion' | 'serving';

export interface AmountUnit {
  id: string;
  label: string;
  /** Base units (grams, or servings) in one of this unit. */
  size: number;
  /** Step of the − and + buttons and the slider. */
  step: number;
  kind: UnitKind;
}

/** A chosen amount: how many of which unit. */
export interface Amount {
  unitId: string;
  qty: number;
}

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;

// ---- typing and showing quantities --------------------------------------------------------------------------

const GLYPHS: [string, string][] = [['½', ' 1/2'], ['¼', ' 1/4'], ['¾', ' 3/4'], ['⅓', ' 1/3'], ['⅔', ' 2/3']];

/** "2", "1.5", "1,5", "1/2", "1 1/2", "1½" → a positive number; anything else → undefined. */
export function parseQuantity(text: string): number | undefined {
  let t = text.trim().replace(',', '.');
  for (const [glyph, plain] of GLYPHS) t = t.replace(glyph, plain);
  t = t.trim().replace(/\s+/g, ' ');
  let n: number | undefined;
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d*\.?\d+)$/))) n = Number(m[1]);
  else if ((m = t.match(/^(\d+) (\d+)\/(\d+)$/))) n = Number(m[3]) ? Number(m[1]) + Number(m[2]) / Number(m[3]) : undefined;
  else if ((m = t.match(/^(\d+)\/(\d+)$/))) n = Number(m[2]) ? Number(m[1]) / Number(m[2]) : undefined;
  return n !== undefined && Number.isFinite(n) && n > 0 && n <= 100000 ? n : undefined;
}

const SHOWN: [number, string][] = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];

/** 1.5 → "1½", 0.25 → "¼", 2.333 → "2⅓", 1.4 → "1.4", 3 → "3". For labels; the text box shows plain decimals. */
export function formatQuantity(q: number): string {
  const whole = Math.floor(q + 0.005);
  const frac = q - whole;
  if (Math.abs(frac) < 0.005 || frac > 0.995) return String(round(q, 0));
  for (const [v, g] of SHOWN) if (Math.abs(frac - v) < 0.01) return whole > 0 ? `${whole}${g}` : g;
  return String(round(q, 2));
}

/** Plain decimal for the text box: 1.5, 0.25, 120. */
export const plainQuantity = (q: number): string => String(round(q, 2));

// ---- reading USDA portion rows ------------------------------------------------------------------------------

export interface PortionKind {
  count: number;
  /** Text after the count: "cup, chopped", "medium", "can or bottle (12 fl oz)". */
  text: string;
  /** Set for a plain cup / tbsp / tsp / fl oz row (no preparation named): the app turns it into volume units. */
  plainVolume?: VolumeKey;
  /** A row that is only a weight (oz, g, lb): the app has those already. */
  weight?: boolean;
}

const VOLUME_WORDS: Record<string, VolumeKey> = {
  cup: 'cup', cups: 'cup', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  'fl oz': 'floz', 'fluid ounce': 'floz', 'fluid ounces': 'floz',
};
const WEIGHT_WORDS = new Set(['oz', 'ounce', 'ounces', 'g', 'gram', 'grams', 'lb', 'pound', 'pounds']);

export function classifyPortion(label: string): PortionKind {
  const m = label.trim().match(/^(\d+ \d+\/\d+|\d+\/\d+|\d*\.?\d+)\s+(.+)$/);
  const count = (m && parseQuantity(m[1] ?? '')) || 1;
  const text = (m?.[2] ?? label).trim();
  const [headRaw = '', ...mods] = text.split(',');
  const head = headRaw.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
  const volume = VOLUME_WORDS[head];
  if (volume && mods.length === 0) return { count, text, plainVolume: volume };
  if (WEIGHT_WORDS.has(head) && mods.length === 0) return { count, text, weight: true };
  return { count, text };
}

/** Grams per millilitre from the food's own plain volume row, or undefined when it has none. */
export function gramsPerMl(food: Food): number | undefined {
  if (basisOf(food) !== 100) return undefined;
  let best: { rank: number; density: number } | undefined;
  for (const p of food.portions) {
    const k = classifyPortion(p.label);
    if (!k.plainVolume) continue;
    const density = p.grams / (k.count * ML[k.plainVolume]);
    const rank = DENSITY_ORDER.indexOf(k.plainVolume);
    if (density >= 0.05 && density <= 3 && (!best || rank < best.rank)) best = { rank, density };
  }
  return best?.density;
}

// ---- the units of a food ------------------------------------------------------------------------------------

const G: AmountUnit = { id: 'g', label: 'g', size: 1, step: 5, kind: 'weight' };
const OZ: AmountUnit = { id: 'oz', label: 'oz', size: OZ_G, step: 0.25, kind: 'weight' };

/** Units for a food, the food's own portions first, then g and oz, then the volumes it supports. */
export function unitsFor(food: Food): AmountUnit[] {
  if (basisOf(food) !== 100) return [{ id: 'serving', label: food.servingLabel?.trim() || 'serving', size: 1, step: 0.25, kind: 'serving' }];
  const out: AmountUnit[] = [];
  const seen = new Set<string>();
  food.portions.forEach((p, i) => {
    const k = classifyPortion(p.label);
    if (k.plainVolume || k.weight || !(p.grams > 0)) return;
    const key = k.text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: `p${i}`, label: k.text, size: p.grams / k.count, step: k.count >= 5 ? 1 : 0.5, kind: 'portion' });
  });
  out.push(G, OZ);
  const d = gramsPerMl(food);
  if (d !== undefined) {
    out.push(
      { id: 'ml', label: 'ml', size: d, step: 5, kind: 'volume' },
      { id: 'floz', label: 'fl oz', size: ML.floz * d, step: 0.5, kind: 'volume' },
      { id: 'tsp', label: 'tsp', size: ML.tsp * d, step: 0.25, kind: 'volume' },
      { id: 'tbsp', label: 'tbsp', size: ML.tbsp * d, step: 0.5, kind: 'volume' },
      { id: 'cup', label: 'cup', size: ML.cup * d, step: 0.25, kind: 'volume' },
    );
  }
  return out;
}

export const unitById = (units: readonly AmountUnit[], id: string): AmountUnit | undefined => units.find((u) => u.id === id);

/** Labels that name a normal-sized single item. */
const TYPICAL = /\b(medium|regular|item|serving|whole|each|average|standard)\b/i;
/** Pieces of something, not a way to count it. */
const PARTIAL = /inch|bite|chip|crumb|pinch|dash|drop/i;
/** Labels of a drink's own container. */
const CONTAINER = /\b(can|bottle|glass|carton|cup|drink)\b|fl oz/i;
/** A cup above this many kilocalories (oil, nut butter, honey) is not how anyone measures it: start from a tablespoon. */
const CUP_TOO_RICH_KCAL = 700;

/**
 * The amount to start from:
 *  - a saved food: one serving;
 *  - a drink (the food has a plain fl oz row): its own can or bottle if it has one, else a cup;
 *  - other foods with countable portions: the "medium" / "regular" one, else the middle one;
 *  - otherwise a cup, or a tablespoon when a cup would be over 700 kcal, or the biggest volume it has;
 *  - otherwise 100 g.
 */
export function defaultAmount(food: Food): Amount {
  if (basisOf(food) !== 100) return { unitId: 'serving', qty: 1 };
  const units = unitsFor(food);
  const portions: { id: string; qty: number; label: string }[] = [];
  const volumes: Partial<Record<VolumeKey, number>> = {};
  food.portions.forEach((p, i) => {
    const k = classifyPortion(p.label);
    if (k.weight || !(p.grams > 0)) return;
    if (k.plainVolume) volumes[k.plainVolume] ??= k.count;
    else if (unitById(units, `p${i}`)) portions.push({ id: `p${i}`, qty: k.count, label: k.text });
  });
  const volumeDefault = (): Amount | undefined => {
    const d = gramsPerMl(food);
    if (d === undefined) return undefined;
    // Only volumes the food's own USDA rows show (spices have a teaspoon, not a cup).
    const present = (['cup', 'tbsp', 'floz', 'tsp'] as const).filter((k) => volumes[k] !== undefined);
    const fits = present.find((k) => (food.kcal * ML[k] * d) / 100 <= CUP_TOO_RICH_KCAL);
    const key = fits ?? present[present.length - 1];
    return key ? { unitId: key, qty: 1 } : undefined;
  };
  const isDrink = volumes.floz !== undefined;
  if (isDrink) {
    const container = portions.find((p) => CONTAINER.test(p.label));
    if (container) return { unitId: container.id, qty: container.qty };
    return volumeDefault() ?? { unitId: 'g', qty: 100 };
  }
  if (portions.length > 0) {
    // A portion named after the food ("1 banana", "1 breast") beats a generic size word; "medium" beats the rest.
    const nameWords = food.name.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 2).map((w) => w.replace(/(es|s)$/, ''));
    const named = portions.filter((p) => p.label.toLowerCase().split(/[^a-z]+/).some((w) => w.length > 2 && nameWords.includes(w.replace(/(es|s)$/, ''))));
    const pool = named.length > 0 ? named : portions.filter((p) => !PARTIAL.test(p.label)).length > 0 ? portions.filter((p) => !PARTIAL.test(p.label)) : portions;
    const pick = pool.find((p) => TYPICAL.test(p.label)) ?? pool[Math.floor((pool.length - 1) / 2)];
    if (pick) return { unitId: pick.id, qty: pick.qty };
  }
  return volumeDefault() ?? { unitId: 'g', qty: 100 };
}

/** Slider range for a unit: from one step up to 500 g (or 4 × the biggest portion), or 20 servings. */
export function unitRange(food: Food, unit: AmountUnit): { min: number; max: number; step: number } {
  if (unit.kind === 'serving') return { min: unit.step, max: 20, step: unit.step };
  const biggest = Math.max(0, ...food.portions.map((p) => p.grams));
  const baseMax = Math.ceil(Math.max(500, biggest * 4) / 10) * 10;
  const max = Math.max(unit.step, Math.ceil(baseMax / unit.size / unit.step) * unit.step);
  return { min: unit.step, max, step: unit.step };
}

/** Round a quantity to the unit's step (the slider and the − and + buttons). */
export const snapQuantity = (unit: AmountUnit, qty: number): number => Math.max(unit.step, round(Math.round(qty / unit.step) * unit.step, 4));

/** The base amount (grams or servings) a quantity of a unit stands for. */
export const baseAmount = (unit: AmountUnit, qty: number): number => qty * unit.size;

/**
 * Entry name as shown in the day list: "Bananas, raw · 2 medium (236 g)", "Milk · 1 cup (244 g)",
 * "Rice, white, cooked · 150 g", "Veggie burrito · 1½ burrito".
 */
export function entryLabel(food: Food, unit: AmountUnit, qty: number): string {
  const q = formatQuantity(qty);
  if (unit.kind === 'serving') return `${food.name} · ${q} ${unit.label === 'serving' && qty !== 1 ? 'servings' : unit.label}`;
  if (unit.id === 'g') return `${food.name} · ${q} g`;
  return `${food.name} · ${q} ${unit.label} (${round(qty * unit.size, 1)} g)`;
}
