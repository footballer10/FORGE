/**
 * Remote MCP server (milestone 10c). Stateless Streamable HTTP, JSON responses, read-only tools.
 * URL: https://<worker>/mcp/<SYNC_TOKEN>  (Claude's custom-connector screen takes a URL, so the
 * token travels in the path). A Bearer header on /mcp is accepted too.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { READINESS_FORMULA } from '../../src/domain/readiness';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import type { D1Like, Env } from './sync';
import { safeEqual, upsertRows } from './sync';
import { PROGRAM_FORMAT_PROMPT } from '../../src/domain/programProposal';
import * as T from './tools';
import type { Data } from './tools';

async function readTable<R>(db: D1Like, table: string): Promise<R[]> {
  const res = await db.prepare('SELECT data FROM rows WHERE table_name = ? AND deleted_at IS NULL').bind(table).all<{ data: string }>();
  return (res.results ?? []).map((r) => JSON.parse(r.data) as R);
}

export async function loadData(db: D1Like): Promise<Data> {
  const [profiles, exercises, workouts, workoutExercises, sets, programs, programWeeks, plannedSessions, bodyMetrics, aiDecisions, nutritionEntries, fitnessTests, testResults, readiness] = await Promise.all([
    readTable<Data['profile'] & object>(db, 'profile'), readTable<Data['exercises'][number]>(db, 'exercises'),
    readTable<Data['workouts'][number]>(db, 'workouts'), readTable<Data['workoutExercises'][number]>(db, 'workoutExercises'),
    readTable<Data['sets'][number]>(db, 'sets'), readTable<Data['programs'][number]>(db, 'programs'),
    readTable<Data['programWeeks'][number]>(db, 'programWeeks'), readTable<Data['plannedSessions'][number]>(db, 'plannedSessions'),
    readTable<Data['bodyMetrics'][number]>(db, 'bodyMetrics'), readTable<Data['aiDecisions'][number]>(db, 'aiDecisions'),
    readTable<Data['nutritionEntries'][number]>(db, 'nutritionEntries'), readTable<Data['fitnessTests'][number]>(db, 'fitnessTests'),
    readTable<Data['testResults'][number]>(db, 'testResults'), readTable<NonNullable<Data['readiness']>[number]>(db, 'readiness'),
  ]);
  return { profile: profiles[0], exercises, workouts, workoutExercises, sets, programs, programWeeks, plannedSessions, bodyMetrics, aiDecisions, nutritionEntries, fitnessTests, testResults, readiness };
}

const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 1) }] });
const readOnly = { readOnlyHint: true, openWorldHint: false } as const;

export function buildServer(db: D1Like): McpServer {
  const server = new McpServer({ name: 'forge', version: '0.1.0' });
  const tool = <S extends z.ZodRawShape>(name: string, description: string, shape: S, run: (d: Data, args: z.infer<z.ZodObject<S>>) => unknown) =>
    server.registerTool(name, { description, inputSchema: shape, annotations: readOnly }, (async (args: z.infer<z.ZodObject<S>>) => text(run(await loadData(db), args))) as never);

  tool('get_profile', 'Athlete profile: goals, sport, constraints, equipment, units, planned days per week, e1RM formula.', {}, (d) => T.getProfile(d));
  tool('list_exercises', 'Exercises in the library (max 100). Optional name search.', { query: z.string().optional() }, (d, a) => T.listExercises(d, a.query));
  tool('list_workouts', 'Finished workouts, newest first, with working sets per exercise (warm-ups only counted). Dates are YYYY-MM-DD (UTC).',
    { from: z.string().optional(), to: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }, (d, a) => T.listWorkouts(d, a));
  tool('get_exercise_history', 'Working-set history for one exercise with e1RM per session. States the formula and unit used.',
    { exercise: z.string(), limit: z.number().int().min(1).max(50).optional() }, (d, a) => T.getExerciseHistory(d, a.exercise, a.limit));
  tool('get_weekly_sets', 'Weekly hard sets per muscle (primary 1 credit, secondary 0.5), oldest week first.', { weeks: z.number().int().min(1).max(26).optional() }, (d, a) => T.getWeeklySets(d, a.weeks));
  tool('get_active_program', 'The active training program: weeks, sessions and exercise targets.', {}, (d) => T.getActiveProgram(d));
  tool('get_bodyweight', 'Bodyweight entries, newest first.', { limit: z.number().int().min(1).max(200).optional() }, (d, a) => T.getBodyweight(d, a.limit));
  tool('get_nutrition', 'Daily calories and protein the user logged (last N days, default 14), with their typed targets and averages over logged days.', { days: z.number().int().min(1).max(90).optional() }, (d, a) => T.getNutrition(d, a.days));
  tool('get_readiness', `Daily readiness check-ins (sleep hours, soreness 1–5, energy 1–5) for the last N days (default 28), newest first, with a 1–5 score per day and averages. ${READINESS_FORMULA}`,
    { days: z.number().int().min(1).max(180).optional() }, (d, a) => T.getReadiness(d, a.days));
  tool('get_fitness_tests', 'Fitness tests (academy PFT events and others) with the user\'s typed target, test date and recent results. Times are seconds, distances metres, heights cm.', {}, (d) => T.getFitnessTests(d));
  tool('get_proposals', 'Your past program proposals and what the user decided (proposed, approved, rejected).', { limit: z.number().int().min(1).max(30).optional() }, (d, a) => T.listProposals(d, a.limit));

  // The only write: a proposal the user must approve in the Forge app. Nothing about their training changes here.
  server.registerTool(
    'propose_program',
    {
      description: `Propose a training program (or a revised version of the active one) to the user. This does NOT change their training: it adds a proposal to the Forge app (Settings → Claude, with a notice on Home), where the user reviews a diff and approves or rejects it. Use only exercise names from list_exercises. ${PROGRAM_FORMAT_PROMPT}`,
      inputSchema: { proposal: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('The program JSON object (or a JSON string).') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (async (args: { proposal: unknown }) => {
      const result = T.buildProposalRow(await loadData(db), args.proposal, new Date().toISOString(), crypto.randomUUID());
      if ('error' in result) return { isError: true, content: [{ type: 'text' as const, text: result.error }] };
      await upsertRows(db, [{ table: 'aiDecisions', row: { ...result.row } }]);
      return text({ status: 'proposed', message: 'Saved. The user will see it in Forge (a notice on Home, then Settings → Claude) after their next sync and must approve it there. Nothing has changed in their training.' });
    }) as never,
  );
  return server;
}

/** Returns a Response for /mcp or /mcp/<token>; null when the path is not an MCP path. */
export async function handleMcp(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const m = /^\/mcp(?:\/([^/]+))?\/?$/.exec(url.pathname);
  if (!m) return null;
  const given = m[1] ? decodeURIComponent(m[1]) : (/^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '');
  if (!env.SYNC_TOKEN || env.SYNC_TOKEN.length < 16 || !safeEqual(given, env.SYNC_TOKEN)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  const server = buildServer(env.DB);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  return transport.handleRequest(request);
}
