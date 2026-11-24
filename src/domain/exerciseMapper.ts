import type { Equipment, Exercise, LoadModel, Muscle, MovementPattern } from './types';

/** Bump when the vendored dataset or the mapping rules change; seeding adds only missing exercises. */
export const LIBRARY_VERSION = 1;

/** One record of the vendored free-exercise-db subset. */
export interface LibraryRecord {
  id: string;
  name: string;
  force: string | null;
  mechanic: string | null;
  equipment: string | null;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
}

export type MappedExercise = Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>;

const EQUIPMENT_MAP: Record<string, Equipment> = {
  'body only': 'bodyweight',
  machine: 'machine',
  other: 'other',
  'foam roll': 'foam roll',
  kettlebells: 'kettlebell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  barbell: 'barbell',
  bands: 'band',
  'medicine ball': 'medicine ball',
  'exercise ball': 'exercise ball',
  'e-z curl bar': 'ez bar',
};

export function mapEquipment(raw: string | null): Equipment {
  return (raw && EQUIPMENT_MAP[raw]) || 'other';
}

const MUSCLES = new Set<string>([
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings',
  'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps',
]);
const toMuscles = (list: string[]): Muscle[] => list.filter((m): m is Muscle => MUSCLES.has(m));

const has = (name: string, re: RegExp) => re.test(name.toLowerCase());

export function inferPattern(r: LibraryRecord): MovementPattern {
  const n = r.name;
  const p = r.primaryMuscles[0];
  if (r.category === 'cardio' || r.category === 'plyometrics') return 'conditioning';
  if (r.category === 'stretching') return 'other';
  if (has(n, /carry|farmer|suitcase|yoke/)) return 'carry';
  if (has(n, /lunge|split squat|step[- ]?up|bulgarian/)) return 'lunge';
  if (has(n, /deadlift|good morning|hip thrust|glute bridge|romanian|swing|back extension|hyperextension|pull[- ]?through|clean|snatch/)) return 'hinge';
  if (has(n, /squat|leg press|hack/)) return 'squat';
  if (has(n, /pull[- ]?up|chin[- ]?up|pulldown|pull-down|muscle[- ]up/)) return 'verticalPull';
  if (has(n, /row|face pull|reverse fly|rear delt/)) return 'horizontalPull';
  if (has(n, /overhead|military|shoulder press|push press|arnold|handstand|jerk/)) return 'verticalPush';
  if (has(n, /bench|push[- ]?up|chest press|fly|flye|dip|pec deck|crossover/)) return 'horizontalPush';
  if (p === 'abdominals') return 'core';
  if (r.mechanic === 'isolation') return 'isolation';
  if (p === 'lats') return 'verticalPull';
  if (p === 'middle back') return 'horizontalPull';
  if (p === 'chest') return 'horizontalPush';
  if (p === 'quadriceps') return 'squat';
  if (p === 'hamstrings' || p === 'glutes' || p === 'lower back') return 'hinge';
  if (p === 'shoulders') return 'verticalPush';
  return 'other';
}

export function inferLoadModel(r: LibraryRecord, equipment: Equipment): LoadModel {
  const n = r.name;
  if (r.category === 'stretching' || r.category === 'cardio' || equipment === 'foam roll') return 'timeDistance';
  if (has(n, /assisted/)) return 'assisted';
  if (equipment === 'dumbbell' || equipment === 'kettlebell') return 'perImplement';
  if (equipment === 'bodyweight') {
    return has(n, /pull[- ]?up|chin[- ]?up|dip\b|muscle[- ]up/) ? 'bodyweightPlusAdded' : 'repsOnly';
  }
  if (r.category === 'plyometrics') return 'repsOnly';
  return 'total';
}

const UNILATERAL = /single|one[- ]arm|one[- ]leg|alternat|unilateral|lunge|split squat|step[- ]?up|bulgarian/i;

/** Strong-style names for import matching: "Bench Press (Barbell)" and the bare "Bench Press". */
export function buildAliases(name: string, equipment: Equipment): string[] {
  const base = name.split(' - ')[0]!.trim();
  const prefix = /^(barbell|dumbbell|cable|kettlebell|machine|band|ez[- ]bar|smith machine)\s+/i;
  const bare = base.replace(prefix, '').trim();
  const label: Partial<Record<Equipment, string>> = {
    barbell: 'Barbell', dumbbell: 'Dumbbell', cable: 'Cable', machine: 'Machine', kettlebell: 'Kettlebell',
    band: 'Band', 'ez bar': 'EZ Bar', bodyweight: 'Bodyweight',
  };
  const out = new Set<string>();
  const lname = name.toLowerCase();
  const add = (a: string) => {
    if (a && a.toLowerCase() !== lname) out.add(a);
  };
  add(base);
  add(bare);
  const l = label[equipment];
  if (l && bare) add(`${bare} (${l})`);
  return [...out];
}

export function mapLibraryExercise(r: LibraryRecord): MappedExercise {
  const equipment = mapEquipment(r.equipment);
  const loadModel = inferLoadModel(r, equipment);
  const heavy = r.mechanic === 'compound' && ['strength', 'powerlifting', 'olympic weightlifting', 'strongman'].includes(r.category);
  const noLoad = loadModel === 'timeDistance' || loadModel === 'repsOnly';
  return {
    name: r.name,
    aliases: buildAliases(r.name, equipment),
    equipment,
    primaryMuscles: toMuscles(r.primaryMuscles),
    secondaryMuscles: toMuscles(r.secondaryMuscles),
    pattern: inferPattern(r),
    unilateral: UNILATERAL.test(r.name),
    defaultRestSec: noLoad ? 60 : heavy ? 120 : 90,
    weightIncrement: 5,
    incrementUnit: 'lb',
    loadModel,
    source: 'library',
    sourceRef: r.id,
    instructions: r.instructions,
    ...(equipment === 'barbell' && loadModel === 'total' ? { barWeight: { value: 45, unit: 'lb' as const } } : {}),
  };
}
