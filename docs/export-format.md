# Forge export format

Produced by Train → Backup & restore → "Save full backup (JSON)". One UTF-8 JSON file, `forge-backup-YYYY-MM-DD.json`.

## Envelope

```json
{
  "format": "forge-export",
  "version": 1,
  "exportedAt": "2026-11-24T17:03:00.000Z",
  "counts": { "exercises": 812, "workouts": 140, "sets": 2300, "...": 0 },
  "tables": { "exercises": [ ... ], "workouts": [ ... ] }
}
```

- `format` must equal `forge-export`. `version` is an integer; the app refuses files with a higher version than it knows.
- `counts` is the row count per table (sanity check only; it is not trusted on restore).
- `tables` holds one array of rows per table. Every row is the stored entity exactly as defined in `src/domain/types.ts` (the source of truth for fields). Every row has a string `id`.

## Tables

`exercises`, `workouts`, `workoutExercises`, `sets`, `routines`, `programs`, `programWeeks`, `plannedSessions`, `bodyMetrics`, `fitnessTests`, `testResults`, `readiness`, `profile`, `importBatches`, `rawImportRows`, `achievements`, `aiDecisions`.

A table missing from a file is treated as empty. Unknown tables are ignored.

## Conventions

- IDs are UUID strings. Timestamps are ISO-8601 UTC (`createdAt`, `updatedAt`, optional `deletedAt`). Dates without a time are local `YYYY-MM-DD`.
- Soft-deleted rows (`deletedAt` set) are exported, so the trash travels with a backup.
- Weights are stored as a number plus a `unit` (`lb` or `kg`) on each set; nothing is converted on export.
- Dumbbell sets store ONE dumbbell (`perImplement`), never the pair total.
- `rawImportRows` keep the original Strong CSV rows so import conventions can be re-applied.

## Not included

Progress photos (device-only blobs), the undo stack and app meta (seed version, reminders).

## Restore

- **Replace**: clears the tables above and writes the file's rows. One transaction; if it fails nothing changes.
- **Merge**: rows are matched by `id`. A row missing locally is added; a row present on both sides is replaced only when the backup's `updatedAt` is later; ties keep the local row. Nothing local is removed.

## Strong-format CSV

"Export workouts as Strong CSV" writes the columns `Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, Distance, Seconds, Notes, Workout Notes, RPE`.

- Only finished workouts and completed sets. Dates are local time (`YYYY-MM-DD HH:MM:SS`), duration like `1h 5m`.
- `Set Order`: `W` warm-up, `D` drop, `F` failure, otherwise 1, 2, 3 ... counting normal sets.
- All weights use the unit chosen at export (the file has no unit column). Dumbbell weights are doubled to pair totals, matching how Strong logs them and what this app's importer halves by default.
- Distance is in metres, Seconds is set duration. Set notes are not stored in Forge; `Notes` holds the exercise note.
