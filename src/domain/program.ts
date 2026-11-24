import type { ID, ISODate, PlannedSession, Program, ProgramWeek, RoutineExercise, TrainingPhase } from './types';

/** Editable copy of a program's weeks and sessions. `key` is a local identity (not a database ID). */
export interface DraftSession {
  key: string;
  name: string;
  exercises: RoutineExercise[];
  scheduledDate?: ISODate;
  notes?: string;
  /** Carried over from the saved row so a new version keeps the completed/skipped history. */
  completedWorkoutId?: ID;
  skipped?: boolean;
}

export interface DraftWeek {
  key: string;
  phase?: TrainingPhase;
  isDeload?: boolean;
  notes?: string;
  sessions: DraftSession[];
}

export interface ProgramTree {
  program: Program;
  weeks: (ProgramWeek & { sessions: PlannedSession[] })[];
}

const byWeek = (a: ProgramWeek, b: ProgramWeek) => a.weekNumber - b.weekNumber;
const byDay = (a: PlannedSession, b: PlannedSession) => a.dayNumber - b.dayNumber;

/** Weeks and sessions of a program in order. Rows are matched by `programWeekId`. */
export function buildTree(program: Program, weeks: ProgramWeek[], sessions: PlannedSession[]): ProgramTree {
  return {
    program,
    weeks: [...weeks].sort(byWeek).map((w) => ({ ...w, sessions: sessions.filter((s) => s.programWeekId === w.id).sort(byDay) })),
  };
}

export function treeToDraft(tree: ProgramTree): DraftWeek[] {
  return tree.weeks.map((w) => ({
    key: w.id,
    ...(w.phase ? { phase: w.phase } : {}),
    ...(w.isDeload ? { isDeload: true } : {}),
    ...(w.notes ? { notes: w.notes } : {}),
    sessions: w.sessions.map((s) => ({
      key: s.id,
      name: s.name,
      exercises: s.exercises,
      ...(s.scheduledDate ? { scheduledDate: s.scheduledDate } : {}),
      ...(s.notes ? { notes: s.notes } : {}),
      ...(s.completedWorkoutId ? { completedWorkoutId: s.completedWorkoutId } : {}),
      ...(s.skipped ? { skipped: true } : {}),
    })),
  }));
}

export const emptySession = (key: string, name = 'Session'): DraftSession => ({ key, name, exercises: [] });
export const emptyWeek = (key: string): DraftWeek => ({ key, sessions: [] });

/**
 * Copy week `index` and insert it right after. New keys come from `newKey`. The copy is a plan,
 * so completed/skipped markers are not copied.
 */
export function duplicateWeek(weeks: readonly DraftWeek[], index: number, newKey: () => string): DraftWeek[] {
  const src = weeks[index];
  if (!src) return [...weeks];
  const copy: DraftWeek = {
    ...src,
    key: newKey(),
    sessions: src.sessions.map(({ completedWorkoutId: _c, skipped: _s, ...s }) => ({ ...s, key: newKey() })),
  };
  return [...weeks.slice(0, index + 1), copy, ...weeks.slice(index + 1)];
}

/** Rows to store for a draft: week numbers and day numbers follow array order (1-based). */
export function draftToRows(
  weeks: readonly DraftWeek[],
  ids: { week: () => ID; session: () => ID },
  programId: ID,
): { weeks: Omit<ProgramWeek, 'createdAt' | 'updatedAt'>[]; sessions: Omit<PlannedSession, 'createdAt' | 'updatedAt'>[] } {
  const outWeeks: Omit<ProgramWeek, 'createdAt' | 'updatedAt'>[] = [];
  const outSessions: Omit<PlannedSession, 'createdAt' | 'updatedAt'>[] = [];
  weeks.forEach((w, wi) => {
    const weekId = ids.week();
    outWeeks.push({
      id: weekId,
      programId,
      weekNumber: wi + 1,
      ...(w.phase ? { phase: w.phase } : {}),
      ...(w.isDeload ? { isDeload: true } : {}),
      ...(w.notes ? { notes: w.notes } : {}),
    });
    w.sessions.forEach((s, si) => {
      outSessions.push({
        id: ids.session(),
        programId,
        programWeekId: weekId,
        dayNumber: si + 1,
        name: s.name.trim() || `Day ${si + 1}`,
        exercises: s.exercises.map((e, order) => ({ ...e, order })),
        ...(s.scheduledDate ? { scheduledDate: s.scheduledDate } : {}),
        ...(s.notes ? { notes: s.notes } : {}),
        ...(s.completedWorkoutId ? { completedWorkoutId: s.completedWorkoutId } : {}),
        ...(s.skipped ? { skipped: true } : {}),
      });
    });
  });
  return { weeks: outWeeks, sessions: outSessions };
}

/** First session, in plan order, that is neither done nor skipped. */
export function nextSession(tree: ProgramTree): { week: ProgramWeek; session: PlannedSession } | undefined {
  for (const week of tree.weeks) {
    const session = week.sessions.find((s) => !s.completedWorkoutId && !s.skipped);
    if (session) return { week, session };
  }
  return undefined;
}

/** Programs that no newer version has replaced. */
export function latestVersions(programs: readonly Program[]): Program[] {
  const superseded = new Set(programs.map((p) => p.previousVersionId).filter((x): x is ID => !!x));
  return programs.filter((p) => !superseded.has(p.id));
}

/** `program` and its ancestors, newest first. Stops at a missing or repeated link. */
export function versionChain(program: Program, all: readonly Program[]): Program[] {
  const byId = new Map(all.map((p) => [p.id, p]));
  const out: Program[] = [];
  const seen = new Set<ID>();
  for (let p: Program | undefined = program; p && !seen.has(p.id); p = p.previousVersionId ? byId.get(p.previousVersionId) : undefined) {
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function weekLabel(w: Pick<ProgramWeek, 'weekNumber' | 'phase' | 'isDeload'>): string {
  const extra = [w.isDeload ? 'deload' : '', w.phase && !(w.isDeload && w.phase === 'deload') ? w.phase : ''].filter(Boolean).join(' · ');
  return `Week ${w.weekNumber}${extra ? ` · ${extra}` : ''}`;
}
