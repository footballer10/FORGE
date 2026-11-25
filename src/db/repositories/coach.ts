import { addDays, localDateKey } from '../../domain/calendar';
import { buildCoachSummary, formatTargets, type CoachSummaryInput, type SummaryLift, type SummaryPr } from '../../domain/coachSummary';
import { E1RM_MAX_REPS } from '../../domain/e1rm';
import { dailyWeights, ewmaTrend, trendChange } from '../../domain/bodyweight';
import { formatValue, summarizeTest } from '../../domain/fitness';
import { hasLoad } from '../../domain/load';
import { detectPrs, e1rmSeries, liftSets, type LiftSet } from '../../domain/prs';
import type { ID, SetEntry } from '../../domain/types';
import { balanceChecks, detectPlateau, totalsBetween, volumeSets } from '../../domain/volume';
import { analyticsRepo } from './analytics';
import { fitnessRepo } from './fitness';
import { nowIso } from './base';
import { profileRepo } from './profile';
import { aiDecisionRepo, exerciseRepo, programRepo } from './index';
import { treeToDraft, type DraftWeek } from '../../domain/program';
import { carryOverHistory, diffDrafts, extractJson, proposalToDraft, validateProposal, type DiffLine, type Proposal } from '../../domain/programProposal';
import type { Program } from '../../domain/types';

