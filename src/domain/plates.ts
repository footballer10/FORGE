export interface PlateResult {
  /** Plates for ONE side, heaviest first. */
  perSide: number[];
  /** Weight actually loaded (bar + 2 × perSide). */
  loaded: number;
  /** Target minus loaded; > 0 means the target cannot be made exactly with these plates. */
  remainder: number;
}

/**
 * Greedy plate breakdown for a barbell: the heaviest plate that still fits, repeated.
 * All values share one unit. Targets at or below the bar load nothing.
 */
export function platesPerSide(target: number, bar: number, plates: number[]): PlateResult {
  const sorted = [...new Set(plates.filter((p) => p > 0))].sort((a, b) => b - a);
  let left = Math.max(0, target - bar) / 2;
  const perSide: number[] = [];
  const eps = 1e-9;
  for (const p of sorted) {
    while (left + eps >= p) {
      perSide.push(p);
      left -= p;
    }
  }
  const loaded = bar + 2 * perSide.reduce((a, b) => a + b, 0);
  return { perSide, loaded, remainder: Math.max(0, Math.round((target - loaded) * 100) / 100) };
}

/**
 * Compact one-side plate list for the logging row, e.g. "45×2 10 2.5". "Bar" when only the bar is loaded;
 * a trailing "+" when the target cannot be made exactly. Empty for loads under the bar.
 */
export function plateLine(target: number, bar: number, plates: number[]): string {
  if (!(target > 0) || target + 1e-9 < bar) return '';
  const { perSide, remainder } = platesPerSide(target, bar, plates);
  if (!perSide.length) return remainder > 0 ? 'Bar+' : 'Bar';
  const parts: string[] = [];
  for (let i = 0; i < perSide.length; ) {
    let j = i;
    while (j < perSide.length && perSide[j] === perSide[i]) j++;
    const n = j - i;
    parts.push(n > 1 ? `${perSide[i]}×${n}` : String(perSide[i]));
    i = j;
  }
  return parts.join(' ') + (remainder > 0 ? '+' : '');
}
