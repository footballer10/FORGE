/**
 * Programs proposed by Claude: parse pasted JSON, validate it against the schema in `docs/program-schema.md`,
 * resolve exercise names, and diff against the current program. Pure; nothing is saved here.
 */
import { formatTargets } from './coachSummary';
import type { DraftSession, DraftWeek } from './program';
import type { ProgressionRule, RoutineExercise, SetType, TargetSet, TrainingPhase, WeightUnit } from './types';

export const SCHEMA_VERSION = 1;

export interface ProposalSet {
  type?: SetType;
  /** Repeat this set definition N times (default 1). */
  count?: number;
  reps?: number;
  repsMax?: number;
  weight?: number;
  unit?: WeightUnit;
  percentE1rm?: number;
  rpe?: number;
  durationSec?: number;
  distanceM?: number;
  /** Rest after this set, seconds (0 to 1800). */
  restSec?: number;
}
export interface ProposalExercise {
  exercise: string;
  sets: ProposalSet[];
  restSec?: number;
  notes?: string;
  /** Same label on consecutive exercises = superset. */
  superset?: string;
  progression?: ProgressionRule;
}
export interface ProposalSession { name: string; notes?: string; exercises: ProposalExercise[] }
export interface ProposalWeek { phase?: TrainingPhase; deload?: boolean; notes?: string; sessions: ProposalSession[] }
export interface Proposal {
  name: string;
  description?: string;
  daysPerWeek?: number;
  /** Why Claude proposes this; shown to the user and stored as the change reason. */
  reason: string;
  weeks: ProposalWeek[];
}

const PHASES: TrainingPhase[] = ['offseason', 'preseason', 'inseason', 'hypertrophy', 'strength', 'power', 'deload', 'testing'];
const SET_TYPES: SetType[] = ['warmup', 'working', 'drop', 'failure', 'amrap'];
const MAX_WEEKS = 52, MAX_SESSIONS = 7, MAX_EXERCISES = 20, MAX_SETS = 30;

