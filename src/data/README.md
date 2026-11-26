# Vendored data

`free-exercise-db.json` is a slimmed copy (no images or level) of
[yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) `dist/exercises.json`,
released into the public domain (Unlicense). It is seeded into IndexedDB on first run.
Bump `LIBRARY_VERSION` in `src/domain/exerciseMapper.ts` when this file changes.

`foods.json` is built by `scripts/build-foods.mjs` from the USDA FoodData Central JSON downloads (Foundation Foods,
SR Legacy and Survey / FNDDS; public domain): per 100 g calories, protein, carbohydrate and fat, plus household
portions with their gram weights. Every number is copied from those files; the script only chooses which foods.
Rebuild with `node scripts/build-foods.mjs <foundation.json> <sr_legacy.json> <survey.json>` (see the script header
for where to download). Foods the app has logged are stored by their `fdc:<id>`, so a rebuild must keep earlier IDs.
