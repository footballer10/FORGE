/**
 * Forge data model. Every persisted entity lives here, including ones for later phases,
 * so the storage schema never has to be redesigned around a new feature.
 *
 * Conventions
 * - IDs are UUID strings. Timestamps are ISO-8601 strings (UTC).
 * - Dates without a time (body metrics, test results) are local `YYYY-MM-DD` strings.
 * - Every weight is stored together with its unit and converted only for display.
 * - `deletedAt` marks soft-deleted rows (trash, 30-day recovery, future sync tombstones).
 */

export type ID = string;
/** ISO-8601 timestamp, e.g. 2026-11-24T17:03:00.000Z */
export type ISODateTime = string;
/** Local calendar date, e.g. 2026-11-24 */
export type ISODate = string;

export interface BaseEntity {
  id: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deletedAt?: ISODateTime;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export type WeightUnit = 'lb' | 'kg';
export type LengthUnit = 'in' | 'cm';

export interface Weight {
  value: number;
  unit: WeightUnit;
}

// ---------------------------------------------------------------------------
// Exercises
// ---------------------------------------------------------------------------

/**
 * How the logged weight relates to the load moved.
 * - total: weight is the whole load (barbell incl. bar, machine stack, cable).
 * - perImplement: weight is ONE dumbbell/kettlebell. Analytics never double it.
 * - bodyweightPlusAdded: effective = bodyweight on that date + logged weight (belt, vest).
 * - assisted: effective = bodyweight on that date − logged weight (band/machine assistance).
 * - timeDistance: no load; durationSec and/or distanceM matter (runs, sprints, carries by time).
 * - repsOnly: no load considered (bodyweight drills where load is not meaningful).
 */
export type LoadModel =
  | 'total'
  | 'perImplement'
  | 'bodyweightPlusAdded'
  | 'assisted'
  | 'timeDistance'
  | 'repsOnly';

export type MovementPattern =
  | 'squat'
  | 'hinge'
  | 'horizontalPush'
  | 'verticalPush'
  | 'horizontalPull'
  | 'verticalPull'
  | 'lunge'
  | 'carry'
  | 'core'
  | 'conditioning'
  | 'isolation'
  | 'other';

/** Muscle vocabulary aligned with free-exercise-db so the library maps directly. */
export type Muscle =
  | 'abdominals'
  | 'abductors'
  | 'adductors'
  | 'biceps'
  | 'calves'
  | 'chest'
  | 'forearms'
  | 'glutes'
  | 'hamstrings'
  | 'lats'
  | 'lower back'
  | 'middle back'
  | 'neck'
  | 'quadriceps'
  | 'shoulders'
  | 'traps'
  | 'triceps';

export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'kettlebell'
  | 'cable'
  | 'machine'
  | 'bodyweight'
  | 'band'
  | 'ez bar'
  | 'medicine ball'
  | 'exercise ball'
  | 'foam roll'
  | 'trap bar'
  | 'sled'
  | 'other';

export type ExerciseSource = 'library' | 'custom' | 'import';

export interface Exercise extends BaseEntity {
  name: string;
  /** Alternative names used for search and import matching (case-insensitive). */
  aliases: string[];
  equipment: Equipment;
  primaryMuscles: Muscle[];
  secondaryMuscles: Muscle[];
  pattern: MovementPattern;
  unilateral: boolean;
  /** Default rest after a completed set, seconds. */
  defaultRestSec: number;
  /** Step for keypad +/- and progression suggestions, in `incrementUnit`. */
  weightIncrement: number;
  incrementUnit: WeightUnit;
  loadModel: LoadModel;
  source: ExerciseSource;
  /** ID in the source dataset (free-exercise-db id) for re-seeding without duplicates. */
  sourceRef?: string;
  instructions?: string[];
  /** Sticky note shown whenever the exercise is logged (seat height, grip). */
  stickyNote?: string;
  /** Bar weight for the plate calculator when loadModel is 'total' on a barbell. */
  barWeight?: Weight;
  archived?: boolean;
}

// ---------------------------------------------------------------------------
// Workouts (what was actually performed)
// ---------------------------------------------------------------------------

export type SetType = 'warmup' | 'working' | 'drop' | 'failure' | 'amrap';

export interface Workout extends BaseEntity {
  name: string;
  startedAt: ISODateTime;
  /** Absent while the workout is in progress. */
  endedAt?: ISODateTime;
  notes?: string;
  /** Routine it was started from, if any. */
  routineId?: ID;
  /** Planned program session it fulfils, if any (planned vs completed). */
  plannedSessionId?: ID;
  /** Bodyweight snapshot used for bodyweight-relative lifts if no BodyMetric exists that day. */
  bodyweight?: Weight;
  /** Sessions logged in conditioning mode (sprints, intervals, runs). */
  kind: 'strength' | 'conditioning' | 'mixed';
  importBatchId?: ID;
  /** Equipment profile used (later phase). */
  equipmentProfileId?: ID;
  /** Rest timer state for crash-safe resume: absolute end time. */
  restTimerEndsAt?: ISODateTime;
}

export interface WorkoutExercise extends BaseEntity {
  workoutId: ID;
  exerciseId: ID;
  /** 0-based position in the workout. */
  order: number;
  /** Exercises sharing a group label form a superset/circuit; rest runs after the last in the round. */
  supersetGroup?: string;
  notes?: string;
  /** Rest override (seconds) copied from the routine; absent = the exercise's default. */
  restSec?: number;
  /** Targets copied from the routine, shown as a hint while logging. */
  targets?: TargetSet[];
  /** Progression suggestion applied when the workout started (result and formula), shown while logging. */
  progressionNote?: string;
  /** The same suggestion as numbers, so the logging screen can offer a one-tap fill. */
  suggested?: { weight: number; unit: WeightUnit; reps?: number };
}

export interface SetEntry extends BaseEntity {
  workoutExerciseId: ID;
  /** Denormalized for fast per-exercise history and analytics queries. */
  workoutId: ID;
  exerciseId: ID;
  /** 0-based position within the workout exercise. */
  order: number;
  type: SetType;
  /** For perImplement: ONE implement. For assisted: assistance. For bw+added: added load. */
  weight?: number;
  unit: WeightUnit;
  reps?: number;
  /** Rate of perceived exertion, 1–10 (half steps allowed). */
  rpe?: number;
  /** Reps in reserve. */
  rir?: number;
  durationSec?: number;
  distanceM?: number;
  /** Set when the set is ticked off; incomplete sets are planned-but-not-done. */
  completedAt?: ISODateTime;
  /** Per-side flag for unilateral lifts logged one side at a time. */
  side?: 'left' | 'right';
}

// ---------------------------------------------------------------------------
// Routines (templates) and Programs (multi-week plans)
// ---------------------------------------------------------------------------

export interface TargetSet {
  type: SetType;
  /** Rep target; use repsMax for a range (e.g. 6–8). */
  reps?: number;
  repsMax?: number;
  weight?: number;
  unit?: WeightUnit;
  /** Load as a fraction of current e1RM (0.75 = 75%). */
  percentE1rm?: number;
  rpe?: number;
  durationSec?: number;
  distanceM?: number;
}

export type ProgressionRule =
  | { kind: 'none' }
  | { kind: 'doubleProgression'; repsMin: number; repsMax: number; increment?: Weight }
  | { kind: 'percentE1rm'; percent: number }
  | { kind: 'rpeTarget'; rpe: number };

export interface RoutineExercise {
  exerciseId: ID;
  order: number;
  supersetGroup?: string;
  restSec?: number;
  notes?: string;
  targets: TargetSet[];
  progression?: ProgressionRule;
}

export interface Routine extends BaseEntity {
  name: string;
  notes?: string;
  exercises: RoutineExercise[];
  folder?: string;
}

export type TrainingPhase = 'offseason' | 'preseason' | 'inseason' | 'hypertrophy' | 'strength' | 'power' | 'deload' | 'testing';

export type ProgramStatus = 'draft' | 'active' | 'completed' | 'archived';

export interface Program extends BaseEntity {
  name: string;
  description?: string;
  /** Incremented on every approved change. */
  version: number;
  /** Why this version exists (first version: why the program was created). */
  changeReason: string;
  /** Previous version's program ID, for rollback (later phase). */
  previousVersionId?: ID;
  status: ProgramStatus;
  startDate?: ISODate;
  /** Who authored it. */
  author: 'user' | 'claude' | 'import';
  /** Planned training days per week, drives weekly streaks. */
  daysPerWeek?: number;
}

export interface ProgramWeek extends BaseEntity {
  programId: ID;
  /** 1-based week number within the program. */
  weekNumber: number;
  phase?: TrainingPhase;
  isDeload?: boolean;
  notes?: string;
}

export interface PlannedSession extends BaseEntity {
  programId: ID;
  programWeekId: ID;
  /** 1-based order within the week. */
  dayNumber: number;
  name: string;
  /** Optional fixed date; otherwise sessions are done in order. */
  scheduledDate?: ISODate;
  exercises: RoutineExercise[];
  /** Linked performed workout once completed. */
  completedWorkoutId?: ID;
  skipped?: boolean;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Body, tests and athletic data
// ---------------------------------------------------------------------------

export type BodyMetricKind =
  | 'bodyweight'
  | 'bodyFatPercent'
  | 'waist'
  | 'chest'
  | 'arm'
  | 'thigh'
  | 'neck'
  | 'hips';

export interface BodyMetric extends BaseEntity {
  date: ISODate;
  kind: BodyMetricKind;
  value: number;
  /** Weight unit for bodyweight, length unit for measurements, '%' for body fat. */
  unit: WeightUnit | LengthUnit | '%';
  notes?: string;
}

export type TestScoring = 'higherIsBetter' | 'lowerIsBetter';
export type TestMeasure = 'reps' | 'timeSec' | 'distanceM' | 'heightCm' | 'weight';

export interface FitnessTest extends BaseEntity {
  name: string;
  measure: TestMeasure;
  scoring: TestScoring;
  /** Display unit hint, e.g. 'in' for jumps, 'mm:ss' for runs. */
  displayUnit?: string;
  description?: string;
  /** Battery preset membership (later phase, e.g. 'cfa', 'rugby'). */
  batteries?: string[];
  builtIn: boolean;
  /** Goal typed by the user, in base units (reps, seconds, metres, centimetres, or weight). Never invented by the app. */
  targetValue?: number;
  /** Date of the real test, YYYY-MM-DD. */
  testDate?: ISODate;
}

export interface TestResult extends BaseEntity {
  testId: ID;
  date: ISODate;
  /** Value in the test's base measure: reps, seconds, metres, centimetres, or weight. */
  value: number;
  unit?: WeightUnit;
  notes?: string;
  /** Optional link to a conditioning workout where the test was performed. */
  workoutId?: ID;
}

export interface ProgressPhoto extends BaseEntity {
  date: ISODate;
  pose?: 'front' | 'side' | 'back' | 'other';
  /** Image data, stored only on this device. Excluded from JSON export unless chosen. */
  blob: Blob;
  notes?: string;
}

/** Later phase: daily readiness, shown as trends only. */
export interface ReadinessCheckIn extends BaseEntity {
  date: ISODate;
  sleepHours?: number;
  /** 1–5 scales. */
  sleepQuality?: number;
  soreness?: number;
  energy?: number;
  stress?: number;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Profile and settings
// ---------------------------------------------------------------------------

export interface EquipmentProfile {
  id: ID;
  name: string;
  equipment: Equipment[];
  /** Heaviest dumbbell available, per implement. */
  maxDumbbell?: Weight;
  /** Available plates per side for the plate calculator. */
  plates?: Weight[];
  barWeight?: Weight;
  notes?: string;
}

export type E1rmFormula = 'epley' | 'brzycki' | 'lombardi' | 'mayhew' | 'oconner' | 'wathan';

export interface Profile extends BaseEntity {
  /** Singleton: always 'me'. */
  id: 'me';
  name?: string;
  birthYear?: number;
  sex?: 'male' | 'female';
  heightCm?: number;
  goals: string[];
  sport?: string;
  position?: string;
  trainingPhase?: TrainingPhase;
  /** Free-text limits: injuries, schedule, equipment gaps. */
  constraints: string[];
  equipmentProfiles: EquipmentProfile[];
  defaultEquipmentProfileId?: ID;
  /** Settings */
  weightUnit: WeightUnit;
  lengthUnit: LengthUnit;
  weekStartsOn: 1 | 0; // 1 = Monday
  theme: 'dark' | 'light';
  /** Show dumbbell weights as pair total (display only; storage stays per implement). */
  showDumbbellPairTotal: boolean;
  e1rmFormula: E1rmFormula;
  /** Planned training days per week for weekly streaks. */
  plannedDaysPerWeek: number;
  /** Lifts and weights for the strength score (user-chosen). */
  strengthScoreLifts: { exerciseId: ID; weight: number }[];
  /** Editable bodyweight-relative tier standards per exercise. */
  strengthStandards: StrengthStandard[];
  lastBackupAt?: ISODateTime;
}

export type StrengthTier = 'beginner' | 'novice' | 'intermediate' | 'advanced' | 'elite';

export interface StrengthStandard {
  exerciseId: ID;
  /** e1RM ÷ bodyweight thresholds for each tier. */
  thresholds: Record<StrengthTier, number>;
  source?: string;
}

// ---------------------------------------------------------------------------
// Import provenance
// ---------------------------------------------------------------------------

export type ImportSource = 'strong' | 'forgeJson' | 'hevy' | 'genericCsv';

export interface ImportConventions {
  /** Unit to assume when the file does not say. */
  defaultUnit: WeightUnit;
  /** Per source exercise name: how its weights were logged. */
  exerciseRules: Record<
    string,
    {
      exerciseId: ID;
      /** 'pairTotal' halves into per-implement storage; 'perImplement' keeps as-is. */
      dumbbellConvention?: 'pairTotal' | 'perImplement';
    }
  >;
}

export interface ImportBatch extends BaseEntity {
  source: ImportSource;
  fileName: string;
  importedAt: ISODateTime;
  rowCount: number;
  workoutCount: number;
  conventions: ImportConventions;
  /** Rows skipped as duplicates of existing data. */
  duplicateCount: number;
  notes?: string;
}

/** Original imported row, kept unchanged so conventions can be re-applied later. */
export interface RawImportRow {
  id: ID;
  batchId: ID;
  rowIndex: number;
  /** Column name → raw string value, exactly as in the file. */
  data: Record<string, string>;
  /** Set produced from this row, if any. */
  setId?: ID;
  workoutId?: ID;
}

// ---------------------------------------------------------------------------
// Gamification and coaching
// ---------------------------------------------------------------------------

export interface Achievement extends BaseEntity {
  /** Stable key of the achievement definition, e.g. 'bench-225', 'workouts-100'. */
  key: string;
  /** Display text captured when earned (lift names can change later). */
  title?: string;
  description?: string;
  achievedAt: ISODateTime;
  /** The workout/set that earned it. */
  workoutId?: ID;
  setId?: ID;
  /** Snapshot of the value that crossed the threshold. */
  value?: number;
  seenAt?: ISODateTime;
}

export type AiDecisionStatus = 'proposed' | 'approved' | 'rejected' | 'rolledBack';

export interface AiDecision extends BaseEntity {
  date: ISODateTime;
  summary: string;
  reason: string;
  status: AiDecisionStatus;
  programId?: ID;
  /** Program version this decision produced (or would produce). */
  programVersion?: number;
  /** Raw proposal payload as pasted/received, for audit. */
  payload?: string;
}

/** Undo stack entry (M2). Stored so undo survives a reload. */
export interface UndoEntry {
  id: ID;
  createdAt: ISODateTime;
  label: string;
  /** Table name → rows to restore (full previous state). */
  before: Record<string, unknown[]>;
  /** Table name → IDs created by the action (deleted on undo). */
  createdIds: Record<string, ID[]>;
}

/** Small key-value store for app meta (seed version, last backup reminder, schema notes). */
export interface MetaEntry {
  key: string;
  value: unknown;
}