/** Pull the JSON object out of pasted text (accepts ``` fences and chatter around it). */
export function extractJson(text: string): { value?: unknown; error?: string } {
  const t = text.trim();
  if (!t) return { error: 'Nothing pasted.' };
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  const body = fenced ? fenced[1]! : t;
  const start = body.indexOf('{'), end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return { error: 'No JSON object found. Paste the whole JSON block Claude gave you.' };
  try {
    return { value: JSON.parse(body.slice(start, end + 1)) };
  } catch (e) {
    return { error: `Not valid JSON: ${(e as Error).message}` };
  }
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Checks every field; collects all problems (with paths) rather than stopping at the first. */
export function validateProposal(raw: unknown): { proposal?: Proposal; errors: string[] } {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`);
  if (!isObj(raw)) return { errors: ['Top level must be a JSON object.'] };

  const str = (o: Obj, k: string, path: string, required: boolean): string | undefined => {
    const v = o[k];
    if (v === undefined) { if (required) err(`${path}.${k}`, 'required'); return undefined; }
    if (typeof v !== 'string' || !v.trim()) { err(`${path}.${k}`, 'must be non-empty text'); return undefined; }
    return v.trim();
  };
  const num = (o: Obj, k: string, path: string, min: number, max: number, int = false): number | undefined => {
    const v = o[k];
    if (v === undefined) return undefined;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (int && !Number.isInteger(v))) {
      err(`${path}.${k}`, `must be ${int ? 'a whole ' : 'a '}number from ${min} to ${max}`);
      return undefined;
    }
    return v;
  };
  const unknownKeys = (o: Obj, allowed: string[], path: string) => {
    for (const k of Object.keys(o)) if (!allowed.includes(k)) err(`${path}.${k}`, 'unknown field');
  };

  if (raw.schemaVersion !== SCHEMA_VERSION) err('schemaVersion', `must be ${SCHEMA_VERSION}`);
  unknownKeys(raw, ['schemaVersion', 'name', 'description', 'daysPerWeek', 'reason', 'weeks'], '$');
  const name = str(raw, 'name', '$', true);
  const description = str(raw, 'description', '$', false);
  const reason = str(raw, 'reason', '$', true);
  const daysPerWeek = num(raw, 'daysPerWeek', '$', 1, 7, true);

  const weeks: ProposalWeek[] = [];
  if (!Array.isArray(raw.weeks) || raw.weeks.length === 0) err('$.weeks', 'must be a non-empty list');
  else if (raw.weeks.length > MAX_WEEKS) err('$.weeks', `at most ${MAX_WEEKS} weeks`);
  else raw.weeks.forEach((w, wi) => {
    const wp = `weeks[${wi}]`;
    if (!isObj(w)) return err(wp, 'must be an object');
    unknownKeys(w, ['phase', 'deload', 'notes', 'sessions'], wp);
    let phase: TrainingPhase | undefined;
    if (w.phase !== undefined) {
      if (typeof w.phase === 'string' && PHASES.includes(w.phase as TrainingPhase)) phase = w.phase as TrainingPhase;
      else err(`${wp}.phase`, `must be one of ${PHASES.join(', ')}`);
    }
    if (w.deload !== undefined && typeof w.deload !== 'boolean') err(`${wp}.deload`, 'must be true or false');
    const notes = str(w, 'notes', wp, false);
    const sessions: ProposalSession[] = [];
    if (!Array.isArray(w.sessions) || w.sessions.length === 0) err(`${wp}.sessions`, 'must be a non-empty list');
    else if (w.sessions.length > MAX_SESSIONS) err(`${wp}.sessions`, `at most ${MAX_SESSIONS} sessions`);
    else w.sessions.forEach((s, si) => {
      const sp = `${wp}.sessions[${si}]`;
      if (!isObj(s)) return err(sp, 'must be an object');
      unknownKeys(s, ['name', 'notes', 'exercises'], sp);
      const sname = str(s, 'name', sp, true);
      const snotes = str(s, 'notes', sp, false);
      const exercises: ProposalExercise[] = [];
      if (!Array.isArray(s.exercises) || s.exercises.length === 0) err(`${sp}.exercises`, 'must be a non-empty list');
      else if (s.exercises.length > MAX_EXERCISES) err(`${sp}.exercises`, `at most ${MAX_EXERCISES} exercises`);
      else s.exercises.forEach((e, ei) => {
        const ep = `${sp}.exercises[${ei}]`;
        if (!isObj(e)) return err(ep, 'must be an object');
        unknownKeys(e, ['exercise', 'sets', 'restSec', 'notes', 'superset', 'progression'], ep);
        const exName = str(e, 'exercise', ep, true);
        const restSec = num(e, 'restSec', ep, 0, 1800, true);
        const enotes = str(e, 'notes', ep, false);
        const superset = str(e, 'superset', ep, false);
        const sets: ProposalSet[] = [];
        if (!Array.isArray(e.sets) || e.sets.length === 0) err(`${ep}.sets`, 'must be a non-empty list');
        else e.sets.forEach((t, ti) => {
          const tp = `${ep}.sets[${ti}]`;
          if (!isObj(t)) return err(tp, 'must be an object');
          unknownKeys(t, ['type', 'count', 'reps', 'repsMax', 'weight', 'unit', 'percentE1rm', 'rpe', 'durationSec', 'distanceM', 'restSec'], tp);
          let type: SetType | undefined;
          if (t.type !== undefined) {
            if (typeof t.type === 'string' && SET_TYPES.includes(t.type as SetType)) type = t.type as SetType;
            else err(`${tp}.type`, `must be one of ${SET_TYPES.join(', ')}`);
          }
          let unit: WeightUnit | undefined;
          if (t.unit !== undefined) {
            if (t.unit === 'lb' || t.unit === 'kg') unit = t.unit;
            else err(`${tp}.unit`, 'must be "lb" or "kg"');
          }
          const set: ProposalSet = {
            ...(type ? { type } : {}), ...(unit ? { unit } : {}),
          };
          const put = (k: keyof ProposalSet, v: number | undefined) => { if (v !== undefined) (set as Obj)[k] = v; };
          put('count', num(t, 'count', tp, 1, MAX_SETS, true));
          put('reps', num(t, 'reps', tp, 1, 200, true));
          put('repsMax', num(t, 'repsMax', tp, 1, 200, true));
          put('weight', num(t, 'weight', tp, 0, 5000));
          put('percentE1rm', num(t, 'percentE1rm', tp, 0.1, 1.2));
          put('rpe', num(t, 'rpe', tp, 1, 10));
          put('durationSec', num(t, 'durationSec', tp, 1, 36000, true));
          put('distanceM', num(t, 'distanceM', tp, 1, 200000));
          put('restSec', num(t, 'restSec', tp, 0, 1800, true));
          if (set.repsMax !== undefined && (set.reps === undefined || set.repsMax < set.reps)) err(`${tp}.repsMax`, 'needs reps and must be at least reps');
          if (set.weight !== undefined && set.percentE1rm !== undefined) err(tp, 'give weight or percentE1rm, not both');
          if (set.reps === undefined && set.durationSec === undefined && set.distanceM === undefined) err(tp, 'needs reps, durationSec or distanceM');
          sets.push(set);
        });
        let progression: ProgressionRule | undefined;
        if (e.progression !== undefined) progression = validateProgression(e.progression, `${ep}.progression`, err);
        if (exName) exercises.push({ exercise: exName, sets, ...(restSec !== undefined ? { restSec } : {}), ...(enotes ? { notes: enotes } : {}), ...(superset ? { superset } : {}), ...(progression ? { progression } : {}) });
      });
      if (sname) sessions.push({ name: sname, ...(snotes ? { notes: snotes } : {}), exercises });
    });
    weeks.push({ ...(phase ? { phase } : {}), ...(w.deload === true ? { deload: true } : {}), ...(notes ? { notes } : {}), sessions });
  });

  if (errors.length || !name || !reason) return { errors };
  return { errors, proposal: { name, ...(description ? { description } : {}), ...(daysPerWeek ? { daysPerWeek } : {}), reason, weeks } };
}

function validateProgression(v: unknown, path: string, err: (p: string, m: string) => void): ProgressionRule | undefined {
  if (!isObj(v)) return void err(path, 'must be an object');
  const n = (k: string, min: number, max: number): number | undefined => {
    const x = v[k];
    if (typeof x !== 'number' || !Number.isFinite(x) || x < min || x > max) return void err(`${path}.${k}`, `must be a number from ${min} to ${max}`);
    return x;
  };
  switch (v.kind) {
    case 'none': return { kind: 'none' };
    case 'doubleProgression': {
      const repsMin = n('repsMin', 1, 100), repsMax = n('repsMax', 1, 100);
      if (repsMin === undefined || repsMax === undefined) return undefined;
      if (repsMax < repsMin) return void err(`${path}.repsMax`, 'must be at least repsMin');
      return { kind: 'doubleProgression', repsMin, repsMax };
    }
    case 'percentE1rm': { const percent = n('percent', 0.1, 1.2); return percent === undefined ? undefined : { kind: 'percentE1rm', percent }; }
    case 'rpeTarget': { const rpe = n('rpe', 1, 10); return rpe === undefined ? undefined : { kind: 'rpeTarget', rpe }; }
    default: return void err(`${path}.kind`, 'must be none, doubleProgression, percentE1rm or rpeTarget');
  }
}

/** Exercise names used in the proposal, in first-use order. */
export const proposalExerciseNames = (p: Proposal): string[] =>
  [...new Set(p.weeks.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => e.exercise))))];

/**
 * Turn a proposal into editable draft weeks. `lookup` maps an exercise name to its ID; names it cannot
 * resolve are returned in `missing` and the draft must not be saved. Repeated sets are expanded.
 */
export function proposalToDraft(
  p: Proposal,
  lookup: (name: string) => string | undefined,
  defaultUnit: WeightUnit,
  newKey: () => string,
): { draft: DraftWeek[]; missing: string[] } {
  const missing = new Set<string>();
  const draft = p.weeks.map((w): DraftWeek => ({
    key: newKey(),
    ...(w.phase ? { phase: w.phase } : {}),
    ...(w.deload ? { isDeload: true } : {}),
    ...(w.notes ? { notes: w.notes } : {}),
    sessions: w.sessions.map((s): DraftSession => ({
      key: newKey(), name: s.name, ...(s.notes ? { notes: s.notes } : {}),
      exercises: s.exercises.flatMap((e, order): RoutineExercise[] => {
        const id = lookup(e.exercise);
        if (!id) { missing.add(e.exercise); return []; }
        const targets: TargetSet[] = e.sets.flatMap((t) =>
          Array.from({ length: t.count ?? 1 }, (): TargetSet => ({
            type: t.type ?? 'working',
            ...(t.reps !== undefined ? { reps: t.reps } : {}), ...(t.repsMax !== undefined ? { repsMax: t.repsMax } : {}),
            ...(t.weight !== undefined ? { weight: t.weight, unit: t.unit ?? defaultUnit } : {}),
            ...(t.percentE1rm !== undefined ? { percentE1rm: t.percentE1rm } : {}),
            ...(t.rpe !== undefined ? { rpe: t.rpe } : {}),
            ...(t.durationSec !== undefined ? { durationSec: t.durationSec } : {}),
            ...(t.distanceM !== undefined ? { distanceM: t.distanceM } : {}),
            ...(t.restSec !== undefined ? { restSec: t.restSec } : {}),
          }),
        ));
        return [{
          exerciseId: id, order, targets,
          ...(e.restSec !== undefined ? { restSec: e.restSec } : {}), ...(e.notes ? { notes: e.notes } : {}),
          ...(e.superset ? { supersetGroup: e.superset } : {}), ...(e.progression ? { progression: e.progression } : {}),
        }];
      }),
    })),
  }));
  return { draft, missing: [...missing] };
}

const sessionKey = (s: { name: string }) => s.name.trim().toLowerCase();

/**
 * Pair the sessions of one week by NAME (each used once, in order), so inserting or moving a session does
 * not mark every later day as changed. Leftovers pair up in order as renames; the rest are added or removed.
 * Returns [oldIndex, newIndex] pairs in new-plan order, then removed ones.
 */
export function matchSessions(old: readonly { name: string }[], next: readonly { name: string }[]): [number | undefined, number | undefined][] {
  const used = new Set<number>();
  const pairOf = new Map<number, number>();
  next.forEach((n, ni) => {
    const oi = old.findIndex((o, k) => !used.has(k) && sessionKey(o) === sessionKey(n));
    if (oi >= 0) {
      used.add(oi);
      pairOf.set(ni, oi);
    }
  });
  const leftoverOld = old.map((_, k) => k).filter((k) => !used.has(k));
  const out: [number | undefined, number | undefined][] = [];
  next.forEach((_, ni) => {
    let oi = pairOf.get(ni);
    if (oi === undefined && leftoverOld.length) oi = leftoverOld.shift();
    if (oi !== undefined) used.add(oi);
    out.push([oi, ni]);
  });
  for (const k of leftoverOld) out.push([k, undefined]);
  return out;
}

/**
 * Keep completed / skipped history where the plan still has a session with the same name in the same
 * week (wherever it moved within the week).
 */
export function carryOverHistory(next: DraftWeek[], old: DraftWeek[]): DraftWeek[] {
  return next.map((w, wi) => {
    const prev = old[wi]?.sessions ?? [];
    const used = new Set<number>();
    return {
      ...w,
      sessions: w.sessions.map((s) => {
        const oi = prev.findIndex((o, k) => !used.has(k) && sessionKey(o) === sessionKey(s));
        if (oi < 0) return s;
        used.add(oi);
        const o = prev[oi]!;
        return { ...s, ...(o.completedWorkoutId ? { completedWorkoutId: o.completedWorkoutId } : {}), ...(o.skipped ? { skipped: true } : {}) };
      }),
    };
  });
}

export interface DiffLine { kind: 'added' | 'removed' | 'changed'; text: string }

/**
 * Human-readable differences between the current and proposed plan. Sessions are matched by position
 * (week, day), exercises by exercise ID. `names` maps exercise ID → name.
 */
export function diffDrafts(old: DraftWeek[], next: DraftWeek[], names: ReadonlyMap<string, string>, unit: WeightUnit): DiffLine[] {
  const out: DiffLine[] = [];
  const nm = (id: string) => names.get(id) ?? 'Exercise';
  const exLine = (e: RoutineExercise) => `${nm(e.exerciseId)} ${formatTargets(e.targets, unit)}`;
  const count = Math.max(old.length, next.length);
  for (let wi = 0; wi < count; wi++) {
    const ow = old[wi], nw = next[wi];
    const label = `Week ${wi + 1}`;
    if (!ow && nw) { out.push({ kind: 'added', text: `${label}: new week with ${nw.sessions.length} session(s)` }); continue; }
    if (ow && !nw) { out.push({ kind: 'removed', text: `${label}: removed (${ow.sessions.length} session(s))` }); continue; }
    if (!ow || !nw) continue;
    if ((ow.phase ?? '') !== (nw.phase ?? '') || !!ow.isDeload !== !!nw.isDeload)
      out.push({ kind: 'changed', text: `${label}: phase ${ow.phase ?? 'none'}${ow.isDeload ? ' (deload)' : ''} → ${nw.phase ?? 'none'}${nw.isDeload ? ' (deload)' : ''}` });
    for (const [oi, ni] of matchSessions(ow.sessions, nw.sessions)) {
      const os = oi === undefined ? undefined : ow.sessions[oi];
      const ns = ni === undefined ? undefined : nw.sessions[ni];
      const sl = `${label} day ${(ni ?? oi ?? 0) + 1}`;
      if (!os && ns) { out.push({ kind: 'added', text: `${sl} "${ns.name}": ${ns.exercises.map(exLine).join('; ')}` }); continue; }
      if (os && !ns) { out.push({ kind: 'removed', text: `${label} day ${(oi ?? 0) + 1} "${os.name}"` }); continue; }
      if (!os || !ns) continue;
      if (os.name !== ns.name) out.push({ kind: 'changed', text: `${sl}: renamed "${os.name}" → "${ns.name}"` });
      if (oi !== ni && os.name === ns.name) out.push({ kind: 'changed', text: `${sl}: "${ns.name}" moved from day ${(oi ?? 0) + 1}` });
      const oldBy = new Map(os.exercises.map((e) => [e.exerciseId, e]));
      const newBy = new Map(ns.exercises.map((e) => [e.exerciseId, e]));
      for (const e of ns.exercises) {
        const o = oldBy.get(e.exerciseId);
        if (!o) out.push({ kind: 'added', text: `${sl}: ${exLine(e)}` });
        else {
          const a = formatTargets(o.targets, unit), b = formatTargets(e.targets, unit);
          const restsA = o.targets.map((t) => t.restSec ?? '').join(','), restsB = e.targets.map((t) => t.restSec ?? '').join(',');
          if (a !== b) out.push({ kind: 'changed', text: `${sl}: ${nm(e.exerciseId)} ${a} → ${b}` });
          else if ((o.restSec ?? -1) !== (e.restSec ?? -1)) out.push({ kind: 'changed', text: `${sl}: ${nm(e.exerciseId)} rest ${o.restSec ?? 'default'} → ${e.restSec ?? 'default'} s` });
          else if (restsA !== restsB) out.push({ kind: 'changed', text: `${sl}: ${nm(e.exerciseId)} set rest times changed` });
        }
      }
      for (const e of os.exercises) if (!newBy.has(e.exerciseId)) out.push({ kind: 'removed', text: `${sl}: ${nm(e.exerciseId)}` });
    }
  }
  return out;
}

/** Text the user pastes into Claude so its answer fits the format (mirrors docs/program-schema.md). */
export const PROGRAM_FORMAT_PROMPT = `When you propose a training program, reply with ONE JSON object (inside a \`\`\`json fence) in exactly this format. I will review a diff and approve it in my app; nothing changes before that.

Rules: no comments or trailing commas; unknown fields are errors; "exercise" must be a name from my exercise library (e.g. "Barbell Squat", "Pull-up"); weights are numbers in my unit unless a set has "unit": "lb" or "kg"; dumbbell weights are per dumbbell; "reason" is required and must say why the change is made, citing my numbers.

{
  "schemaVersion": 1,
  "name": "text",
  "description": "optional text",
  "reason": "why this change",
  "daysPerWeek": 3,
  "weeks": [
    {
      "phase": "optional: offseason|preseason|inseason|hypertrophy|strength|power|deload|testing",
      "deload": false,
      "notes": "optional",
      "sessions": [
        {
          "name": "Lower A",
          "notes": "optional",
          "exercises": [
            {
              "exercise": "Barbell Squat",
              "restSec": 180,
              "superset": "optional label shared by consecutive exercises",
              "notes": "optional",
              "progression": { "kind": "doubleProgression", "repsMin": 6, "repsMax": 8 },
              "sets": [
                { "type": "warmup", "reps": 5, "weight": 135 },
                { "count": 4, "reps": 5, "weight": 225, "rpe": 8 }
              ]
            }
          ]
        }
      ]
    }
  ]
}

Set fields: type (warmup|working|drop|failure|amrap, default working), count (repeat N times), reps, repsMax (range), weight, unit, percentE1rm (0.75 = 75%, not with weight), rpe, durationSec, distanceM, restSec (rest after this set in seconds; use it for per-set timers). A set needs reps, durationSec or distanceM. Progression kinds: none; doubleProgression (repsMin, repsMax); percentE1rm (percent); rpeTarget (rpe). Limits: 52 weeks, 7 sessions per week, 20 exercises per session.`;
