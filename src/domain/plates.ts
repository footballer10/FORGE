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
