/**
 * Strong exercise names for export (pure). Strong matches an imported exercise by its exact name, so a
 * workout that goes back into Strong as "Barbell Squat" would create a second, empty exercise instead of
 * joining the history of "Squat (Barbell)". Order of trust: a name the user typed, then the name the
 * exercise had in their own Strong import, then the table below, then the Forge name (flagged as a guess).
 */
import type { Exercise, ImportBatch } from './types';

/** Library name → the name Strong uses, for the exercises in the user's A/B/C Day templates. */
export const STRONG_NAME_HINTS: Record<string, string> = {
  'Barbell Squat': 'Squat (Barbell)',
  'Barbell Bench Press - Medium Grip': 'Bench Press (Barbell)',
  'Dumbbell Incline Row': 'Incline Row (Dumbbell)',
  'Leg Extensions': 'Leg Extension (Machine)',
  'Dumbbell Raise': 'Lateral Raise (Dumbbell)',
  'Triceps Pushdown': 'Triceps Pushdown (Cable - Straight Bar)',
  'Barbell Deadlift': 'Deadlift (Barbell)',
  'Barbell Shoulder Press': 'Overhead Press (Barbell)',
  'Close-Grip Front Lat Pulldown': 'Lat Pulldown (Cable)',
  'Suspended Split Squat': 'Bulgarian Split Squat',
  'Seated Leg Curl': 'Seated Leg Curl (Machine)',
  'Dumbbell Bicep Curl': 'Bicep Curl (Dumbbell)',
  'Hanging Leg Raise': 'Hanging Leg Raise',
  'Incline Dumbbell Press': 'Incline Bench Press (Dumbbell)',
  'Romanian Deadlift': 'Romanian Deadlift (Barbell)',
  'Seated Cable Rows': 'Seated Row (Cable)',
  Butterfly: 'Chest Fly',
  'Standing Dumbbell Calf Raise': 'Standing Calf Raise (Dumbbell)',
};

export type StrongNameSource = 'set' | 'import' | 'hint' | 'guess';
export interface StrongName {
  name: string;
  source: StrongNameSource;
}

const hints = new Map(Object.entries(STRONG_NAME_HINTS).map(([k, v]) => [k.toLowerCase(), v]));

/** exerciseId → the Strong name it was imported under (the earliest import wins; trashed imports are ignored). */
export function importedStrongNames(batches: readonly Pick<ImportBatch, 'importedAt' | 'conventions' | 'deletedAt'>[]): Map<string, string> {
  const out = new Map<string, string>();
  const ordered = batches.filter((b) => !b.deletedAt).sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  for (const b of ordered) {
    for (const [name, rule] of Object.entries(b.conventions.exerciseRules)) {
      if (!out.has(rule.exerciseId)) out.set(rule.exerciseId, name);
    }
  }
  return out;
}

export function resolveStrongName(ex: Pick<Exercise, 'id' | 'name' | 'strongName'>, imported: ReadonlyMap<string, string>): StrongName {
  if (ex.strongName?.trim()) return { name: ex.strongName.trim(), source: 'set' };
  const fromImport = imported.get(ex.id);
  if (fromImport) return { name: fromImport, source: 'import' };
  const hint = hints.get(ex.name.toLowerCase());
  if (hint) return { name: hint, source: 'hint' };
  return { name: ex.name, source: 'guess' };
}

/** exerciseId → name to write in the CSV, for every exercise. */
export function strongNameMap(exercises: readonly Pick<Exercise, 'id' | 'name' | 'strongName'>[], imported: ReadonlyMap<string, string>): Map<string, string> {
  return new Map(exercises.map((e) => [e.id, resolveStrongName(e, imported).name]));
}
