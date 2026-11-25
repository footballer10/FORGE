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
  { table: 'nutritionEntries', row: { id: 'n1', date: '2026-03-02', name: 'Oats', calories: 500, proteinG: 20, ...base } },
  { table: 'nutritionEntries', row: { id: 'n2', date: '2026-03-02', calories: 700, proteinG: 50, ...base } },
  { table: 'nutritionEntries', row: { id: 'n3', date: '2026-03-01', calories: 2400, proteinG: 140, ...base } },
  { table: 'nutritionEntries', row: { id: 'n4', date: '2026-03-01', calories: 999, deletedAt: T0, ...base } },
  { table: 'fitnessTests', row: { id: 'builtin:pullups', name: 'Pull-up max', measure: 'reps', scoring: 'higherIsBetter', builtIn: true, targetValue: 12, testDate: '2026-06-01', ...base } },
  { table: 'testResults', row: { id: 'r1', testId: 'builtin:pullups', date: '2026-03-01', value: 8, ...base } },
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
      if (t.name !== 'propose_program') expect(t.annotations.readOnlyHint).toBe(true);
      return t.name;
    });
    expect(names.filter((n: string) => n !== 'propose_program')).toEqual(['get_profile', 'list_exercises', 'list_workouts', 'get_exercise_history', 'get_weekly_sets', 'get_active_program', 'get_bodyweight', 'get_nutrition', 'get_fitness_tests', 'get_proposals']);
  });

  it('the only write tool is propose_program', async () => {
    const res = await rpc(`/mcp/${TOKEN}`, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
    const tools: { name: string; annotations: { readOnlyHint: boolean } }[] = (await res!.json()).result.tools;
    expect(tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name)).toEqual(['propose_program']);
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

const proposal = (exercise = 'Squat', extra = {}) => ({
  schemaVersion: 1, name: 'Strength block', reason: 'Squat e1RM stalled at 270 lb for 6 weeks', daysPerWeek: 3,
  weeks: [{ sessions: [{ name: 'Lower A', exercises: [{ exercise, sets: [{ count: 4, reps: 5, weight: 225 }] }] }] }], ...extra,
});
const rawCall = async (name: string, args: object) => {
  const res = await rpc(`/mcp/${TOKEN}`, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
  return (await res!.json()).result as { isError?: boolean; content: { text: string }[] };
};
const rowCount = async (table: string) =>
  (await env.DB.prepare('SELECT COUNT(*) AS n FROM rows WHERE table_name = ?').bind(table).all<{ n: number }>()).results![0]!.n;

describe('nutrition and fitness tools', () => {
  it('get_nutrition lists logged days with totals, skipping trashed entries', async () => {
    const r = await callTool('get_nutrition', { days: 14 });
    expect(r.days).toEqual([
      { date: '2026-03-02', calories: 1200, proteinG: 70, entries: 2 },
      { date: '2026-03-01', calories: 2400, proteinG: 140, entries: 1 },
    ]);
    expect(r.loggedDays).toBe(2);
    expect(r.averageCalories).toBe(1800);
  });
  it('get_fitness_tests returns the typed target, test date and results', async () => {
    const r = await callTool('get_fitness_tests');
    expect(r[0]).toMatchObject({ name: 'Pull-up max', target: 12, testDate: '2026-06-01', betterIs: 'higher', results: [{ date: '2026-03-01', value: 8 }] });
  });
});

describe('propose_program', () => {
  it('stores a proposed decision and changes nothing else', async () => {
    const before = { programs: await rowCount('programs'), workouts: await rowCount('workouts'), sets: await rowCount('sets') };
    const res = await rawCall('propose_program', { proposal: proposal() });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(res.content[0]!.text).status).toBe('proposed');
    const pulled = await (await handleRequest(new Request('https://f.test/api/sync/pull?since=0', { headers: { authorization: `Bearer ${TOKEN}` } }), env)).json();
    const rows = pulled.rows.filter((r: { table: string }) => r.table === 'aiDecisions');
    expect(rows).toHaveLength(1);
    expect(rows[0].row).toMatchObject({ status: 'proposed', reason: 'Squat e1RM stalled at 270 lb for 6 weeks' });
    expect(JSON.parse(rows[0].row.payload).name).toBe('Strength block');
    expect({ programs: await rowCount('programs'), workouts: await rowCount('workouts'), sets: await rowCount('sets') }).toEqual(before);
    expect((await callTool('get_proposals'))[0]).toMatchObject({ status: 'proposed' });
  });

  it('accepts the proposal as a JSON string', async () => {
    expect((await rawCall('propose_program', { proposal: '```json\n' + JSON.stringify(proposal()) + '\n```' })).isError).toBeFalsy();
  });

  it('rejects invalid proposals with a useful message and stores nothing', async () => {
    const bad = await rawCall('propose_program', { proposal: { name: 'x' } });
    expect(bad.isError).toBe(true);
    expect(bad.content[0]!.text).toMatch(/not valid/);
    expect(await rowCount('aiDecisions')).toBe(0);
  });

  it('rejects exercises that are not in the library', async () => {
    const res = await rawCall('propose_program', { proposal: proposal('Zercher Squat') });
    expect(res.isError).toBe(true);
    expect(res.content[0]!.text).toMatch(/Zercher Squat/);
    expect(await rowCount('aiDecisions')).toBe(0);
  });

  it('limits how many proposals can wait at once', async () => {
    for (let i = 0; i < 5; i++) expect((await rawCall('propose_program', { proposal: proposal() })).isError).toBeFalsy();
    const sixth = await rawCall('propose_program', { proposal: proposal() });
    expect(sixth.isError).toBe(true);
    expect(sixth.content[0]!.text).toMatch(/already waiting/);
  });

  it('needs the token', async () => {
    const res = await rpc('/mcp/wrong-token-wrong-token', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'propose_program', arguments: { proposal: proposal() } } });
    expect(res!.status).toBe(401);
  });
});
