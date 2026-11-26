import { describe, expect, it, vi } from 'vitest';
import type { Data } from './tools';
import { buildWeeklyReport, reportDate, sendWeeklyEmail } from './weekly';

const base = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };
const ex = { id: 'sq', name: 'Squat', aliases: [], equipment: 'barbell', primaryMuscles: ['quads'], secondaryMuscles: [], pattern: 'squat', loadModel: 'total', ...base };
const wo = (id: string, date: string) => ({ id, name: 'Legs', startedAt: `${date}T15:00:00Z`, endedAt: `${date}T16:00:00Z`, kind: 'strength', ...base });
const set = (id: string, workoutId: string, weight: number, reps: number, type = 'working') => ({ id, workoutExerciseId: `we-${workoutId}`, workoutId, exerciseId: 'sq', order: 0, type, weight, unit: 'lb', reps, completedAt: '2026-01-01T00:00:00Z', ...base });

const data = {
  profile: { id: 'me', weightUnit: 'lb', plannedDaysPerWeek: 2, nutritionTargets: { calories: 3000, proteinG: 180 } },
  exercises: [ex],
  workouts: [wo('old', '2026-11-16'), wo('w1', '2026-11-23'), wo('w2', '2026-11-26')],
  workoutExercises: [],
  sets: [set('a', 'old', 225, 5), set('wu', 'w1', 135, 5, 'warmup'), set('b', 'w1', 235, 5), set('c', 'w2', 225, 3)],
  programs: [{ id: 'p', name: 'Spring', version: 1, changeReason: 'x', status: 'active', author: 'user', daysPerWeek: 2, ...base }],
  programWeeks: [{ id: 'pw', programId: 'p', weekNumber: 1, ...base }],
  plannedSessions: [
    { id: 'ps1', programId: 'p', programWeekId: 'pw', dayNumber: 1, name: 'Day A', exercises: [], completedWorkoutId: 'w1', ...base },
    { id: 'ps2', programId: 'p', programWeekId: 'pw', dayNumber: 2, name: 'Day B', exercises: [{ id: 'r', exerciseId: 'sq', order: 0, targets: [{ type: 'working', reps: 5, weight: 240, unit: 'lb' }] }], ...base },
  ],
  bodyMetrics: [],
  aiDecisions: [],
  nutritionEntries: [{ id: 'n', date: '2026-11-24', calories: 2800, proteinG: 170, ...base }, { id: 'n0', date: '2026-11-10', calories: 9999, ...base }],
  fitnessTests: [],
  testResults: [],
  readiness: [{ id: 'r1', date: '2026-11-25', sleepHours: 8, soreness: 2, energy: 4, ...base }],
} as unknown as Data;

describe('weekly report', () => {
  it('summarizes the Monday–Sunday week and the next sessions', () => {
    const r = buildWeeklyReport(data, '2026-11-29');
    expect(r.weekOf).toBe('2026-11-23');
    expect(r.subject).toBe('Forge week of 2026-11-23: 2 sessions, 2 PRs');
    expect(r.text).toContain('2 sessions · 2 working sets · 1,850 lb lifted');
    expect(r.text).toContain('Squat: 235 lb × 5 (was 225)');
    expect(r.text).toContain('Squat: e1RM 274.2 lb (was 262.5)');
    expect(r.text).toContain('1 of 7 days logged · avg 2,800 kcal (target 3,000) · avg 170 g protein (target 180)');
    expect(r.text).toContain('1 check-ins · avg 4/5 · avg sleep 8 h');
    expect(r.text).toContain('Week 1 · Day B: Squat 5 reps 240lb');
    expect(r.text).not.toContain('Day A');
    expect(r.html).toContain('<h2');
  });

  it('reports on the week before an early-Monday run', () => {
    expect(reportDate(new Date('2026-11-30T01:00:00Z'))).toBe('2026-11-29');
  });

  it('sends through Resend only when configured', async () => {
    const report = buildWeeklyReport(data, '2026-11-29');
    expect((await sendWeeklyEmail({}, report)).sent).toBe(false);
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 }));
    const out = await sendWeeklyEmail({ RESEND_API_KEY: 'k', EMAIL_TO: 'me@example.com' }, report, fetcher as unknown as typeof fetch);
    expect(out.sent).toBe(true);
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ['me@example.com'], subject: report.subject });
  });
});
