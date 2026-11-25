// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeD1 } from './fakeD1';
import { handleMcp, loadData } from './mcp';
import { getWeeklySets } from './tools';
import { handleRequest, type Env } from './sync';

const TOKEN = 'a-long-secret-token-for-tests';
let env: Env;
const T0 = '2026-03-02T10:00:00.000Z';
const base = { createdAt: T0, updatedAt: T0 };

const exercise = (id: string, name: string, extra = {}) => ({ table: 'exercises', row: { id, name, aliases: [], equipment: 'barbell', primaryMuscles: ['quads'], secondaryMuscles: ['glutes'], pattern: 'squat', loadModel: 'total', ...base, ...extra } });
const seed = [
  { table: 'profile', row: { id: 'me', goals: ['Get strong'], constraints: [], equipmentProfiles: [], weightUnit: 'lb', e1rmFormula: 'epley', plannedDaysPerWeek: 4, ...base } },
  exercise('sq', 'Squat'),
  exercise('bp', 'Bench Press', { primaryMuscles: ['chest'], secondaryMuscles: ['triceps'], pattern: 'push' }),
  { table: 'workouts', row: { id: 'w1', name: 'Legs', startedAt: T0, endedAt: '2026-03-02T11:00:00.000Z', kind: 'strength', ...base } },
  { table: 'workouts', row: { id: 'w2', name: 'Open', startedAt: T0, kind: 'strength', ...base } },
  { table: 'workoutExercises', row: { id: 'we1', workoutId: 'w1', exerciseId: 'sq', order: 0, ...base } },
  { table: 'sets', row: { id: 's0', workoutExerciseId: 'we1', workoutId: 'w1', exerciseId: 'sq', order: 0, type: 'warmup', weight: 135, unit: 'lb', reps: 5, completedAt: T0, ...base } },
  { table: 'sets', row: { id: 's1', workoutExerciseId: 'we1', workoutId: 'w1', exerciseId: 'sq', order: 1, type: 'working', weight: 225, unit: 'lb', reps: 5, completedAt: T0, ...base } },
  { table: 'sets', row: { id: 's2', workoutExerciseId: 'we1', workoutId: 'w1', exerciseId: 'sq', order: 2, type: 'working', weight: 245, unit: 'lb', reps: 3, completedAt: T0, ...base } },
  { table: 'sets', row: { id: 's3', workoutExerciseId: 'we1', workoutId: 'w1', exerciseId: 'sq', order: 3, type: 'working', weight: 300, unit: 'lb', reps: 1, ...base } }, // not completed
];

beforeEach(async () => {
  env = { DB: fakeD1(), SYNC_TOKEN: TOKEN };
  const res = await handleRequest(new Request('https://f.test/api/sync/push', { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ rows: seed }) }), env);
  expect(res.status).toBe(200);
});

const rpc = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  handleMcp(new Request(`https://f.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body: JSON.stringify(body) }), env);
const callTool = async (name: string, args: object = {}) => {
  const res = await rpc(`/mcp/${TOKEN}`, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  const json = await res!.json();
  return JSON.parse(json.result.content[0].text);
};

describe('MCP endpoint', () => {
  it('ignores non-MCP paths and rejects bad tokens', async () => {
    expect(await handleMcp(new Request('https://f.test/api/health'), env)).toBeNull();
    expect((await rpc('/mcp/wrong-token-wrong-token', {}))!.status).toBe(401);
    expect((await rpc('/mcp', {}))!.status).toBe(401);
  });

  it('accepts the token as a Bearer header and lists the read tools', async () => {
    const res = await rpc('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: `Bearer ${TOKEN}` });
    const names = (await res!.json()).result.tools.map((t: { name: string; annotations: { readOnlyHint: boolean } }) => {
      expect(t.annotations.readOnlyHint).toBe(true);
      return t.name;
    });
    expect(names).toEqual(['get_profile', 'list_exercises', 'list_workouts', 'get_exercise_history', 'get_weekly_sets', 'get_active_program', 'get_bodyweight']);
  });

  it('has no write tools', async () => {
    const res = await rpc(`/mcp/${TOKEN}`, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const names: string[] = (await res!.json()).result.tools.map((t: { name: string }) => t.name);
    expect(names.filter((n) => /propose|create|update|delete|write|set_/.test(n))).toEqual([]);
  });
});

describe('tools over MCP', () => {
  it('get_profile', async () => {
    expect((await callTool('get_profile')).goals).toEqual(['Get strong']);
  });
  it('list_workouts shows finished workouts, working sets only, warm-ups counted', async () => {
    const out = await callTool('list_workouts');
    expect(out).toHaveLength(1); // the open workout is excluded
    expect(out[0].exercises[0]).toEqual({ exercise: 'Squat', warmupSets: 1, workingSets: ['225lb x5', '245lb x3'] });
  });
  it('get_exercise_history gives e1RM with the formula and inputs, skipping incomplete sets', async () => {
    const out = await callTool('get_exercise_history', { exercise: 'squat' });
    // Epley: 225 * (1 + 5/30) = 262.5; 245 * (1 + 3/30) = 269.5
    expect(out.recentSessions[0].bestE1rm).toBe(269.5);
    expect(out.allTimeBestE1rm).toBe(269.5);
    expect(out.e1rm.formula).toMatch(/Epley/);
    expect(out.recentSessions[0].workingSets).toHaveLength(2);
    expect((await callTool('get_exercise_history', { exercise: 'nope' })).error).toMatch(/No exercise/);
  });
  it('get_weekly_sets credits primary 1 and secondary 0.5', async () => {
    const out = getWeeklySets(await loadData(env.DB), 1, '2026-03-04');
    expect(out.weeks[0]).toMatchObject({ weekStarting: '2026-03-02', totalSets: 2 });
    expect(out.weeks[0]!.setsByMuscle).toEqual({ quads: 2, glutes: 1 });
    expect((await callTool('get_weekly_sets', { weeks: 1 })).weeks).toHaveLength(1);
  });
  it('get_active_program and get_bodyweight handle empty data', async () => {
    expect((await callTool('get_active_program')).note).toMatch(/No active/);
    expect((await callTool('get_bodyweight')).entries).toEqual([]);
  });
  it('list_exercises searches by name', async () => {
    const out = await callTool('list_exercises', { query: 'bench' });
    expect(out.map((e: { name: string }) => e.name)).toEqual(['Bench Press']);
  });
});
