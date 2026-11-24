# PROGRESS

Status legend: `[x]` done · `[ ]` todo · `[~]` partial

## Current
- **Done last session:** Milestone 1b-ii — supersets (rest only after the last exercise of the round), edit past workouts in place, repeat a past workout, plate calculator, dumbbell pair-total display. Milestone 1b is complete. 79 tests pass.
- **Next session:** Milestone 2a (Strong import) in progress; then 2b (export/restore), 2c (backup reminder, undo, trash).
- **Known issues:** see bottom.

## Decisions (defaults chosen; change by asking)
- Hosting: Cloudflare Pages, Vite `base: '/'`.
- Week starts Monday.
- Strong dumbbells logged as pair totals → import halves by default.
- No Fullback Strength import.
- No router dependency: tab state lives in a Zustand store. Sub-screens use in-app stack state.
- Tailwind v3. `fake-indexeddb` added as a dev-only dependency for repository tests.
- Library seeding never resurrects or overwrites: tracked by `sourceRef` (including soft-deleted rows) and `meta.librarySeedVersion`.
- Auto-generated aliases per library exercise: bare name and "Name (Equipment)" Strong-style, for import matching in M2.
- Finish requires at least one ticked set; the keypad replaces the prefilled value on first digit (backspace edits it).
- Profile is a singleton row with id `'me'`.
- Rest timer starts when a non-warm-up set is ticked, using the exercise's default rest; warm-ups start no timer. A timer that expired more than 3 s before the app resumed is dropped silently (no late buzz).
- Rest bar lives in `AppShell` above the tab bar, so it shows on every tab; wake lock is also held at shell level while a workout is active.
- Swap is allowed only while the exercise has no completed sets (its empty sets are soft-deleted and re-prefilled from the new exercise); otherwise remove + add.
- Notes write through on every keystroke (crash safety). Sticky note is stored on the exercise; "this workout only" note on the workout exercise; session note on the workout.
- Supersets: link an exercise with the next from its Options sheet; groups are labelled A, B, ... and rest starts after the last exercise of the group in workout order.
- Editing a past workout reopens it in the logging screen with its original end time kept; the ID is stored in `meta.editingWorkoutId` so a reload resumes the edit. No rest timer while editing. "Close without finishing" just closes (edits are already saved).
- Repeat copies exercises, supersets and set structure (type/weight/reps/time/distance) as unticked sets; notes, RPE/RIR are not copied.
- Plate calculator uses the exercise's `barWeight`, else the default equipment profile's bar (45 lb) and plates; shown only for barbell exercises with the `total` load model. Greedy, per side, with a "closest" note when the target is not reachable.
- Dumbbell pair total is display-only, a small "N total" line under the weight; the toggle lives on the Train home screen until a Settings screen exists.
- Default rest 120 s for compound lifts, 90 s otherwise; default increment 5 lb barbell, 5 lb dumbbell (per implement), 2.5 lb fallback for small plates is a per-exercise edit.

## Milestone 0 — Foundation
- [x] SPEC.md, CLAUDE.md, PROGRESS.md
- [x] Vite + React + TS scaffold, Tailwind, PWA plugin, Vitest
- [x] Design tokens (dark/light), fonts, safe areas, no zoom / rubber band
- [x] App shell with five tabs (Home, Train, Strength, Progress, Coach)
- [x] Data model as code (`src/domain/types.ts`) including later-phase entities
- [x] Units + load-model pure functions with tests
- [x] Dexie schema v1 + repository layer with tests

## Milestone 1a-i — Exercise library
- [x] Vendor free-exercise-db JSON (slimmed); mapper to Exercise (pattern, loadModel, increment, rest, aliases) with tests
- [x] Seed library on first run (idempotent, versioned, never overwrites user edits)
- [x] Exercise picker: search name + aliases, filter by muscle/equipment, recent first (pure search fn + tests)
- [x] Custom exercise create/edit (load model, increment, rest, aliases)

## Milestone 1a-ii — Logging core
- [x] Active workout store (Zustand) backed by repositories; resume on reopen
- [x] Start empty workout; add exercises
- [x] Set row: weight × reps prefilled from last session; one tap to complete
- [x] Custom numeric keypad with ± steps = exercise increment
- [x] Set types (warm-up, working, drop, failure, AMRAP) + optional RPE/RIR
- [x] Finish / discard workout; basic workout history list

## Milestone 1b-i — Logging extras, part 1
- [x] Timestamp-based rest timer (per-exercise default, survives lock), vibration on end
- [x] Screen Wake Lock while a workout is active (re-acquire on visibility change)
- [x] Sticky exercise notes + session notes
- [x] Reorder / swap / remove exercises mid-workout

## Milestone 1b-ii — Logging extras, part 2
- [x] Supersets/circuits: group, timer after last exercise of the round
- [x] Edit and duplicate past workouts
- [x] Plate calculator (bar weight, available plates, per side)
- [x] Display setting: show dumbbell pair total

