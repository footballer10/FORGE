import { describe, expect, it } from 'vitest';
import { groupStrongWorkouts, parseDuration, parseStrongCsv, parseStrongDate } from './strongParser';

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s).toISOString();

const HEADER = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE';

const SAMPLE = [
  HEADER,
  '2024-03-05 18:30:12,Push Day,1h 5m,Bench Press (Barbell),W,95,8,0,0,,Felt good,',
  '2024-03-05 18:30:12,Push Day,1h 5m,Bench Press (Barbell),1,185,5,0,0,"Paused, slow",Felt good,8.5',
  '2024-03-05 18:30:12,Push Day,1h 5m,Bench Press (Barbell),Rest Timer,0,0,0,90,,,',
  '2024-03-05 18:30:12,Push Day,1h 5m,Bench Press (Barbell),F,185,4,0,0,,,10',
  '2024-03-05 18:30:12,Push Day,1h 5m,Bicep Curl (Dumbbell),1,60,10,0,0,,,',
  '2024-03-05 18:30:12,Push Day,1h 5m,Pull Up,1,0,10,0,0,,,',
  '2024-03-05 18:30:12,Push Day,1h 5m,Pull Up (Assisted),1,40,8,0,0,,,',
  '2024-03-05 18:30:12,Push Day,1h 5m,Plank,1,0,0,0,60,,,',
  '2024-03-07 07:00:00,Run,25m,Running,1,0,0,5000,1500,,,',
].join('\n');

describe('parseDuration', () => {
  it('reads Strong-style and clock-style durations', () => {
    expect(parseDuration('1h 5m')).toBe(3900);
    expect(parseDuration('45m')).toBe(2700);
    expect(parseDuration('2h')).toBe(7200);
    expect(parseDuration('1h 5m 30s')).toBe(3930);
    expect(parseDuration('01:05:00')).toBe(3900);
    expect(parseDuration('65:30')).toBe(3930);
    expect(parseDuration('3900')).toBe(3900);
    expect(parseDuration('')).toBeUndefined();
    expect(parseDuration('soon')).toBeUndefined();
  });
});

describe('parseStrongDate', () => {
  it('treats the timestamp as local wall-clock time', () => {
    expect(parseStrongDate('2024-03-05 18:30:12')).toBe(local(2024, 3, 5, 18, 30, 12));
    expect(parseStrongDate('2024-03-05T07:05')).toBe(local(2024, 3, 5, 7, 5));
    expect(parseStrongDate('2024-03-05')).toBe(local(2024, 3, 5));
    expect(parseStrongDate('garbage')).toBeUndefined();
  });
});

describe('parseStrongCsv', () => {
  const parsed = parseStrongCsv(SAMPLE);
  if ('error' in parsed) throw new Error(parsed.error);

  it('reads set types, ignores rest-timer rows and keeps raw records', () => {
    expect(parsed.ignoredRows).toBe(1);
    expect(parsed.rows).toHaveLength(8);
    const [warm, working, failure] = parsed.rows;
    expect(warm).toMatchObject({ type: 'warmup', weight: 95, reps: 8 });
    expect(working).toMatchObject({ type: 'working', weight: 185, reps: 5, rpe: 8.5, notes: 'Paused, slow' });
    expect(failure).toMatchObject({ type: 'failure', rpe: 10 });
    expect(working!.raw['Exercise Name']).toBe('Bench Press (Barbell)');
  });

  it('reads duration and distance rows', () => {
    const plank = parsed.rows.find((r) => r.exerciseName === 'Plank')!;
    expect(plank.seconds).toBe(60);
    expect(plank.reps).toBe(0);
    const run = parsed.rows.find((r) => r.exerciseName === 'Running')!;
    expect(run).toMatchObject({ distanceM: 5000, seconds: 1500, durationSec: 1500 });
  });

  it('has no file unit when the file does not state one', () => {
    expect(parsed.fileWeightUnit).toBeUndefined();
    expect(parsed.rows[0]!.weightUnit).toBeUndefined();
  });

  it('groups rows into workouts with exercises in file order', () => {
    const workouts = groupStrongWorkouts(parsed.rows);
    expect(workouts).toHaveLength(2);
    const push = workouts[0]!;
    expect(push).toMatchObject({ name: 'Push Day', durationSec: 3900, notes: 'Felt good' });
    expect(push.startedAt).toBe(local(2024, 3, 5, 18, 30, 12));
    expect(push.exercises.map((e) => e.name)).toEqual([
      'Bench Press (Barbell)',
      'Bicep Curl (Dumbbell)',
      'Pull Up',
      'Pull Up (Assisted)',
      'Plank',
    ]);
    expect(push.exercises[0]!.rows).toHaveLength(3);
  });
});

describe('unit headers', () => {
  it('reads kg from a "Weight (kg)" header', () => {
    const r = parseStrongCsv('Date,Workout Name,Exercise Name,Set Order,Weight (kg),Reps\n2024-01-02 10:00:00,A,Squat (Barbell),1,100,5');
    if ('error' in r) throw new Error(r.error);
    expect(r.fileWeightUnit).toBe('kg');
    expect(r.rows[0]).toMatchObject({ weight: 100, weightUnit: 'kg', reps: 5 });
  });

  it('reads lb from a Weight Unit column and km distances', () => {
    const r = parseStrongCsv('Date,Exercise Name,Set Order,Weight,Weight Unit,Reps,Distance (km)\n2024-01-02 10:00:00,Run,1,0,lbs,0,5\n2024-01-02 10:00:00,Squat,2,225,lbs,5,0');
    if ('error' in r) throw new Error(r.error);
    expect(r.fileWeightUnit).toBe('lb');
    expect(r.rows[0]!.distanceM).toBe(5000);
    expect(r.rows[1]).toMatchObject({ weight: 225, weightUnit: 'lb' });
  });

  it('accepts older exports with no Duration column', () => {
    const r = parseStrongCsv('Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n2024-01-02 10:00:00,A,Squat (Barbell),1,225,5,0,0,,,');
    if ('error' in r) throw new Error(r.error);
    expect(r.rows[0]!.durationSec).toBeUndefined();
  });
});

describe('errors and warnings', () => {
  it('rejects files that are not Strong exports', () => {
    expect(parseStrongCsv('foo,bar\n1,2')).toHaveProperty('error');
    expect(parseStrongCsv('')).toHaveProperty('error');
  });

  it('warns about unreadable dates and skips those rows', () => {
    const r = parseStrongCsv('Date,Exercise Name,Set Order,Weight,Reps\nnot a date,Squat,1,100,5\n2024-01-02 10:00:00,Squat,1,100,5');
    if ('error' in r) throw new Error(r.error);
    expect(r.rows).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/unreadable date/);
  });
});
