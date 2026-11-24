import { UNDO_STACK_SIZE } from '../../domain/safety';
import type { ID, UndoEntry } from '../../domain/types';
import { db } from '../schema';
import { newId } from './base';

/** Table name → IDs, used to say which rows an action will touch or create. */
export type RowRefs = Record<string, ID[]>;

/** Screens listen to this to refresh the undo bar. Guarded so it is a no-op under Node tests. */
export const UNDO_EVENT = 'forge:undo-changed';
const notify = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UNDO_EVENT));
};

/**
 * Persistent undo stack. An entry holds the full previous state of the rows an action changed
 * (`before`) and the IDs it created (`createdIds`). Undo puts the old rows back and removes the
 * created ones, in one transaction. Entries survive a reload.
 */
export const undoRepo = {
  /** Copy the current rows for the given IDs (missing rows are skipped). Call BEFORE the action. */
  async snapshot(refs: RowRefs): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {};
    for (const [table, ids] of Object.entries(refs)) {
      out[table] = (await db.table(table).bulkGet(ids)).filter((r) => r !== undefined);
    }
    return out;
  },

  async record(label: string, before: Record<string, unknown[]>, createdIds: RowRefs = {}): Promise<UndoEntry> {
    let entry!: UndoEntry;
    await db.transaction('rw', db.undo, async () => {
      // createdAt orders the stack, so keep it strictly increasing even for actions in the same millisecond.
      const last = await db.undo.orderBy('createdAt').last();
      const ms = Math.max(Date.now(), last ? Date.parse(last.createdAt) + 1 : 0);
      entry = { id: newId(), createdAt: new Date(ms).toISOString(), label, before, createdIds };
      await db.undo.add(entry);
      const all = await db.undo.orderBy('createdAt').toArray();
      const extra = all.slice(0, Math.max(0, all.length - UNDO_STACK_SIZE));
      if (extra.length) await db.undo.bulkDelete(extra.map((e) => e.id));
    });
    notify();
    return entry;
  },

  /** Snapshot `touch`, run the action, record it. `fn` may return IDs it created. */
  async run<T extends RowRefs | void>(label: string, touch: RowRefs, fn: () => Promise<T>): Promise<T> {
    const before = await undoRepo.snapshot(touch);
    const created = await fn();
    await undoRepo.record(label, before, created ?? {});
    return created;
  },

  async latest(): Promise<UndoEntry | undefined> {
    return (await db.undo.orderBy('createdAt').reverse().first()) ?? undefined;
  },

  /** Revert the most recent action. Returns its label, or undefined when the stack is empty. */
  async undoLatest(): Promise<string | undefined> {
    const entry = await undoRepo.latest();
    if (!entry) return undefined;
    const tables = [...new Set([...Object.keys(entry.before), ...Object.keys(entry.createdIds), 'undo'])].map((t) => db.table(t));
    await db.transaction('rw', tables, async () => {
      for (const [table, ids] of Object.entries(entry.createdIds)) if (ids.length) await db.table(table).bulkDelete(ids);
      for (const [table, rows] of Object.entries(entry.before)) if (rows.length) await db.table(table).bulkPut(rows);
      await db.undo.delete(entry.id);
    });
    notify();
    return entry.label;
  },

  async clear(): Promise<void> {
    await db.undo.clear();
    notify();
  },
};
