import type { Table } from 'dexie';
import type { BaseEntity, ID, ISODateTime } from '../../domain/types';

export const nowIso = (): ISODateTime => new Date().toISOString();
export const newId = (): ID => crypto.randomUUID();

/** Fields the repository fills in on create. */
export type NewEntity<T extends BaseEntity> = Omit<T, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & {
  id?: ID;
};

export interface Repository<T extends BaseEntity> {
  get(id: ID): Promise<T | undefined>;
  /** All rows that are not soft-deleted. */
  list(): Promise<T[]>;
  listDeleted(): Promise<T[]>;
  create(input: NewEntity<T>): Promise<T>;
  /** Shallow-merge a patch and bump updatedAt. */
  update(id: ID, patch: Partial<Omit<T, 'id' | 'createdAt'>>): Promise<T>;
  /** Upsert a full row as-is (import/restore); bumps updatedAt unless `keepTimestamps`. */
  put(row: T, keepTimestamps?: boolean): Promise<void>;
  softDelete(id: ID): Promise<void>;
  restore(id: ID): Promise<void>;
  /** Permanent removal (trash purge). */
  hardDelete(id: ID): Promise<void>;
}

export function createRepo<T extends BaseEntity>(table: Table<T, string>): Repository<T> {
  return {
    get: (id) => table.get(id),
    list: () => table.filter((r) => !r.deletedAt).toArray(),
    listDeleted: () => table.filter((r) => !!r.deletedAt).toArray(),
    async create(input) {
      const t = nowIso();
      const row = { ...input, id: input.id ?? newId(), createdAt: t, updatedAt: t } as T;
      await table.add(row);
      return row;
    },
    async update(id, patch) {
      const existing = await table.get(id);
      if (!existing) throw new Error(`Not found: ${table.name}/${id}`);
      const row = { ...existing, ...patch, id, updatedAt: nowIso() } as T;
      await table.put(row);
      return row;
    },
    async put(row, keepTimestamps = false) {
      await table.put(keepTimestamps ? row : { ...row, updatedAt: nowIso() });
    },
    async softDelete(id) {
      const t = nowIso();
      await table.update(id, { deletedAt: t, updatedAt: t } as never);
    },
    async restore(id) {
      const existing = await table.get(id);
      if (!existing) return;
      const { deletedAt: _removed, ...rest } = existing;
      await table.put({ ...rest, updatedAt: nowIso() } as T);
    },
    hardDelete: (id) => table.delete(id),
  };
}
