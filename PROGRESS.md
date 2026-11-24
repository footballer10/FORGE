# PROGRESS

Status legend: `[x]` done · `[ ]` todo · `[~]` partial

## Current
- **Done last session:** Session 1 — docs, data model, repository layer, scaffold.
- **Next session:** Milestone 1a (exercise library + logging core).
- **Known issues:** see bottom.

## Decisions (defaults chosen; change by asking)
- Hosting: Cloudflare Pages, Vite `base: '/'`.
- Week starts Monday.
- Strong dumbbells logged as pair totals → import halves by default.
- No Fullback Strength import.
- No router dependency: tab state lives in a Zustand store. Sub-screens use in-app stack state.
- Tailwind v3. `fake-indexeddb` added as a dev-only dependency for repository tests.
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

## Milestone 1a — Library + logging core
- [ ] Vendor free-exercise-db JSON; mapper to Exercise (pattern, loadModel, increment, rest) with tests
- [ ] Seed library on first run (idempotent, versioned)
- [ ] Exercise picker: search name + aliases, filter by muscle/equipment, recent first
- [ ] Custom exercise create/edit (load model, increment, rest, aliases)
- [ ] Active workout store (Zustand) backed by repositories; resume on reopen
- [ ] Start empty workout; add exercises
- [ ] Set row: weight × reps prefilled from last session; one tap to complete
- [ ] Custom numeric keypad with ± steps = exercise increment
- [ ] Set types (warm-up, working, drop, failure, AMRAP) + optional RPE/RIR
- [ ] Finish / discard workout; basic workout history list

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
- App icons are placeholder SVG/PNG; real icons in M8.
- Google Fonts load from the network on first visit and are runtime-cached; if first load is offline the system fallback fonts are used.
