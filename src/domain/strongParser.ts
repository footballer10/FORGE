/**
 * Strong CSV parser (pure). Turns the text of a Strong export into rows, then into
 * workouts → exercises → sets. No unit conversion or dumbbell halving happens here:
 * values are exactly what the file says (that lives in importPlan.ts so conventions
 * can be re-applied later from the raw rows).
 */
import { parseCsvRecords } from './csv';
import type { ISODateTime, SetType, WeightUnit } from './types';

export interface StrongColumns {
  date: string;
  workoutName?: string;
  duration?: string;
  exerciseName: string;
  setOrder?: string;
  weight?: string;
  reps?: string;
  distance?: string;
  seconds?: string;
  notes?: string;
  workoutNotes?: string;
  rpe?: string;
  weightUnit?: string;
  /** Unit stated in the weight header, e.g. "Weight (kg)". */
  headerWeightUnit?: WeightUnit;
  /** Unit of the distance column in metres per unit: m=1, km=1000, mi=1609.344. */
  distanceFactor: number;
}

export interface StrongRow {
  /** 0-based index among data rows of the file. */
  rowIndex: number;
  startedAt: ISODateTime;
  workoutName: string;
  durationSec?: number;
  exerciseName: string;
  /** Raw "Set Order" text: "1", "W", "D", "F", ... */
  setOrder: string;
  type: SetType;
  weight?: number;
  /** Unit stated by the file for this row, if any. */
  weightUnit?: WeightUnit;
  reps?: number;
  distanceM?: number;
  seconds?: number;
  notes: string;
  workoutNotes: string;
  rpe?: number;
  /** The record exactly as in the file. */
  raw: Record<string, string>;
}

export interface StrongParseResult {
  rows: StrongRow[];
  /** "Rest Timer" rows and other non-set rows, ignored. */
  ignoredRows: number;
  warnings: string[];
  /** Weight unit the file states, if it states one consistently. */
  fileWeightUnit?: WeightUnit;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9()]/g, '');

export function resolveColumns(headers: string[]): StrongColumns | { error: string } {
  const find = (...names: string[]) => headers.find((h) => names.includes(norm(h)));
  const date = find('date', 'datetime', 'startdate');
  const exerciseName = find('exercisename', 'exercise');
  if (!date) return { error: 'No "Date" column found. This does not look like a Strong export.' };
  if (!exerciseName) return { error: 'No "Exercise Name" column found. This does not look like a Strong export.' };
  const weight = headers.find((h) => /^weight(\((kg|kgs|lb|lbs)\))?$/.test(norm(h)));
  const hw = weight ? /\((kg|kgs|lb|lbs)\)/.exec(norm(weight)) : null;
  const distance = headers.find((h) => /^distance(\((m|km|mi|miles?)\))?$/.test(norm(h)));
  const du = distance ? /\((m|km|mi|miles?)\)/.exec(norm(distance)) : null;
  const factor = du ? (du[1] === 'km' ? 1000 : du[1] === 'm' ? 1 : 1609.344) : 1;
  const cols: StrongColumns = { date, exerciseName, distanceFactor: factor };
  const set = <K extends keyof StrongColumns>(k: K, v: StrongColumns[K] | undefined) => {
    if (v !== undefined) cols[k] = v;
  };
  set('workoutName', find('workoutname', 'workout'));
  set('duration', find('duration', 'workoutduration'));
  set('setOrder', find('setorder', 'set'));
  set('weight', weight);
  set('reps', find('reps', 'repetitions'));
  set('distance', distance);
  set('seconds', find('seconds', 'time'));
  set('notes', find('notes'));
  set('workoutNotes', find('workoutnotes'));
  set('rpe', find('rpe'));
  set('weightUnit', find('weightunit', 'unit'));
  if (hw) cols.headerWeightUnit = hw[1]!.startsWith('k') ? 'kg' : 'lb';
  return cols;
}