## Milestone 2a — Strong import
- [ ] CSV tokenizer + Strong CSV parser (pure) + tests: dumbbell, bodyweight, kg, lb, duration/distance
- [ ] Exercise matching (name + aliases), create-or-map plan, dumbbell convention (pure + tests)
- [ ] Duplicate detection (pure + tests)
- [ ] Import commit: ImportBatch + RawImportRow saved, re-apply conventions (repository + tests)
- [ ] Import preview UI: file pick, per-exercise map/create, dumbbell toggle, duplicate count, confirm

## Milestone 2b — Export & restore
- [ ] Full JSON export + `docs/export-format.md`
- [ ] Strong-format CSV export
- [ ] JSON restore (replace or merge) with preview

## Milestone 2c — Safety net
- [ ] Weekly backup reminder (Files/iCloud via share sheet / download)
- [ ] Undo last action
- [ ] Trash: soft-deleted workouts, 30-day purge, restore

## Milestone 3 — Routines & programs
- [ ] Routine CRUD with target sets/reps/rest/RPE; start workout from routine
- [ ] Program → weeks → planned sessions; versioning with change reason
- [ ] Planned vs completed linking and view
- [ ] History calendar + training-day heatmap
- [ ] Progression rules: double progression, % e1RM, RPE target → suggested weight (pure + tests)

## Milestone 4 — Strength analytics (likely split 4a/4b)
- [ ] e1RM formulas (Epley, Brzycki, Lombardi, Mayhew, O'Conner, Wathan) + tests
- [ ] Per-exercise e1RM chart with formula picker
- [ ] PR detection: rep-range, e1RM, volume + PR timeline (tests)
- [ ] Weekly hard sets per muscle (primary 1.0, secondary 0.5 — shown)
- [ ] Period comparisons (month vs last; 3/6/12 months)
- [ ] Strength score: chosen lifts + weights, formula displayed
- [ ] Strength tiers from editable standards tables
- [ ] Muscle body map (front/back SVG)
- [ ] Plateau detection (N weeks without e1RM gain)
- [ ] Balance checks: push:pull, squat:hinge

## Milestone 5 — Body & athletic
- [ ] Bodyweight log + smoothed trend (EWMA, shown)
- [ ] Fitness tests + results history (pull-up max, push-ups, 1.5 mi, 40 yd, broad, vertical, custom)
- [ ] Conditioning sessions (time/distance sets)
- [ ] Progress photos (IndexedDB blobs, device only)

## Milestone 6 — Claude coach
- [ ] Training profile editor
- [ ] Copy-for-Claude summary (date range, PRs, volume, program, profile)
- [ ] `docs/program-schema.md` + JSON schema
- [ ] Paste Claude program → validate → diff preview → approve → save (AiDecision logged)

## Milestone 7 — Gamification
- [ ] Achievement definitions + evaluator (pure + tests)
- [ ] Weekly streaks vs planned days
- [ ] PR celebration animation (post-set, summary, Home)

## Milestone 8 — Polish & install
- [ ] Empty states, onboarding (units, bodyweight, goals)
- [ ] Accessibility pass (labels, contrast, reduced motion)
- [ ] Performance (list virtualization if needed, bundle split for Recharts)
- [ ] Install-to-home-screen help; offline check; real app icons
- [ ] Cloudflare Pages deploy

## Known issues
- No Settings screen yet: pair-total toggle is on the Train home; plate sizes and bar weight come from the default equipment profile with no editor (M8 / later).
- Editing a past workout changes its sets but not its start/end times or name (no editor for those yet).
- Superset rounds are not enforced or visually sequenced; supersets only affect when the rest timer starts.
- `navigator.vibrate` is unsupported on iOS Safari, so on iPhone the rest timer ends with no buzz or sound (a visual change only). Needs a decision (e.g. audio cue) later; not added to avoid guessing.
- The rest timer cannot alert while the PWA is backgrounded or locked (no push/background timers on iOS); it is correct on return, just silent.
- Reorder is up/down buttons, not drag-and-drop (no new dependency).
- `window.confirm` is still used for Remove in the options sheet (M8).
- Finish drops unticked sets and exercises with no completed sets (documented behaviour); there is no undo until M2.
- Discard soft-deletes the workout (goes to trash once the trash screen exists in M2).
- Remove-exercise / discard use `window.confirm`; replace with in-app dialogs in M8 polish.
- History list is read-only and loads the latest 30 workouts without virtualization.
- Keypad ± for weight converts the exercise increment into the set's unit; weights are shown in the set's stored unit, not the profile unit, if they differ.
- Library pattern/loadModel/rest values are name-based heuristics (`exerciseMapper.ts`); some library entries will be mis-classified. Fix per exercise in the editor; bump `LIBRARY_VERSION` only to add missing exercises (existing ones are never overwritten).
- Exercise library JSON (~790 KB, 150 KB gzip) is a lazy chunk, precached by the service worker; Vite warns about chunk size. Fine for now, revisit in M8.
- Increment unit is lb-only in the exercise form; kg increments come with the units setting.
- Library exercises (not just custom) can be deleted from the editor; deleted ones are not re-seeded.
- App icons are placeholder SVG/PNG; real icons in M8.
- Google Fonts load from the network on first visit and are runtime-cached; if first load is offline the system fallback fonts are used.