export interface ProposalPreview {
  errors: string[];
  proposal?: Proposal;
  draft?: DraftWeek[];
  /** Exercise names in the proposal that are not in the library. */
  missing: string[];
  diff: DiffLine[];
  /** The active program the proposal would replace, if any. */
  current?: Program;
  baseDraft?: DraftWeek[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const MAX_LIFTS = 15;
const PLATEAU_WEEKS = 6;

/** Gathers the summary numbers from storage (all via existing pure analytics) and renders them as text. */
export const coachRepo = {
  async summaryInput(days: number, today: string = localDateKey(new Date())): Promise<CoachSummaryInput> {
    const from = addDays(today, -(days - 1));
    const to = addDays(today, 1);
    const [profile, data, fitness, programs] = await Promise.all([
      profileRepo.get(), analyticsRepo.trainingData(), fitnessRepo.load(), programRepo.listLatest(),
    ]);
    const unit = profile.weightUnit;
    const weeks = days / 7;

    // Sessions in the window.
    let sessions = 0;
    let conditioningSessions = 0;
    for (const w of data.workouts.values()) {
      const day = localDateKey(w.startedAt);
      if (day < from || day >= to) continue;
      if (w.kind === 'conditioning') conditioningSessions += 1;
      else sessions += 1;
    }

    // Volume and muscles.
    const vsets = volumeSets(data.sets, data.exercises, data.workouts, data.metrics, unit);
    const totals = totalsBetween(vsets, from, to);
    const muscleSetsPerWeek = [...totals.byMuscle.entries()]
      .map(([muscle, sets]) => ({ muscle: String(muscle), sets: round1(sets / weeks) }))
      .sort((a, b) => b.sets - a.sets);
    const balance = balanceChecks(vsets, addDays(today, -27), to);

    // Lifts and PRs.
    const byExercise = new Map<ID, SetEntry[]>();
    for (const s of data.sets) {
      const arr = byExercise.get(s.exerciseId);
      if (arr) arr.push(s);
      else byExercise.set(s.exerciseId, [s]);
    }
    const lifts: SummaryLift[] = [];
    const prs: SummaryPr[] = [];
    for (const [id, sets] of byExercise) {
      const ex = data.exercises.get(id);
      if (!ex || ex.deletedAt || !hasLoad(ex)) continue;
      const ls: LiftSet[] = liftSets(sets, ex, data.workouts, data.metrics, unit);
      const inWindow = ls.filter((s) => localDateKey(s.date) >= from && localDateKey(s.date) < to);
      if (!inWindow.length) continue;
      const series = e1rmSeries(ls, profile.e1rmFormula);
      const before = series.filter((p) => localDateKey(p.date) < from);
      const now = series.filter((p) => localDateKey(p.date) >= from && localDateKey(p.date) < to);
      const top = inWindow.reduce((m, s) => (s.load * Math.min(s.reps, E1RM_MAX_REPS) > m.load * Math.min(m.reps, E1RM_MAX_REPS) ? s : m), inWindow[0]!);
      lifts.push({
        name: ex.name,
        sets: inWindow.length,
        ...(before.length ? { e1rmBefore: round1(Math.max(...before.map((p) => p.e1rm))) } : {}),
        ...(now.length ? { e1rmNow: round1(Math.max(...now.map((p) => p.e1rm))) } : {}),
        topSet: `${round1(top.load)} × ${top.reps}`,
        plateau: detectPlateau(series, today, PLATEAU_WEEKS).plateau,
      });
      for (const e of detectPrs(ls, profile.e1rmFormula)) {
        const day = localDateKey(e.date);
        if (day >= from && day < to) prs.push({ name: ex.name, date: day, kind: e.kind, ...(e.reps ? { reps: e.reps } : {}), value: round1(e.value), previous: round1(e.previous) });
      }
    }
    lifts.sort((a, b) => b.sets - a.sets);
    prs.sort((a, b) => b.date.localeCompare(a.date));

    // Bodyweight.
    const trend = ewmaTrend(dailyWeights(data.metrics, unit));
    const last = trend[trend.length - 1];
    const change = trendChange(trend, 28);

    // Fitness tests.
    const tests = fitness.tests.flatMap((t) => {
      const s = summarizeTest(fitness.results.filter((r) => r.testId === t.id), t.scoring);
      if (!s.latest || !s.best) return [];
      const fmt = (v: number) => formatValue(t.measure, v, profile.lengthUnit, s.latest?.unit ?? unit);
      return [{ name: t.name, latest: fmt(s.latest.value), latestDate: s.latest.date, best: fmt(s.best.value) }];
    });

    // Active program.
    const active = programs.find((p) => p.status === 'active');
    let program: CoachSummaryInput['program'];
    if (active) {
      const tree = await programRepo.getTree(active.id);
      if (tree) {
        const lines: string[] = [];
        let done = 0, skipped = 0, total = 0;
        const names = await analyticsRepo.exercisesByIds([...new Set(tree.weeks.flatMap((w) => w.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId))))]);
        for (const w of tree.weeks) {
          for (const s of w.sessions) {
            total += 1;
            if (s.completedWorkoutId) done += 1;
            if (s.skipped) skipped += 1;
            const status = s.completedWorkoutId ? 'done' : s.skipped ? 'skipped' : 'todo';
            const ex = s.exercises.map((e) => `${names.get(e.exerciseId)?.name ?? 'Exercise'} ${formatTargets(e.targets, unit)}`).join('; ');
            lines.push(`Week ${w.weekNumber}${w.isDeload ? ' (deload)' : ''} day ${s.dayNumber} "${s.name}" [${status}]: ${ex || 'no exercises'}`);
          }
        }
        program = { name: active.name, version: active.version, status: active.status, changeReason: active.changeReason, sessions: lines, done, skipped, total };
      }
    }

    const dflt = profile.defaultEquipmentProfileId;
    const w = (x?: { value: number; unit: string }) => (x ? `${x.value} ${x.unit}` : undefined);
    return {
      today, from, days, unit, formula: profile.e1rmFormula,
      profile: {
        ...(profile.birthYear ? { age: new Date().getFullYear() - profile.birthYear } : {}),
        ...(profile.sex ? { sex: profile.sex } : {}),
        ...(profile.heightCm ? { heightCm: profile.heightCm } : {}),
        goals: profile.goals, sport: profile.sport, position: profile.position, phase: profile.trainingPhase,
        constraints: profile.constraints, plannedDaysPerWeek: profile.plannedDaysPerWeek,
        equipment: profile.equipmentProfiles.map((e) => ({
          name: e.name, isDefault: e.id === dflt, items: e.equipment,
          maxDumbbell: w(e.maxDumbbell), bar: w(e.barWeight), plates: e.plates?.map((p) => p.value).join(', '), notes: e.notes,
        })),
      },
      ...(last ? { bodyweight: { latest: round1(last.value), latestDate: last.date, trend: round1(last.trend), ...(change ? { change28: round1(change.delta) } : {}) } } : {}),
      sessions, conditioningSessions, hardSets: totals.sets, volume: totals.volume,
      muscleSetsPerWeek, unassignedSets: totals.unassigned, balance,
      lifts: lifts.slice(0, MAX_LIFTS), prs, tests, ...(program ? { program } : {}),
    };
  },

