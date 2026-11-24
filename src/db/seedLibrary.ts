import { LIBRARY_VERSION, mapLibraryExercise, type LibraryRecord } from '../domain/exerciseMapper';
import { exerciseRepo, metaRepo } from './repositories';

const META_KEY = 'librarySeedVersion';

/**
 * Seed the exercise library. Idempotent and versioned: only exercises whose sourceRef is not yet
 * stored are added, so user edits and deletions are never overwritten or resurrected.
 * `records` is injectable so tests do not load the full dataset; the app lazy-loads the JSON.
 */
export async function seedLibrary(records?: LibraryRecord[]): Promise<{ added: number }> {
  const done = await metaRepo.get<number>(META_KEY);
  if (done !== undefined && done >= LIBRARY_VERSION) return { added: 0 };
  const rows = records ?? ((await import('../data/free-exercise-db.json')).default as LibraryRecord[]);
  const have = await exerciseRepo.sourceRefs();
  const fresh = rows.filter((r) => !have.has(r.id)).map(mapLibraryExercise);
  if (fresh.length) await exerciseRepo.bulkCreate(fresh);
  await metaRepo.set(META_KEY, LIBRARY_VERSION);
  return { added: fresh.length };
}
