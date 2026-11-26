import { db } from './schema';
import { createRepo } from './repositories/base';
import { metaRepo } from './repositories';

const LAT_KEY = 'fix.latPulldownGrip.v1';
export const LAT_OLD_NAME = 'Close-Grip Front Lat Pulldown';
export const LAT_NEW_NAME = 'Lat Pulldown';
export const LAT_NOTE = 'Grip just wider than shoulder width.';

/**
 * One-time fix requested by the user: Strong's "Lat Pulldown (Cable)" was matched to the library's
 * close-grip pulldown on import, but the user has always used a grip just wider than the shoulders.
 * Renames that exercise (history stays on it), keeps the old name as an alias so programs and
 * imports still find it, adds the grip as its sticky note and records Strong's name for export.
 * Runs once; skipped if the user already renamed it or a "Lat Pulldown" exists.
 */
export async function fixLatPulldownGrip(): Promise<boolean> {
  if (await metaRepo.get<boolean>(LAT_KEY)) return false;
  const all = await db.exercises.toArray();
  const ex = all.find((e) => !e.deletedAt && e.name === LAT_OLD_NAME);
  const clash = all.some((e) => !e.deletedAt && e.name.toLowerCase() === LAT_NEW_NAME.toLowerCase());
  let changed = false;
  if (ex && !clash) {
    const aliases = [...new Set([...ex.aliases, LAT_OLD_NAME, 'Lat Pulldown (Cable)'])];
    await createRepo(db.exercises).update(ex.id, {
      name: LAT_NEW_NAME,
      aliases,
      stickyNote: ex.stickyNote?.trim() ? ex.stickyNote : LAT_NOTE,
      strongName: ex.strongName ?? 'Lat Pulldown (Cable)',
    });
    changed = true;
  }
  await metaRepo.set(LAT_KEY, true);
  return changed;
}
