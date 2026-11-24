import type { Profile } from '../../domain/types';
import { db } from '../schema';
import { nowIso } from './base';

export function defaultProfile(): Profile {
  const t = nowIso();
  return {
    id: 'me',
    createdAt: t,
    updatedAt: t,
    goals: ['Overall strength', 'Tackling power', 'Speed and conditioning', 'Service-academy fitness tests'],
    sport: 'Rugby',
    position: 'Fullback',
    trainingPhase: 'preseason',
    constraints: [],
    equipmentProfiles: [
      {
        id: 'rec-center',
        name: 'Rec center',
        equipment: ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'band'],
        maxDumbbell: { value: 120, unit: 'lb' },
        barWeight: { value: 45, unit: 'lb' },
        plates: [45, 35, 25, 10, 5, 2.5].map((value) => ({ value, unit: 'lb' as const })),
        notes: 'Squat racks, benches, cables, dip station, leg press. No trap bar.',
      },
      { id: 'home', name: 'Home', equipment: ['bodyweight'], notes: 'Pull-up bar.' },
    ],
    defaultEquipmentProfileId: 'rec-center',
    weightUnit: 'lb',
    lengthUnit: 'in',
    weekStartsOn: 1,
    theme: 'dark',
    showDumbbellPairTotal: false,
    e1rmFormula: 'epley',
    plannedDaysPerWeek: 3,
    strengthScoreLifts: [],
    strengthStandards: [],
  };
}

/** Singleton profile. Created with defaults on first read. */
export const profileRepo = {
  async get(): Promise<Profile> {
    const existing = await db.profile.get('me');
    if (existing) return existing;
    const p = defaultProfile();
    await db.profile.put(p);
    return p;
  },
  async update(patch: Partial<Omit<Profile, 'id' | 'createdAt'>>): Promise<Profile> {
    const current = await profileRepo.get();
    const next: Profile = { ...current, ...patch, id: 'me', updatedAt: nowIso() };
    await db.profile.put(next);
    return next;
  },
};
