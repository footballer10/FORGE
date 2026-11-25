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
  if (done !== undefined) await reclassifyUntouched(rows);
  const fresh = rows.filter((r) => !have.has(r.id)).map(mapLibraryExercise);
  if (fresh.length) await exerciseRepo.bulkCreate(fresh);
  await metaRepo.set(META_KEY, LIBRARY_VERSION);
  return { added: fresh.length };
}

/**
 * Library exercises seeded by an older version keep their stored classification; fix those the user never
 * touched (updatedAt still equals createdAt). Edited exercises are left alone. Returns how many changed.
 */
export async function reclassifyUntouched(records: LibraryRecord[]): Promise<number> {
  const byRef = new Map(records.map((r) => [r.id, mapLibraryExercise(r)]));
  let n = 0;
  for (const e of await exerciseRepo.list()) {
    const fresh = e.sourceRef ? byRef.get(e.sourceRef) : undefined;
    if (!fresh || e.source !== 'library' || e.updatedAt !== e.createdAt) continue;
    if (e.pattern === fresh.pattern && e.loadModel === fresh.loadModel) continue;
    await exerciseRepo.update(e.id, { pattern: fresh.pattern, loadModel: fresh.loadModel });
    n++;
  }
  return n;
}

let pending: Promise<{ added: number }> | undefined;
/** Shared, memoized seed run: the app starts it at boot and screens await it before listing exercises. */
export function ensureLibrary(): Promise<{ added: number }> {
  pending ??= seedLibrary().catch((err) => {
    pending = undefined;
    throw err;
  });
  return pending;
}
