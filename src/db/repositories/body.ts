import type { BodyMetric, LengthUnit, WeightUnit } from '../../domain/types';
import { db } from '../schema';
import { createRepo } from './base';
import { profileRepo } from './profile';
import { undoRepo } from './undo';

const metrics = createRepo(db.bodyMetrics);

export const bodyRepo = {
  /** Weigh-ins, newest first, not trashed. */
  async weighIns(): Promise<BodyMetric[]> {
    const rows = await db.bodyMetrics.where('kind').equals('bodyweight').filter((m) => !m.deletedAt).toArray();
    return rows.sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));
  },
  async add(date: string, value: number, unit: WeightUnit, notes?: string): Promise<BodyMetric> {
    return metrics.create({ date, kind: 'bodyweight', value, unit, ...(notes ? { notes } : {}) });
  },
  async edit(id: string, patch: { date?: string; value?: number; notes?: string }): Promise<void> {
    await metrics.update(id, patch);
  },
  async remove(id: string): Promise<void> {
    await undoRepo.run('Deleted weigh-in', { bodyMetrics: [id] }, () => metrics.softDelete(id));
  },
  async restore(id: string): Promise<void> {
    await metrics.restore(id);
  },
  async lengthUnit(): Promise<LengthUnit> {
    return (await profileRepo.get()).lengthUnit;
  },
  async unit(): Promise<WeightUnit> {
    return (await profileRepo.get()).weightUnit;
  },
};
