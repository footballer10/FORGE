import { BUILT_IN_TESTS, builtInId } from '../../domain/fitness';
import type { FitnessTest, LengthUnit, TestMeasure, TestResult, TestScoring, WeightUnit } from '../../domain/types';
import { db } from '../schema';
import { createRepo } from './base';
import { profileRepo } from './profile';

const tests = createRepo(db.fitnessTests);
const results = createRepo(db.testResults);

export const fitnessRepo = {
  /**
   * Create any missing built-in test (fixed id `builtin:<key>`). A built-in the user deleted stays deleted:
   * the soft-deleted row still occupies its id.
   */
  async ensureBuiltIns(): Promise<void> {
    for (const t of BUILT_IN_TESTS) {
      if (await db.fitnessTests.get(builtInId(t.key))) continue;
      await tests.create({ id: builtInId(t.key), name: t.name, measure: t.measure, scoring: t.scoring, description: t.description, builtIn: true });
    }
  },
  /** Tests (built-ins first in battery order, then custom by name) and all their results. */
  async load(): Promise<{ tests: FitnessTest[]; results: TestResult[]; lengthUnit: LengthUnit; weightUnit: WeightUnit }> {
    await this.ensureBuiltIns();
    const order = new Map(BUILT_IN_TESTS.map((t, i) => [builtInId(t.key), i]));
    const list = (await tests.list()).sort((a, b) => {
      const ao = order.get(a.id);
      const bo = order.get(b.id);
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
    const p = await profileRepo.get();
    return { tests: list, results: await results.list(), lengthUnit: p.lengthUnit, weightUnit: p.weightUnit };
  },
  async addCustom(name: string, measure: TestMeasure, scoring: TestScoring): Promise<FitnessTest> {
    return tests.create({ name: name.trim(), measure, scoring, builtIn: false });
  },
  /** Soft-deletes the test and its results. */
  async removeTest(id: string): Promise<void> {
    for (const r of await db.testResults.where('testId').equals(id).filter((r) => !r.deletedAt).toArray()) await results.softDelete(r.id);
    await tests.softDelete(id);
  },
  async addResult(testId: string, date: string, value: number, unit?: WeightUnit, notes?: string): Promise<TestResult> {
    return results.create({ testId, date, value, ...(unit ? { unit } : {}), ...(notes ? { notes } : {}) });
  },
  async editResult(id: string, patch: { date?: string; value?: number; notes?: string }): Promise<void> {
    await results.update(id, patch);
  },
  async removeResult(id: string): Promise<void> {
    await results.softDelete(id);
  },
};
