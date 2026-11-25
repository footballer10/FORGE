/**
 * Forge JSON backup (pure): build, validate and merge-plan. See docs/export-format.md.
 * Progress photos (device-only blobs), the undo stack and app meta are not exported.
 */
export const EXPORT_FORMAT = 'forge-export';
export const EXPORT_VERSION = 1;

/** Tables included in a backup, in dependency-friendly order. */
export const EXPORT_TABLES = [
  'exercises',
  'workouts',
  'workoutExercises',
  'sets',
  'routines',
  'programs',
  'programWeeks',
  'plannedSessions',
  'bodyMetrics',
  'fitnessTests',
  'testResults',
  'readiness',
  'profile',
  'importBatches',
  'rawImportRows',
  'achievements',
  'aiDecisions',
  'nutritionEntries',
  'savedFoods',
] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

export type TableRows = Partial<Record<ExportTable, Record<string, unknown>[]>>;

export interface ExportFile {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  /** Row counts per table, for a quick sanity check. */
  counts: Record<string, number>;
  tables: TableRows;
}

export function buildExport(tables: TableRows, exportedAt: string): ExportFile {
  const out: TableRows = {};
  const counts: Record<string, number> = {};
  for (const t of EXPORT_TABLES) {
    const rows = tables[t] ?? [];
    out[t] = rows;
    counts[t] = rows.length;
  }
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, counts, tables: out };
}

export function parseExport(text: string): { file: ExportFile } | { error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'This is not a JSON file.' };
  }
  const f = data as Partial<ExportFile> | null;
  if (!f || typeof f !== 'object' || f.format !== EXPORT_FORMAT) return { error: 'This is not a Forge backup (format marker missing).' };
  if (typeof f.version !== 'number' || f.version > EXPORT_VERSION) {
    return { error: `This backup is version ${String(f.version)}; this app reads up to version ${EXPORT_VERSION}. Update the app first.` };
  }
  if (!f.tables || typeof f.tables !== 'object') return { error: 'The backup has no tables.' };
  const tables: TableRows = {};
  for (const t of EXPORT_TABLES) {
    const rows = (f.tables as Record<string, unknown>)[t];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) return { error: `Table "${t}" is not a list.` };
    for (const r of rows) {
      if (!r || typeof r !== 'object' || typeof (r as { id?: unknown }).id !== 'string') {
        return { error: `Table "${t}" has a row without an id.` };
      }
    }
    tables[t] = rows as Record<string, unknown>[];
  }
  return { file: { format: EXPORT_FORMAT, version: f.version, exportedAt: String(f.exportedAt ?? ''), counts: f.counts ?? {}, tables } };
}

export interface TableMergePlan {
  table: ExportTable;
  /** Rows not present locally. */
  add: Record<string, unknown>[];
  /** Rows present locally where the backup's updatedAt is newer. */
  update: Record<string, unknown>[];
  /** Rows kept as they are locally (same or newer). */
  keep: number;
}

const stamp = (r: Record<string, unknown> | undefined) => (typeof r?.updatedAt === 'string' ? r.updatedAt : '');

/**
 * Merge rule: match by id; the row with the later `updatedAt` wins; ties keep the local row.
 * A row soft-deleted in the newer copy stays soft-deleted (deletedAt travels with the row).
 */
export function planMerge(file: ExportFile, local: Partial<Record<ExportTable, Map<string, Record<string, unknown>>>>): TableMergePlan[] {
  return EXPORT_TABLES.flatMap((table) => {
    const rows = file.tables[table];
    if (!rows || rows.length === 0) return [];
    const have = local[table] ?? new Map();
    const plan: TableMergePlan = { table, add: [], update: [], keep: 0 };
    for (const r of rows) {
      const mine = have.get(r.id as string);
      if (!mine) plan.add.push(r);
      else if (stamp(r) > stamp(mine)) plan.update.push(r);
      else plan.keep++;
    }
    return [plan];
  });
}