  /** Parse, validate and resolve pasted text into a reviewable proposal. Saves nothing. */
  async prepareProposal(text: string): Promise<ProposalPreview> {
    const json = extractJson(text);
    if (json.error) return { errors: [json.error], missing: [], diff: [] };
    const { proposal, errors } = validateProposal(json.value);
    if (!proposal) return { errors, missing: [], diff: [] };

    const profile = await profileRepo.get();
    const all = await exerciseRepo.list();
    const byName = new Map<string, string>();
    const names = new Map<string, string>();
    for (const e of all) {
      names.set(e.id, e.name);
      for (const n of [e.name, ...e.aliases]) if (!byName.has(n.trim().toLowerCase())) byName.set(n.trim().toLowerCase(), e.id);
    }
    const { draft, missing } = proposalToDraft(proposal, (n) => byName.get(n.trim().toLowerCase()), profile.weightUnit, () => crypto.randomUUID());

    const active = (await programRepo.listLatest()).find((p) => p.status === 'active');
    const tree = active ? await programRepo.getTree(active.id) : undefined;
    const baseDraft = tree ? treeToDraft(tree) : [];
    const diff = diffDrafts(baseDraft, draft, names, profile.weightUnit);
    return { errors: [], proposal, draft, missing, diff, ...(active ? { current: active, baseDraft } : {}) };
  },

  /** Save an approved proposal as a program (new version of the active one, or a separate draft) and log the decision. */
  async approveProposal(preview: ProposalPreview, mode: 'update' | 'new', rawText: string, decisionId?: string): Promise<Program> {
    if (!preview.proposal || !preview.draft || preview.missing.length) throw new Error('Proposal is not ready to save.');
    const p = preview.proposal;
    const update = mode === 'update' && !!preview.current;
    const program = await programRepo.saveVersion({
      ...(update ? { previousId: preview.current!.id } : {}),
      fields: { name: p.name, ...(p.description ? { description: p.description } : {}), ...(p.daysPerWeek ? { daysPerWeek: p.daysPerWeek } : {}) },
      weeks: update ? carryOverHistory(preview.draft, preview.baseDraft ?? []) : preview.draft,
      reason: p.reason, author: 'claude',
    });
    const decision = {
      summary: `${p.name}: ${update ? `${preview.diff.length} change(s) to the active program` : 'new program'}`,
      reason: p.reason, status: 'approved' as const, programId: program.id, programVersion: program.version,
    };
    // A proposal from the inbox already has a row: update it instead of logging a second decision.
    if (decisionId && (await aiDecisionRepo.get(decisionId))) await aiDecisionRepo.update(decisionId, decision);
    else await aiDecisionRepo.create({ date: nowIso(), ...decision, payload: rawText });
    return program;
  },

  /** Proposals Claude left through the connector, waiting for the user's decision (newest first). */
  async pendingProposals() {
    return (await aiDecisionRepo.list()).filter((d) => d.status === 'proposed' && d.payload).sort((a, b) => b.date.localeCompare(a.date));
  },

  /** Reject an inbox proposal without opening it (also the way out of one that no longer validates). */
  async dismissProposal(decisionId: string): Promise<void> {
    await aiDecisionRepo.update(decisionId, { status: 'rejected' });
  },

  async rejectProposal(preview: ProposalPreview, rawText: string, decisionId?: string): Promise<void> {
    if (!preview.proposal) return;
    if (decisionId && (await aiDecisionRepo.get(decisionId))) return void (await aiDecisionRepo.update(decisionId, { status: 'rejected' }));
    await aiDecisionRepo.create({ date: nowIso(), summary: `${preview.proposal.name}: rejected`, reason: preview.proposal.reason, status: 'rejected', payload: rawText });
  },

  async summaryText(days: number, today?: string): Promise<string> {
    return buildCoachSummary(await coachRepo.summaryInput(days, today));
  },
};
