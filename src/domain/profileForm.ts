/** Text ↔ value helpers for the training profile editor. Pure. */
import type { Weight, WeightUnit } from './types';

/** One item per non-empty line (commas are kept: a goal may contain one). */
export const parseLines = (text: string): string[] =>
  text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

/** A positive number from text, else undefined (empty means "not set"). */
export function parsePositive(text: string): number | undefined {
  const n = Number(text.trim().replace(',', '.'));
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
}

/** "45, 35, 25, 10, 5, 2.5" → weights, biggest first, duplicates removed. Bad tokens are dropped. */
export function parsePlates(text: string, unit: WeightUnit): Weight[] {
  const vals = text.split(/[\s,;]+/).map((t) => parsePositive(t)).filter((n): n is number => n !== undefined);
  return [...new Set(vals)].sort((a, b) => b - a).map((value) => ({ value, unit }));
}

export const platesText = (plates?: Weight[]): string => (plates ?? []).map((p) => p.value).join(', ');

/** A birth year that is plausible for a training app user, else undefined. */
export function parseBirthYear(text: string, thisYear: number): number | undefined {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= thisYear - 100 && n <= thisYear - 10 ? n : undefined;
}

/** Days per week: whole number 1-7, else undefined. */
export function parseDays(text: string): number | undefined {
  const n = Number(text.trim());
  return Number.isInteger(n) && n >= 1 && n <= 7 ? n : undefined;
}
