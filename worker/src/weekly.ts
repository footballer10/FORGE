import { addDays, weekStart } from '../../src/domain/calendar';
import { E1RM_FORMULA } from '../../src/domain/e1rm';
import { isAnalyticSet } from '../../src/domain/load';
import { detectPrs, liftSets } from '../../src/domain/prs';
import { readinessTrend } from '../../src/domain/readiness';
import type { Workout } from '../../src/domain/types';
import { getActiveProgram, getNutrition, type Data } from './tools';

export interface WeeklyReport {
  weekOf: string;
  subject: string;
  text: string;
  html: string;
}

const day = (iso: string) => iso.slice(0, 10); // UTC: the Worker has no time zone
const n0 = (n: number) => Math.round(n).toLocaleString('en-US');
const n1 = (n: number) => String(Math.round(n * 10) / 10);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Sunday summary of the Monday-start week that contains `asOf` (YYYY-MM-DD, UTC): sessions, working sets,
 * volume, PRs, nutrition and readiness averages, and the next sessions of the active program. Warm-ups excluded.
 */
export function buildWeeklyReport(d: Data, asOf: string): WeeklyReport {
  const from = weekStart(asOf);
  const to = addDays(from, 6);
  const unit = d.profile?.weightUnit ?? 'lb';
  const inWeek = (iso: string) => day(iso) >= from && day(iso) <= to;
  const finished = d.workouts.filter((w) => !w.deletedAt && !!w.endedAt);
  const week = finished.filter((w) => inWeek(w.startedAt)).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const weekIds = new Set(week.map((w) => w.id));
  const wmap = new Map<string, Workout>(finished.map((w) => [w.id, w]));
  const exById = new Map(d.exercises.map((e) => [e.id, e]));

  const working = d.sets.filter((s) => !s.deletedAt && isAnalyticSet(s) && wmap.has(s.workoutId));
  const thisWeek = working.filter((s) => weekIds.has(s.workoutId));

  // Volume and PRs from analytic lift sets (effective load in the profile unit).
  let volume = 0;
  const prs: string[] = [];
  const byEx = new Map<string, typeof working>();
  for (const s of working) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
  for (const [id, sets] of byEx) {
    const ex = exById.get(id);
    if (!ex) continue;
    const ls = liftSets(sets, ex, wmap, d.bodyMetrics, unit);
    for (const s of ls) if (weekIds.has(s.workoutId)) volume += s.load * s.reps;
    for (const e of detectPrs(ls, E1RM_FORMULA)) {
      if (!weekIds.has(e.workoutId) || e.kind === 'volume') continue;
      prs.push(e.kind === 'rep' ? `${ex.name}: ${n1(e.value)} ${unit} × ${e.reps} (was ${n1(e.previous)})` : `${ex.name}: e1RM ${n1(e.value)} ${unit} (was ${n1(e.previous)})`);
    }
  }

  const sessions = week.map((w) => {
    const sets = thisWeek.filter((s) => s.workoutId === w.id).length;
    const mins = Math.round((Date.parse(w.endedAt!) - Date.parse(w.startedAt)) / 60000);
    return `${day(w.startedAt)} ${w.name || 'Workout'}: ${sets} working sets, ${mins} min`;
  });

  // Nutrition averages over logged days in the week.
  const nut = getNutrition({ ...d, nutritionEntries: d.nutritionEntries.filter((e) => e.date >= from && e.date <= to) }, 7);
  const targets = d.profile?.nutritionTargets;
  const nutrition = nut.loggedDays
    ? `${nut.loggedDays} of 7 days logged · avg ${n0(nut.averageCalories ?? 0)} kcal${targets?.calories ? ` (target ${n0(targets.calories)})` : ''} · avg ${n0(nut.averageProteinG ?? 0)} g protein${targets?.proteinG ? ` (target ${n0(targets.proteinG)})` : ''}`
    : 'Nothing logged this week.';

  const r = readinessTrend(d.readiness ?? [], to, 7);
  const readiness = r.points.length
    ? `${r.points.length} check-ins · avg ${n1(r.avgWindow ?? 0)}/5${r.avgSleepHours !== undefined ? ` · avg sleep ${n1(r.avgSleepHours)} h` : ''}`
    : 'No check-ins this week.';

  // Next sessions of the active program, in order.
  const prog = getActiveProgram(d);
  let plan: string[] = [];
  let planTitle = 'Next week';
  if ('weeks' in prog && prog.weeks) {
    const perWeek = prog.daysPerWeek ?? d.profile?.plannedDaysPerWeek ?? 3;
    const pending = prog.weeks.flatMap((w) => w.sessions.filter((s) => !s.done && !s.skipped).map((s) => ({ ...s, week: w.week })));
    plan = pending.slice(0, perWeek).map((s) => `Week ${s.week} · ${s.name}${s.date ? ` (${s.date})` : ''}: ${s.exercises.map((e) => `${e.exercise} ${e.targets.join(', ')}`).join('; ')}`);
    planTitle = `Next week · ${prog.name}`;
    if (!plan.length) plan = ['Program complete. Ask Claude for the next block.'];
  } else plan = ['No active program.'];

  const totals = `${week.length} ${week.length === 1 ? 'session' : 'sessions'} · ${thisWeek.length} working sets · ${n0(volume)} ${unit} lifted`;
  const sections: [string, string[]][] = [
    ['This week', [totals]],
    ['Sessions', sessions.length ? sessions : ['No workouts this week.']],
    ['PRs', prs.length ? prs : ['None this week.']],
    ['Nutrition', [nutrition]],
    ['Readiness', [readiness]],
    [planTitle, plan],
  ];
  const subject = `Forge week of ${from}: ${week.length} ${week.length === 1 ? 'session' : 'sessions'}, ${prs.length} ${prs.length === 1 ? 'PR' : 'PRs'}`;
  const text = [`Forge · week of ${from} to ${to}`, '', ...sections.flatMap(([h, lines]) => [h.toUpperCase(), ...lines.map((l) => `- ${l}`), ''])].join('\n') +
    'Warm-ups are excluded. Volume = load × reps of working sets (dumbbells count one dumbbell). PRs: heaviest load at a rep count, and Epley e1RM.\n';
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;color:#111">
<h1 style="font-size:20px;margin:0 0 4px">Forge · week of ${esc(from)}</h1>
<p style="color:#666;margin:0 0 16px">${esc(from)} to ${esc(to)}</p>
${sections.map(([h, lines]) => `<h2 style="font-size:15px;text-transform:uppercase;letter-spacing:.04em;margin:16px 0 4px${h === 'PRs' && prs.length ? ';color:#d7261e' : ''}">${esc(h)}</h2><ul style="margin:0;padding-left:18px">${lines.map((l) => `<li style="margin:2px 0">${esc(l)}</li>`).join('')}</ul>`).join('\n')}
<p style="color:#888;font-size:12px;margin-top:20px">Warm-ups are excluded. Volume = load × reps of working sets (dumbbells count one dumbbell). PRs: heaviest load at a rep count, and Epley e1RM.</p>
</div>`;
  return { weekOf: from, subject, text, html };
}

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_TO?: string;
  /** Defaults to Resend's test sender, which can only mail the Resend account's own address. */
  EMAIL_FROM?: string;
}

/** The week a send at `now` reports on: 12 hours earlier, so a Sunday-night or early-Monday (UTC) run covers Monday–Sunday. */
export const reportDate = (now: Date) => new Date(now.getTime() - 12 * 3_600_000).toISOString().slice(0, 10);

export async function sendWeeklyEmail(env: EmailEnv, report: WeeklyReport, fetcher: typeof fetch = fetch): Promise<{ sent: boolean; reason?: string }> {
  if (!env.RESEND_API_KEY || !env.EMAIL_TO) return { sent: false, reason: 'RESEND_API_KEY and EMAIL_TO are not both set.' };
  const res = await fetcher('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM ?? 'Forge <onboarding@resend.dev>', to: [env.EMAIL_TO], subject: report.subject, text: report.text, html: report.html }),
  });
  if (!res.ok) return { sent: false, reason: `Resend answered ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { sent: true };
}
