import type { Exercise, MovementPattern, Muscle } from './types';
import { similarity, splitTag } from './importPlan';

export interface InferredTraits {
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  pattern: MovementPattern;
  unilateral: boolean;
  /** 'library' = copied from the closest library exercise; 'name' = keyword rule on the name. */
  basis: 'library' | 'name';
  /** The library exercise copied from, or the keyword rule that matched. */
  reason: string;
}

/** Minimum name similarity (shared words ÷ all words, equipment tag removed) to copy a library exercise. */
export const LIBRARY_MATCH_MIN = 0.75;

interface Rule {
  re: RegExp;
  pattern: MovementPattern;
  primary: Muscle[];
  secondary: Muscle[];
}

/** First matching rule wins, so specific names come before general ones. */
const RULES: Rule[] = [
  { re: /romanian|stiff[- ]leg|good morning/, pattern: 'hinge', primary: ['hamstrings'], secondary: ['glutes', 'lower back'] },
  { re: /deadlift/, pattern: 'hinge', primary: ['hamstrings', 'glutes', 'lower back'], secondary: ['traps', 'forearms'] },
  { re: /hip thrust|glute bridge/, pattern: 'hinge', primary: ['glutes'], secondary: ['hamstrings'] },
  { re: /back extension|hyperextension/, pattern: 'hinge', primary: ['lower back'], secondary: ['glutes', 'hamstrings'] },
  { re: /lunge|split squat|step[- ]?up|bulgarian/, pattern: 'lunge', primary: ['quadriceps', 'glutes'], secondary: ['hamstrings'] },
  { re: /leg extension/, pattern: 'isolation', primary: ['quadriceps'], secondary: [] },
  { re: /leg curl|hamstring curl/, pattern: 'isolation', primary: ['hamstrings'], secondary: [] },
  { re: /leg press|hack squat|squat/, pattern: 'squat', primary: ['quadriceps', 'glutes'], secondary: ['hamstrings', 'lower back'] },
  { re: /calf/, pattern: 'isolation', primary: ['calves'], secondary: [] },
  { re: /pull[- ]?up|chin[- ]?up|lat pull|pulldown|pull-down/, pattern: 'verticalPull', primary: ['lats'], secondary: ['biceps', 'middle back'] },
  { re: /face pull|reverse fly|reverse flye|rear delt/, pattern: 'horizontalPull', primary: ['shoulders'], secondary: ['middle back', 'traps'] },
  { re: /shrug/, pattern: 'isolation', primary: ['traps'], secondary: [] },
  { re: /row/, pattern: 'horizontalPull', primary: ['middle back', 'lats'], secondary: ['biceps', 'shoulders'] },
  { re: /overhead press|shoulder press|military|push press|arnold|strict press/, pattern: 'verticalPush', primary: ['shoulders'], secondary: ['triceps'] },
  { re: /lateral raise|front raise|side raise/, pattern: 'isolation', primary: ['shoulders'], secondary: [] },
  { re: /fly|flye|pec deck|crossover/, pattern: 'horizontalPush', primary: ['chest'], secondary: ['shoulders'] },
  { re: /bench|chest press|push[- ]?up/, pattern: 'horizontalPush', primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  { re: /dip\b/, pattern: 'horizontalPush', primary: ['chest', 'triceps'], secondary: ['shoulders'] },
  { re: /skull ?crusher|tricep|triceps|pushdown|push-down|kickback/, pattern: 'isolation', primary: ['triceps'], secondary: [] },
  { re: /curl/, pattern: 'isolation', primary: ['biceps'], secondary: ['forearms'] },
  { re: /crunch|sit[- ]?up|plank|leg raise|ab wheel|russian twist|woodchop|hanging knee/, pattern: 'core', primary: ['abdominals'], secondary: [] },
  { re: /farmer|suitcase|carry/, pattern: 'carry', primary: ['forearms', 'traps'], secondary: ['abdominals'] },
];

const UNILATERAL = /single|one[- ]arm|one[- ]leg|alternat|unilateral|lunge|split squat|step[- ]?up|bulgarian/i;

const EQUIPMENT_WORDS = /\b(barbell|dumbbell|cable|kettlebell|machine|band|ez[- ]bar|smith)\b/gi;
const core = (n: string) => splitTag(n).base.replace(EQUIPMENT_WORDS, ' ');

/** The library exercise whose name is closest to `name` once the "(Equipment)" tag is ignored. */
export function closestLibraryExercise(name: string, library: Exercise[]): Exercise | undefined {
  const base = core(name);
  let best: Exercise | undefined;
  let bestScore = 0;
  for (const e of library) {
    if (e.deletedAt || e.source === 'import' || e.primaryMuscles.length === 0) continue;
    const score = Math.max(similarity(base, core(e.name)), ...e.aliases.map((a) => similarity(base, core(a))));
    if (score > bestScore) {
      best = e;
      bestScore = score;
    }
  }
  return best && bestScore >= LIBRARY_MATCH_MIN ? best : undefined;
}

/**
 * Muscles and movement pattern for an exercise that has none (typically imported from Strong).
 * Copies the closest library exercise when its name is very close, else uses keyword rules on the name.
 * Returns undefined when nothing fits; the user can set it by hand.
 */
export function inferTraits(name: string, library: Exercise[]): InferredTraits | undefined {
  const near = closestLibraryExercise(name, library);
  if (near) {
    return {
      primaryMuscles: [...near.primaryMuscles],
      secondaryMuscles: [...near.secondaryMuscles],
      pattern: near.pattern,
      unilateral: near.unilateral,
      basis: 'library',
      reason: `same as "${near.name}"`,
    };
  }
  const base = splitTag(name).base.toLowerCase();
  const rule = RULES.find((r) => r.re.test(base));
  if (!rule) return undefined;
  return {
    primaryMuscles: [...rule.primary],
    secondaryMuscles: [...rule.secondary],
    pattern: rule.pattern,
    unilateral: UNILATERAL.test(base),
    basis: 'name',
    reason: `name contains "${rule.re.exec(base)![0]}"`,
  };
}
