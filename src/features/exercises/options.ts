import type { Equipment, LoadModel, Muscle } from '../../domain/types';

export const MUSCLE_OPTIONS: Muscle[] = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest', 'forearms', 'glutes', 'hamstrings',
  'lats', 'lower back', 'middle back', 'neck', 'quadriceps', 'shoulders', 'traps', 'triceps',
];

export const EQUIPMENT_OPTIONS: Equipment[] = [
  'barbell', 'dumbbell', 'kettlebell', 'cable', 'machine', 'bodyweight', 'band', 'ez bar',
  'trap bar', 'sled', 'medicine ball', 'exercise ball', 'foam roll', 'other',
];

export const LOAD_MODEL_OPTIONS: { value: LoadModel; label: string; hint: string }[] = [
  { value: 'total', label: 'Total load', hint: 'Barbell incl. bar, machine, cable' },
  { value: 'perImplement', label: 'Per dumbbell', hint: 'Weight of ONE dumbbell or kettlebell' },
  { value: 'bodyweightPlusAdded', label: 'Bodyweight + added', hint: 'Pull-ups, dips with a belt' },
  { value: 'assisted', label: 'Assisted', hint: 'Bodyweight minus assistance' },
  { value: 'timeDistance', label: 'Time / distance', hint: 'No load; runs, sprints, holds' },
  { value: 'repsOnly', label: 'Reps only', hint: 'Load not tracked' },
];

export const labelFor = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
