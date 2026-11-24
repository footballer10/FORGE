import Dexie, { type Table } from 'dexie';
import type {
  Achievement,
  AiDecision,
  BodyMetric,
  Exercise,
  FitnessTest,
  ImportBatch,
  MetaEntry,
  PlannedSession,
  Profile,
  Program,
  ProgramWeek,
  ProgressPhoto,
  RawImportRow,
  ReadinessCheckIn,
  Routine,
  SetEntry,
  TestResult,
  UndoEntry,
  Workout,
  WorkoutExercise,
} from '../domain/types';

/**
 * IndexedDB schema. Only the repository layer may import this file.
 * Index strings list the primary key first, then indexed fields; `*` = multi-entry, `[a+b]` = compound.
 * To change the schema, add a new `this.version(n)` block; never edit a shipped version.
 */
export class ForgeDB extends Dexie {
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  workoutExercises!: Table<WorkoutExercise, string>;
  sets!: Table<SetEntry, string>;
  routines!: Table<Routine, string>;
  programs!: Table<Program, string>;
  programWeeks!: Table<ProgramWeek, string>;
  plannedSessions!: Table<PlannedSession, string>;
  bodyMetrics!: Table<BodyMetric, string>;
  fitnessTests!: Table<FitnessTest, string>;
  testResults!: Table<TestResult, string>;
  progressPhotos!: Table<ProgressPhoto, string>;
  readiness!: Table<ReadinessCheckIn, string>;
  profile!: Table<Profile, string>;
  importBatches!: Table<ImportBatch, string>;
  rawImportRows!: Table<RawImportRow, string>;
  achievements!: Table<Achievement, string>;
  aiDecisions!: Table<AiDecision, string>;
  undo!: Table<UndoEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'forge') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, *aliases, pattern, equipment, source, sourceRef',
      workouts: 'id, startedAt, endedAt, routineId, plannedSessionId, importBatchId',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutExerciseId, workoutId, exerciseId, completedAt, [exerciseId+completedAt]',
      routines: 'id, name',
      programs: 'id, status',
      programWeeks: 'id, programId, [programId+weekNumber]',
      plannedSessions: 'id, programId, programWeekId, completedWorkoutId, scheduledDate',
      bodyMetrics: 'id, date, kind, [kind+date]',
      fitnessTests: 'id, name',
      testResults: 'id, testId, date, [testId+date]',
      progressPhotos: 'id, date',
      readiness: 'id, date',
      profile: 'id',
      importBatches: 'id, source, importedAt',
      rawImportRows: 'id, batchId, [batchId+rowIndex]',
      achievements: 'id, key, achievedAt',
      aiDecisions: 'id, date, programId, status',
      undo: 'id, createdAt',
      meta: 'key',
    });
  }
}

export const db = new ForgeDB();
