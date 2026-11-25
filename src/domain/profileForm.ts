/** Text ↔ value helpers for the training profile editor. Pure. */
import type { Equipment, EquipmentProfile, Weight, WeightUnit } from './types';

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

/** The equipment profile the plate calculator uses: the default one, else the first. */
export function defaultEquipment(profiles: EquipmentProfile[], defaultId?: string): EquipmentProfile | undefined {
  return profiles.find((e) => e.id === defaultId) ?? profiles[0];
}

/**
 * Sets bar and plates (typed in `unit`) on the default equipment profile; creates a "Gym" profile when there is none.
 * Empty text removes that field. Other profiles and fields are left alone.
 */
export function withBarAndPlates(
  profiles: EquipmentProfile[],
  defaultId: string | undefined,
  barText: string,
  platesInput: string,
  unit: WeightUnit,
  newId: () => string,
): { equipmentProfiles: EquipmentProfile[]; defaultEquipmentProfileId: string } {
  const target = defaultEquipment(profiles, defaultId) ?? { id: newId(), name: 'Gym', equipment: ['barbell'] as Equipment[] };
  const bar = parsePositive(barText);
  const plates = parsePlates(platesInput, unit);
  const { barWeight: _b, plates: _p, ...rest } = target;
  const updated: EquipmentProfile = { ...rest, ...(bar ? { barWeight: { value: bar, unit } } : {}), ...(plates.length ? { plates } : {}) };
  const exists = profiles.some((e) => e.id === target.id);
  return {
    equipmentProfiles: exists ? profiles.map((e) => (e.id === target.id ? updated : e)) : [...profiles, updated],
    defaultEquipmentProfileId: target.id,
  };
}