/** "1h 5m", "45m", "1h", "1h 5m 30s", "01:05:00", "65:30", "3900" → seconds. */
export function parseDuration(text: string): number | undefined {
  const t = text.trim().toLowerCase();
  if (!t) return undefined;
  const hms = /^(\d+):(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (hms) {
    return hms[3] !== undefined
      ? Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3])
      : Number(hms[1]) * 60 + Number(hms[2]);
  }
  const units = /^(?:(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?$/.exec(t);
  if (units && (units[1] || units[2] || units[3])) {
    return Math.round(Number(units[1] ?? 0) * 3600 + Number(units[2] ?? 0) * 60 + Number(units[3] ?? 0));
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Strong dates are local wall-clock time without a zone: "2024-03-05 18:30:12". */
export function parseStrongDate(text: string): ISODateTime | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(text.trim());
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function num(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

function setTypeOf(order: string): SetType | 'ignore' {
  const o = order.trim().toLowerCase();
  if (o === 'w') return 'warmup';
  if (o === 'd') return 'drop';
  if (o === 'f') return 'failure';
  if (/rest/.test(o)) return 'ignore';
  return 'working';
}

/** Read one record into a StrongRow. Returns null for rows to ignore (rest timers, blank dates). */
export function readStrongRecord(
  rec: Record<string, string>,
  cols: StrongColumns,
  rowIndex: number,
): { row: StrongRow } | { ignored: true; warning?: string } {
  const get = (k?: string) => (k ? (rec[k] ?? '') : '');
  const setOrder = get(cols.setOrder).trim();
  const type = setTypeOf(setOrder);
  if (type === 'ignore') return { ignored: true };
  const exerciseName = get(cols.exerciseName).trim();
  if (!exerciseName) return { ignored: true };
  const startedAt = parseStrongDate(get(cols.date));
  if (!startedAt) return { ignored: true, warning: `Row ${rowIndex + 2}: unreadable date "${get(cols.date)}", skipped.` };

  const unitText = get(cols.weightUnit).trim().toLowerCase();
  const unit: WeightUnit | undefined = cols.headerWeightUnit ?? (unitText.startsWith('k') ? 'kg' : unitText.startsWith('l') ? 'lb' : undefined);
  const dist = num(get(cols.distance));
  const secs = num(get(cols.seconds));
  const rpe = num(get(cols.rpe));
  const durationSec = parseDuration(get(cols.duration));
  const row: StrongRow = {
    rowIndex,
    startedAt,
    workoutName: get(cols.workoutName).trim() || 'Workout',
    exerciseName,
    setOrder,
    type,
    notes: get(cols.notes).trim(),
    workoutNotes: get(cols.workoutNotes).trim(),
    raw: rec,
  };
  if (durationSec !== undefined) row.durationSec = durationSec;
  const w = num(get(cols.weight));
  if (w !== undefined) row.weight = w;
  if (unit) row.weightUnit = unit;
  const reps = num(get(cols.reps));
  if (reps !== undefined) row.reps = reps;
  if (dist !== undefined && dist > 0) row.distanceM = Math.round(dist * cols.distanceFactor * 1000) / 1000;
  if (secs !== undefined && secs > 0) row.seconds = secs;
  if (rpe !== undefined && rpe >= 1 && rpe <= 10) row.rpe = rpe;
  return { row };
}

export function parseStrongCsv(text: string): StrongParseResult | { error: string } {
  const { headers, records } = parseCsvRecords(text);
  if (headers.length === 0) return { error: 'The file is empty.' };
  const cols = resolveColumns(headers);
  if ('error' in cols) return cols;
  const rows: StrongRow[] = [];
  const warnings: string[] = [];
  let ignoredRows = 0;
  records.forEach((rec, i) => {
    const r = readStrongRecord(rec, cols, i);
    if ('row' in r) rows.push(r.row);
    else {
      ignoredRows++;
      if (r.warning) warnings.push(r.warning);
    }
  });
  const units = new Set(rows.flatMap((r) => (r.weightUnit ? [r.weightUnit] : [])));
  const result: StrongParseResult = { rows, ignoredRows, warnings };
  if (units.size === 1) result.fileWeightUnit = [...units][0]!;
  if (units.size > 1) warnings.push('The file mixes kg and lb rows; each row keeps its own unit.');
  return result;
}

// ---------------------------------------------------------------------------
// Grouping rows into workouts
// ---------------------------------------------------------------------------

export interface ParsedExercise {
  name: string;
  rows: StrongRow[];
}

export interface ParsedWorkout {
  /** `${startedAt}|${name}`: Strong repeats the start time on every row of a workout. */
  key: string;
  startedAt: ISODateTime;
  name: string;
  durationSec?: number;
  notes: string;
  exercises: ParsedExercise[];
}

export function groupStrongWorkouts(rows: StrongRow[]): ParsedWorkout[] {
  const byKey = new Map<string, ParsedWorkout>();
  for (const r of rows) {
    const key = `${r.startedAt}|${r.workoutName}`;
    let w = byKey.get(key);
    if (!w) {
      w = { key, startedAt: r.startedAt, name: r.workoutName, notes: r.workoutNotes, exercises: [] };
      if (r.durationSec !== undefined) w.durationSec = r.durationSec;
      byKey.set(key, w);
    }
    if (!w.notes && r.workoutNotes) w.notes = r.workoutNotes;
    if (w.durationSec === undefined && r.durationSec !== undefined) w.durationSec = r.durationSec;
    let ex = w.exercises.find((e) => e.name === r.exerciseName);
    if (!ex) {
      ex = { name: r.exerciseName, rows: [] };
      w.exercises.push(ex);
    }
    ex.rows.push(r);
  }
  return [...byKey.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}
