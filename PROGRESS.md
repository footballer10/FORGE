# PROGRESS

Status legend: `[x]` done · `[ ]` todo · `[~]` partial

## Current
- **Done last session:** Milestone 1a-ii — logging core: write-through workout store with resume, custom keypad (± = exercise increment), set rows prefilled from last session, set types + RPE/RIR sheet, finish/discard, history list. 49 tests pass.
- **Next session:** Milestone 1b (logging extras: rest timer, wake lock, supersets, notes, reorder/swap, edit past workouts, plate calculator).
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

## Milestone 1b — Logging extras
- [ ] Timestamp-based rest timer (per-exercise default, survives lock), vibration on end
- [ ] Screen Wake Lock while a workout is active (re-acquire on visibility change)
- [ ] Supersets/circuits: group, timer after last exercise of the round
- [ ] Sticky exercise notes + session notes
- [ ] Reorder / swap / remove exercises mid-workout
- [ ] Edit and duplicate past workouts
- [ ] Plate calculator (bar weight, available plates, per side)
- [ ] Display setting: show dumbbell pair total

## Milestone 2 — Import, export & safety
- [ ] Strong CSV parser (pure) + tests: dumbbell, bodyweight, kg, lb, duration/distance
- [ ] Import preview: exercise matching (name + aliases), create-or-map, dumbbell convention toggle
- [ ] Duplicate detection; ImportBatch + RawImportRow saved; re-apply conventions
- [ ] Full JSON export + `docs/export-format.md`
- [ ] Strong-format CSV export
- [ ] JSON restore (replace or merge) with preview
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
