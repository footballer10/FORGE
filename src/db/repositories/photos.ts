import { sortPhotos, type Pose } from '../../domain/photos';
import type { ProgressPhoto } from '../../domain/types';
import { db } from '../schema';
import { createRepo } from './base';

const photos = createRepo(db.progressPhotos);

/** Progress photos: image blobs kept in IndexedDB on this device only (never in backups). */
export const photoRepo = {
  /** Newest first. Loads every blob reference; the browser keeps blobs on disk until read. */
  async list(): Promise<ProgressPhoto[]> {
    return sortPhotos(await photos.list());
  },
  async add(blob: Blob, date: string, pose?: Pose, notes?: string): Promise<ProgressPhoto> {
    return photos.create({ date, blob, ...(pose ? { pose } : {}), ...(notes ? { notes } : {}) });
  },
  async edit(id: string, patch: { date?: string; pose?: Pose; notes?: string }): Promise<void> {
    await photos.update(id, patch);
  },
  /** Permanent: a photo has no copy anywhere else, and a trashed blob would keep using device storage. */
  async remove(id: string): Promise<void> {
    await photos.hardDelete(id);
  },
};
