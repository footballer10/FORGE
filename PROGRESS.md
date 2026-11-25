# PROGRESS

Status legend: `[x]` done · `[ ]` todo · `[~]` partial

## Current
- **Done this session (14, item 3):** unsaved-draft protection. Shared hook `components/useLeaveGuard.tsx`: the draft counts as changed once its JSON differs from its first value; Cancel then asks "Discard changes?" (Keep editing is the default) and a reload or close shows the browser warning. Used in the routine and planned-session editor (`ExercisesEditor`) and the program editor. The Claude proposal paste box keeps its text in localStorage (`forge.proposalDraft`) so it survives leaving the Coach tab or closing the app; approve, reject or clearing the box removes it. Tests (410) and build pass; the hook has no unit test (React only, tests run in node) and was not clicked through in a browser.
- **Next session:** milestone 14, next items: kg increments in the exercise form plus unit changes converting displayed set weights (check the design with the user first; it touches stored data), then the Settings plate/bar editor and dialog focus trap. Drag-to-reorder still needs your OK for a dependency.
- **Done this session (14, item 2):** editing a past workout now has "Edit name and times" at the top of the logging screen (`features/train/DetailsEditor.tsx`): name plus start and end pickers, saved with one button after validation (`domain/workoutDetails.ts`: name required, end after start, end not in the future; times are local wall-clock). Writes through `workoutRepo.update` at once. Tests (410) and build pass. Not opened on an iPhone (native datetime-local picker).
- **Next session:** milestone 14, next unticked item (drag to reorder: needs a dependency, ask first, or keep buttons; so start with unsaved-draft protection in the routine, program and proposal editors).
- **Done this session (14a + 14b, first item of milestone 14):** imported exercises get muscles and movement pattern. Pure `domain/exerciseInference.ts` `inferTraits`: copies the closest library exercise (name similarity ≥ 0.75 with equipment words and the "(Tag)" ignored), else keyword rules on the name (squat, hinge, presses, rows, pulls, curls, core, carries; first match wins), else nothing. New imports now fill muscles, pattern and unilateral at creation (a file-based pattern such as time/distance wins). For exercises already imported: Settings → "Review exercise muscles" lists every exercise with no primary muscle, each with its suggestion and the reason, ticked by default; "Apply to N exercises" writes them (`exerciseRepo.traitSuggestions` / `applyTraits`). No suggestion = listed with a note to set it in the library. Tests (407) and build pass. Not opened in a browser or on an iPhone.
- **Next session:** the next unticked item of milestone 14 (edit a past workout's name and times). Still open: deploy the Worker, sync once, add the connector (docs/connector.md) and report what happens.
- **Done this session (13a + 13b, milestone 13 complete):** each fitness test can have a target and a test date, typed by the user (`FitnessTest.targetValue` in base units, `testDate`; optional fields, no schema bump). Progress > Fitness tests: under each test name a line like "target 15 reps, 6 reps to gain, test 2026-12-20 (in 25 days)" (or "target met"); open a test to edit the goal ("Save goal", clear both boxes to remove). Pure `testCountdown`, `describeCountdown`, `daysUntil` in `domain/fitness.ts`; `fitnessRepo.setGoal`. 13b: the Coach summary's Fitness tests section lists the goal per test (even with no results yet) and, when any test has a date, adds a line asking Claude to aim the plan at it and not change my targets. Tests (400) and build pass. Not opened in a browser or on an iPhone.
- **Next session:** milestone 14 (issue burn-down, one item per sitting; start with imported exercises' muscles/pattern). Still open: deploy the Worker, sync once, add the connector (docs/connector.md) and report what happens.
- **Done this session (12a + 12b, milestone 12 complete):** `domain/insights.ts` turns existing analytics into one-sentence notes with the numbers: missed week (last week's days vs planned), imbalance (push:pull, squat:hinge over 4 weeks, reusing `balanceChecks`; 'Pulling volume is low' for push-heavy), plateau (no e1RM gain in 6 weeks, reusing `detectPlateau`). Home shows at most 3 under the status line (`InsightNotes`): tap a note for the rule and inputs, × dismisses it. Dismissals are ids kept in localStorage on the device; ids include the lift's last-gain date or the week, so a note can return when the situation changes. 12b: Coach has a 'Copy weekly review' button: a short ask for Claude, all current notes with their rules, then the 7-day summary (`domain/weeklyReview.ts`). Tests (392) and build pass. Not opened in a browser or on an iPhone.
- **Next session:** milestone 13 (fitness-test countdown), then 14. Still open: deploy the Worker, sync once, add the connector (docs/connector.md) and report what happens.
- **Done this session (11c, milestone 11 complete):** "+ Warm-ups" button on barbell exercises that have a working weight and no warm-ups yet. Pure `domain/warmup.ts` `buildWarmups`: empty bar × 10, then 50% × 5, 70% × 3, 85% × 1 of the first working weight, each rounded down to what the plates can load (plate calculator logic), duplicates and steps at or above the work weight dropped. Warm-ups are inserted before the working sets (`workoutRepo.insertWarmups`); bar and plates come from the exercise, the equipment profile, else 45 lb and a standard plate set. Tests (383) and build pass.
- **Next session:** milestone 12 (plain-language insights), then 13, 14. Still open: deploy the Worker, sync once, add the connector (docs/connector.md) and report what happens.
- **Done this session (11b):** logging screen shows a "Suggested 140 lb × 8 · tap to fill" chip on exercises started from a routine or program that has a progression rule; one tap fills the next open working set (weight, unit, reps when the rule sets them), and the one-line reason (formula and inputs) sits under it. Chip disappears when no working set is open. New `WorkoutExercise.suggested` (numbers); `progressionNote` now holds only the reason. `suggestionTarget` in `domain/logging.ts`, `fillSuggested` in the workout store, tests added. Tests (378) and build pass.
- **Done this session (11a):** Home now opens with a "Next up" card (`features/home/NextUpCard.tsx`): the newest active program's first open session (via `nextSession`), else the routine of the last finished workout; lists each exercise with the sets and weight it will start with (same prefill and progression rules as starting, via read-only `workoutRepo.previewPlan`); one tap starts it and switches to Train. Hidden while a workout is in progress. Pure helpers `domain/nextUp.ts` (`pickNextUp`, `summarizeSets`) with tests. Tests (376) and build pass.
- **Done this session (10d, milestone 10 code complete):** `propose_program` MCP tool: validates with the app's own `validateProposal`, checks exercise names against the library, rejects with a readable message Claude can act on, caps 5 waiting proposals and 100k characters, and writes ONLY an `aiDecisions` row with status `proposed` (test confirms programs, workouts and sets are untouched). `get_proposals` read tool. App: Coach → Program from Claude gets a "Proposals waiting" inbox (Check for proposals runs a sync, Review loads the existing diff and approve flow, Reject dismisses); approve/reject update the same decision row instead of logging a second one, and the result syncs back. Tests (370) and build pass. Nothing tried against the real Claude connector or real D1 yet.
- **Next session:** Before coding: you deploy the Worker, sync once, add the connector, and report what happens (docs/connector.md); fix anything that breaks. Then 11a (Today: next-up session), 11b, 11c, 12, 13, 14.
- **Done this session (10c):** MCP server on the Worker (`worker/src/mcp.ts`, tools in `worker/src/tools.ts`): stateless Streamable HTTP with JSON responses at `/mcp/<token>` (Bearer also accepted), 7 read-only tools (profile, exercises, workouts, exercise history with e1RM formula and unit, weekly hard sets per muscle, active program, bodyweight), reusing the app's pure domain functions. No write tools. 9 new tests call the tools over real MCP JSON-RPC against SQLite. `wrangler deploy --dry-run` bundles fine (247 KiB gzip); added `nodejs_compat`. `docs/connector.md` has the connect steps. Tests and build pass. NOT yet tried against the real Claude connector screen or real D1.
- **Next session:** first, you deploy the Worker, sync once from the phone, and add the connector (docs/connector.md); report what Claude's screen says. Then 10d (propose_program write tool creating an `AiDecision` with status `proposed`, plus the Coach inbox using the existing approve flow). Then 11a-c, 12, 13, 14.
- **Done this session (10b):** app sync client `db/repositories/sync.ts` (`syncRepo`): push rows with `updatedAt` at or after a saved watermark (batches of 200, watermark moves only after the server accepts a batch, so offline or failed syncs just retry; no separate queue), then pull pages from the saved cursor; last-writer-wins by `updatedAt`, ties keep local. Never throws; errors stored as `lastError`. Settings → Cloud sync panel (`SyncPanel.tsx`): URL + token, Connect and sync, Sync now, Re-upload everything, Disconnect, pending count, last sync and error. URL/token live in the `meta` table (not in backups). 7 new tests with a fake server; tests (354) and build pass. Not tried against the real Worker yet.
- **Next session:** 10c (MCP server on the Worker with read tools, docs/connector.md, user adds it in Claude). Needs the Worker deployed and a first real sync from the phone so D1 has data. Then 10d, 11a-c, 12, 13, 14.
- **Done this session (10a):** sync backend in `worker/`: Cloudflare Worker handler (`worker/src/sync.ts`) with D1 schema (`worker/schema.sql`, one JSON row table keyed by table+id with a server `seq` change counter), Bearer-token auth (constant-time compare, refuses tokens under 16 chars), `POST /api/sync/push` (max 200 rows, last-writer-wins by `updatedAt`, whole push rejected on a bad row), `GET /api/sync/pull?since=` (paged, 500 max), `/api/health`, CORS. Photos, undo, meta and raw import rows are not synced. 17 tests run the real SQL against node:sqlite. `docs/connector.md` has deploy steps (user step: wrangler login, d1 create, schema, secret, deploy). Dependencies added with approval: wrangler, @modelcontextprotocol/sdk, zod (dev). Not deployed or tried against real D1 yet.
- **Superseded plan:** 10b (app sync layer behind the repository interface: push/pull, status and Sync now in Settings, offline-safe queue). Before it: deploy the Worker per `docs/connector.md` and give the Worker URL and token when asked (token stays in the app's Settings, never in the repo). Then 10c, 10d, then 11a-c, 12, 13, 14.
- **Done this session (9b, milestone 9 complete):** per-exercise page rebuilt: header with best e1RM and PR badges (PRs from the last 30 days, max 3), ONE chart with range pills (1M/3M/6M/1Y/All, default 6M) and the formula named under it (compact formula select kept), segments History (working sets per workout, warm-ups counted not listed, 10 then Show more), Records (best load at exactly 1/3/5/8/10 reps with dates) and Volume (per workout). Helpers in `domain/exerciseHistory.ts` with tests. The old PR timeline list is gone (badges + Records replace it). Tests (330) and build pass. Not yet seen on a phone or with real data in a browser.
- **Done earlier (information diet, 9a):** Home, Train, Strength, Progress and Coach simplified (see Decisions). Train went from about 7,400 px of scrolling to one screen with sample data. Tests (326) and build pass.
- **Done earlier (post-M8 tweaks):** rest timer after every set incl. warm-ups; rest alarm as locked-screen-safe audio with a Settings option and test button; logging screen declutter (collapsed exercise cards, folded warm-ups). Tests and build pass. Open requests: rework of the Strength tab (user dislikes it; waiting for specifics) and a built-in Claude (decision pending, see chat).
- **Previous session:** Milestone 8b (milestone 8 code complete): tab screens lazy-loaded and Recharts split into its own chunk (entry bundle 923 kB to 277 kB, no size warning); real F icons (rounded, maskable, Apple touch); install-to-Home-Screen help in Settings; offline check passed in headless Chromium (reload offline, lazy tabs load); accessibility pass (lighter `accent-text` token so red text reaches 5:1 on dark, focus-visible ring, Escape closes the confirm dialog; muted text already 5.2:1 or better); Cloudflare Pages config (`public/_headers`) and `docs/deploy.md`. Tests (311) and build pass.
- **Earlier plan (superseded by the line above):** Milestone 11a, 11b, 11c, then 10, then 12, 13, 14. Before that: the Cloudflare Pages deploy is a user step (needs the user's Cloudflare account): follow `docs/deploy.md`. After that, the first real-device pass (iPhone): Strong import with the real file, offline, backup share sheet, photos.
- **Known issues:** see bottom.

## Decisions (defaults chosen; change by asking)
- Fitness-test countdown (13): one target and one test date per test, stored on the test (target in base units, shown in the profile length unit). Gap = target − best (higher is better) or best − target (lower is better), floored at 0; measured against the BEST result, not the latest. A past date shows "N days ago". The Worker/connector does not expose targets yet (the Copy summary does).
- Insights (12a): max 3 notes on Home, order missed week, imbalance, plateaus (longest first). Dismissed note ids live in localStorage, not the database (display preference; no sync or schema change). 'Missed' ignores long breaks (nothing the week before). Weekly review (12b) copies from Coach; the connector path is separate and unchanged.
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
- Rest timer starts when ANY set is ticked (warm-ups included, like Strong). Warm-ups rest for the exercise rest capped at 60 s; other sets use the exercise default (or the routine override). Ticking another set replaces the running timer. A timer that expired more than 3 s before the app resumed is dropped silently (no late buzz).
- Rest alarm sound: the app plays one generated audio file that is silent for the whole rest and ends with three beeps (`domain/restAudio.ts`, `features/train/restAudio.ts`), so the beeps sound with the screen locked without any code running. Played on one persistent `<audio>` element unlocked by the first tap. Settings: Off / Sound (audio session `ambient`: plays over music, obeys the silent switch; default) / Loud (`playback`: ignores the silent switch, pauses music). Stored per device in localStorage (`forge.restAlert`). ±15 s and skip regenerate or stop the audio. NOT yet verified on an iPhone.
- Logging screen declutter: only the first unfinished exercise is open; others show one line (name, done/total working sets, best set). Tapping a title opens or closes it (override kept until the workout closes). Warm-ups fold into one 'Warm-up · N sets done' line once all are ticked; tap to show. Finishing the last set of an exercise collapses it and opens the next.
- Rest bar lives in `AppShell` above the tab bar, so it shows on every tab; wake lock is also held at shell level while a workout is active.
- Swap is allowed only while the exercise has no completed sets (its empty sets are soft-deleted and re-prefilled from the new exercise); otherwise remove + add.
- Notes write through on every keystroke (crash safety). Sticky note is stored on the exercise; "this workout only" note on the workout exercise; session note on the workout.
- Supersets: link an exercise with the next from its Options sheet; groups are labelled A, B, ... and rest starts after the last exercise of the group in workout order.
- Editing a past workout reopens it in the logging screen with its original end time kept; the ID is stored in `meta.editingWorkoutId` so a reload resumes the edit. No rest timer while editing. "Close without finishing" just closes (edits are already saved).
- Repeat copies exercises, supersets and set structure (type/weight/reps/time/distance) as unticked sets; notes, RPE/RIR are not copied.
- Plate calculator uses the exercise's `barWeight`, else the default equipment profile's bar (45 lb) and plates; shown only for barbell exercises with the `total` load model. Greedy, per side, with a "closest" note when the target is not reachable.
- Dumbbell pair total is display-only, a small "N total" line under the weight; the toggle lives on the Train home screen until a Settings screen exists.
- Strong import: file dates are local wall-clock time; weights keep the unit the file states (header `Weight (kg)` or a Weight Unit column), else the unit chosen in the preview (default lb). Stored in that unit; never converted at import.
- Strong import: distance is read as metres unless the header says `(km)` or `(mi)`. Strong's own export may differ; check on the first real file.
- Strong import: only equipment `dumbbell` + `perImplement` exercises get the pair-total halving (kettlebells are single loads). Default is halve; override globally or per exercise in the preview; fixable later from "Past imports".
- Strong import matching: exact name/alias only is auto-applied. If several library exercises share the alias, the plain "Barbell X" form (then the shorter name) is picked and the rest are offered, with a "check it" note. Close-but-not-exact names are suggestions only; default is "create new exercise".
- Strong import duplicates: a file workout whose start falls in the same minute as an existing workout is skipped (survives later edits to the sets).
- Strong import new exercises: modelled from the name tag and the data (Dumbbell → perImplement, Assisted → assisted, Weighted/pull-ups → bodyweightPlusAdded, no reps with time/distance → timeDistance, else total), `source: 'import'`, no muscles (editable in the library).
- Strong import raw rows: only rows that produced a set are stored in `RawImportRow` (rest-timer rows are counted, not stored). Set completion times are spread across the workout duration; workouts with no Duration end at their start time.
- Set-level notes from Strong are joined into the workout exercise's notes (sets have no note field).
- Backup JSON excludes progress photos, undo stack and meta; includes soft-deleted rows. Merge restore matches by id, later `updatedAt` wins, ties keep local. Replace needs a second tap (no `window.confirm`).
- Strong CSV export: finished workouts and completed sets only, one weight unit chosen at export, dumbbells written as pair totals (doubled) so it round-trips with the importer default.
- Export is delivered through the share sheet when the browser can share files (iPhone), else a download.
- Undo stack: persisted in the `undo` table, newest 10, entry = previous rows + created IDs. Recorded for finish (incl. dropped sets), discard, delete workout and Strong import. The snackbar shows for 20 s; Backup screen can undo the latest entry any time. Not recorded: restore, per-set edits, exercise edits.
- Backup reminder: due when the last JSON export is 7+ days old (or never, once any workout exists); "Later" snoozes 1 day. Shown on Home and Train.
- Trash: workouts and exercises. Purge on launch after 30 days. Library exercises (have `sourceRef`) and exercises with logged sets are never purged (library would reseed them). Trashed workouts are excluded from last-session prefill; future analytics must exclude sets whose workout has `deletedAt`.
- Routines: starting one creates sets from its targets (reps = low end of a range; weight = target weight, else the same-numbered set of the last session, matched separately for warm-ups and working sets; else empty). RPE targets are never prefilled. Targets and the rest override are copied onto the `WorkoutExercise` (`targets`, `restSec`) and shown as a "Target ..." line while logging; the rest override replaces the exercise default for non-warm-up sets. Exercises deleted since the routine was saved are skipped on start.
- Routines: deleting is a soft delete with an undo entry (no Trash screen section yet, no purge). "Save as routine" from History captures completed sets only (type, weight, reps, time, distance), no RPE or rest.
- Programs: every save of an existing program creates a NEW program row (version + 1, `previousVersionId`, required `changeReason`); the old row is archived and keeps its own weeks and sessions. New rows copy `completedWorkoutId` / `skipped` so history survives an edit. Lists show only the newest version of each chain; "Delete" soft-deletes every version (undoable). First save uses reason "Created".
- Programs: only one program is active; activating one sets any other active program to draft. A new version keeps the old status (an archived program re-saved becomes a draft).
- Programs: "next session" is the first session in plan order that is not done or skipped. Sessions with no exercises get no Start button. Week and day numbers always follow list order (reordering renumbers).
- Planned sessions reuse the routine exercise editor (`ExercisesEditor`), so targets, rest overrides and supersets work the same; starting one copies targets and rest onto the workout like a routine.
- Plan vs completed: sets are matched to targets by position within the exercise, warm-ups and working sets separately; only completed sets count. Reps are "on target" inside [reps, repsMax]; weight is compared in the target's unit with a 1% tolerance. Adherence = planned sets with a completed set / planned sets (extra sets and unplanned exercises are listed, not counted).
- Linking: finishing a workout started from a planned session sets `completedWorkoutId` and clears `skipped`; deleting that workout unlinks it (undo restores the link). Editing a past workout never relinks.
- Calendar and heatmap: local days, Monday weeks. Shade = completed non-warm-up sets that day relative to the busiest day among the last 26 weeks (four steps at >0, >25%, >50%, >75%); the formula is printed under the heatmap. Tapping a calendar day lists its workouts with Open (edit).
- Progression still uses Epley from `src/domain/e1rm.ts` (weight × (1 + reps/30), a single is its own max); the other five formulas live there too and are used by analytics only. Suggestions use the LAST session of the exercise only (not a best-ever e1RM). Working sets = working, AMRAP, failure with weight and reps; warm-ups and drop sets are ignored. Result is rounded to the exercise increment (rule increment for double progression, converted to the set's unit).
- Progression is shown, not silent: the suggested weight/reps prefill working sets whose target has no fixed weight (a fixed target weight wins), and the formula plus inputs appear as a "Suggested ..." line on the exercise while logging. Everything stays editable. Without usable history (or no RPE for the RPE rule) nothing is suggested.
- Bodyweight (5a): one value per day (several weigh-ins on a day are averaged); trend = EWMA with α = 0.1 per day, gap of g days uses 1 − 0.9^g; the first weigh-in seeds it. Shown with formula text under the chart. Entries keep the unit they were logged in and are converted to the profile unit for the trend. Delete is a soft delete with no undo bar entry. Panel sits at the top of Progress; the strength score's quick "Log today" box stays and writes the same rows.
- Fitness tests (5b): built-ins are seeded lazily with fixed ids `builtin:<key>` (a deleted built-in stays deleted); custom tests are user-defined (name, measure, direction). Base units: reps, seconds, metres (broad jump), centimetres (vertical), weight in the result's own unit; shown in the profile length unit. Times are typed as m:ss or seconds. "Best" follows the test's direction, ties keep the earlier result. No standards, scores or pass marks are applied (none are invented); the battery presets field (`batteries`) is unused until later. Deleting a custom test soft-deletes its results; no undo entry.
- Conditioning (5c-i): any completed non-warm-up set on a `timeDistance` exercise in a finished, non-trashed workout counts, whatever the workout `kind`. Pace is per mile when the profile length unit is inches, else per km (no separate setting); distances show as yards/miles or metres/km the same way. Average pace = total time ÷ total distance over sets that have both. Bests are the fastest time at the exact same distance (rounded to the metre); different distances are never compared and no pace "PR" is claimed across them. Conditioning sessions are not exposed to the PR/volume analytics (no load).
- Photos (5c-ii): stored as JPEG blobs in `progressPhotos` (IndexedDB), device only, never in JSON backup/restore or CSV. Picked photos are shrunk to a 1600 px longest edge at JPEG 0.85 (EXIF rotation applied) before saving; if the browser cannot decode one, the original file is stored. "Take photo" uses a file input with `capture`, "Choose from library" a multi-select image input. Delete is permanent (second tap), with no trash or undo, so a blob does not linger. Saving asks the browser for persistent storage.
- Coach summary (6a): plain text, sections in a fixed order (profile, training, weekly sets per muscle, balance, lifts, PRs, body, tests, current program, how to answer). Window is the last 28/56/84 days ending today (default 56). Each figure states its unit, window and rule; e1RM uses the profile formula, plateau uses the 6-week rule, balance the 4-week window. Lifts: loaded exercises with sets in the window, top 15 by set count. PRs: the app's own PR events inside the window. Muscle sets are the weighted weekly average. The profile's name and exact birth year are not included (age only). Conditioning sessions are only counted, not detailed. Active program is listed per session with targets and done/skipped state. The text ends with a short "how to answer" note (proposals with reasons; user approves in the app).
- Profile editor (6a): saved with one button, not per field; equipment weights are stored in the profile weight unit; clearing an optional field removes it from the summary. A profile edit does not create an undo entry.
- Program proposals (6b): one JSON object, `schemaVersion` 1, hand-written validator (no schema library; the JSON Schema in the doc is for Claude and humans). Unknown fields are errors; all problems are listed with paths. Exercises are matched by exact name or alias (case-insensitive); unmatched names block approval and are never auto-created. `count` repeats a set; unit defaults to the profile unit. Diff matches sessions by position (week, day) and exercises by ID, and shows added, removed and changed targets or rest. With an active program the default is a new version of it (history kept; completed/skipped carry over only where the session is in the same place with the same name); the alternative is a separate draft. Without an active program it is saved as a draft. Approve never activates anything. Rejecting also logs an `AiDecision`. Nothing is saved before Approve.
- Achievements (7a): milestones only, no points. Families: workouts finished (1, 10, 25, 50, 100, 250, 500), hard sets (100 to 10,000), PRs (1, 10, 25, 50, 100; any PR kind counts), and e1RM at 135/225/315/405/495 lb on the strength-score lifts (kg e1RMs are converted to lb to compare; keys always use lb). Each is dated at the workout that crossed it. Thresholds are the app's own round numbers. `sync()` stores only missing keys, so earned achievements are never removed when data is later edited or deleted; title/description are stored on the row. Weekly-streak achievements come with 7b.
- Streaks (7b): a Monday–Sunday week (local days) is a hit when distinct training days reach the target; target = active program's `daysPerWeek`, else profile `plannedDaysPerWeek`. Any finished workout counts as a day, whatever its kind. Current streak = hit weeks in a row ending last week, plus this week if already hit; the week in progress never breaks it. Weeks with no workouts are included, so a gap breaks the run. Streak achievements are dated at the workout that reached the target in the milestone week.
- PR celebration (7b): after ticking a working set, a rep PR (heaviest load at that exact rep count, needing an earlier value) gets a 240 ms pulse, ring and "PR" badge on the row, memory only. e1RM and volume PRs are not flagged live; they appear in the summary and on Home. The summary sheet appears after Finish (not after editing a past workout) and marks its new achievements seen.
- Information diet (9a): each tab has one job. Home = one status line ("N of M days this week", streak only if above zero), a slim backup bar when due, then History: rows show name, date, exercise count, duration and the best set of the first three lifts; tapping a row opens every working set (warm-ups only counted) and Edit/Repeat/Routine/Delete; 10 rows then Show more. Train = Start workout (bottom), Program, Routines (Start plus a ⋯ menu for Edit/Delete). Strength = list of lifts with best e1RM of the last 4 weeks and change vs the 4 weeks before (`domain/liftSummary.ts`); score, tiers, weekly sets, balance, body map, PRs and achievements sit under Strength → Insights. Progress = menu of Bodyweight, Fitness tests, Conditioning, Photos. Exercise library, Strong import and Backup are rows in Settings (open via `uiStore.openTrain`). The dumbbell pair-total toggle and theme live only in Settings.
- Default rest 120 s for compound lifts, 90 s otherwise; default increment 5 lb barbell, 5 lb dumbbell (per implement), 2.5 lb fallback for small plates is a per-exercise edit.

- Analytics (4a): only finished, non-trashed workouts count. Effective load per `domain/load.ts`; bodyweight lifts use the nearest weigh-in on or before the set, else the workout snapshot, else the set is skipped. Analysis unit is the profile unit. e1RM uses sets of 1–12 reps, one point per workout (its best set); a single is its own max in every formula. Default formula Epley, changed in the chart screen and stored on the profile.
- PRs (4a): the first value of each kind is a baseline, not a PR; ties are not PRs. Kinds: rep (heaviest load at exactly 1, 2, 3, 4, 5, 6, 8, 10 or 12 reps), e1RM (chosen formula), volume (load × reps summed over the exercise in one workout). Evaluated per workout, so several sets in one workout yield at most one PR per kind and rep count.
- Volume (4b-i): a hard set is a completed non-warm-up set of a finished, non-trashed workout; it counts even with no reps/load. Muscle credit: primary 1.0, secondary 0.5 (a muscle listed as both counts once, as primary). Exercises with no muscles are counted in the set total and reported as "unassigned", not spread anywhere. Volume (load × reps) uses effective load and is 0 for sets with unknown load.
- Period comparison (4b-i): month = this calendar month so far vs the whole previous month; 3/6/12 months = last N months to today vs the N months before. Windows differ in length for "month", and totals are plain sums, so the UI says they are not per-week rates.
- Plateau (4b-i): 6 weeks (constant `PLATEAU_WEEKS`, no setting yet), best e1RM in the window does not beat the earlier best, needs an earlier best and at least 3 sessions in the window. Uses the formula chosen on the profile.
- Strength score (4b-ii): score = 100 × Σ(weight × e1RM ÷ bodyweight) ÷ Σ(weight) over chosen lifts that have an e1RM in the last 12 weeks (best, chosen formula). Lifts with no recent e1RM are left out and the card says what share of the lift weights was used. Bodyweight = latest weigh-in on or before today. Lifts, weights and thresholds live on the profile (`strengthScoreLifts`, `strengthStandards`); no schema change.
- Tiers (4b-ii): thresholds are minimum e1RM ÷ bodyweight per tier; the tier is the highest met, "Below beginner" under the first. Starting templates (squat, bench, deadlift, press, row) are rough multiples chosen by the app for a trained adult male, not from a dataset and not percentiles; copied into the profile when a lift is added, picked by movement pattern, fully editable. Thresholds must be positive and non-decreasing.
- Bodyweight entry: until Milestone 5 builds the bodyweight log, the score card has a small "Log today" box that writes a normal `BodyMetric` (kind bodyweight) in the profile unit, so M5 inherits the data.
- Body map (4b-ii): schematic regions, not anatomical. Shade = the selected week's weighted sets relative to the busiest muscle (steps at >0, >25%, >50%, >75%); the rule is printed under the map. Same data and week picker as the weekly list.
- Balance checks (4b-ii): hard sets by exercise movement pattern over the last 4 weeks (constant). Push = horizontal + vertical push; pull = horizontal + vertical pull; squat side = squat + lunge; hinge = hinge. Flagged when one side has more than 1.5× the other's sets (exactly 1.5 is fine). Core, isolation, carry and other patterns are ignored. Imported exercises count only once their pattern is set in the library.

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
- [x] CSV tokenizer + Strong CSV parser (pure) + tests: dumbbell, bodyweight, kg, lb, duration/distance
- [x] Exercise matching (name + aliases), create-or-map plan, dumbbell convention (pure + tests)
- [x] Duplicate detection (pure + tests)
- [x] Import commit: ImportBatch + RawImportRow saved, re-apply conventions (repository + tests)
- [x] Import preview UI: file pick, per-exercise map/create, dumbbell toggle, duplicate count, confirm

## Milestone 2b — Export & restore
- [x] Full JSON export + `docs/export-format.md`
- [x] Strong-format CSV export
- [x] JSON restore (replace or merge) with preview

## Milestone 2c — Safety net
- [x] Weekly backup reminder (Files/iCloud via share sheet / download)
- [x] Undo last action
- [x] Trash: soft-deleted workouts, 30-day purge, restore

## Milestone 3 — Routines & programs (split 3a–3d)
### 3a — Routines
- [x] Routine CRUD with target sets/reps/rest/RPE; start workout from routine
### 3b — Programs
- [x] Program → weeks → planned sessions; versioning with change reason
### 3c — Planned vs completed, history
- [x] Planned vs completed linking and view
- [x] History calendar + training-day heatmap
### 3d — Progression
- [x] Progression rules: double progression, % e1RM, RPE target → suggested weight (pure + tests)

## Milestone 4 — Strength analytics (split 4a/4b)
### 4a — e1RM, PRs, per-exercise view
- [x] e1RM formulas (Epley, Brzycki, Lombardi, Mayhew, O'Conner, Wathan) + tests
- [x] PR detection: rep-range, e1RM, volume + PR timeline (tests)
- [x] Per-exercise e1RM chart with formula picker (Strength tab)
### 4b-i — Volume, comparisons, plateau
- [x] Weekly hard sets per muscle (primary 1.0, secondary 0.5 — shown)
- [x] Period comparisons (month vs last; 3/6/12 months)
### 4b-ii — Score, tiers, map, balance
- [x] Strength score: chosen lifts + weights, formula displayed
- [x] Strength tiers from editable standards tables
- [x] Muscle body map (front/back SVG)
- [x] Plateau detection (N weeks without e1RM gain)
- [x] Balance checks: push:pull, squat:hinge

## Milestone 5 — Body & athletic (split 5a/5b/5c)
- [x] 5a: Bodyweight log + smoothed trend (EWMA, shown)
- [x] 5b: Fitness tests + results history (pull-up max, push-ups, 1.5 mi, 40 yd, broad, vertical, custom)
- [x] 5c-i: Conditioning sessions (time/distance sets)
- [x] 5c-ii: Progress photos (IndexedDB blobs, device only)

## Milestone 6 — Claude coach (split 6a/6b)
- [x] 6a: Training profile editor
- [x] 6a: Copy-for-Claude summary (date range, PRs, volume, program, profile)
- [x] 6b: `docs/program-schema.md` + JSON schema
- [x] 6b: Paste Claude program → validate → diff preview → approve → save (AiDecision logged)

## Milestone 7 — Gamification (split 7a/7b)
- [x] 7a: Achievement definitions + evaluator (pure + tests) and repository sync
- [x] 7b: Weekly streaks vs planned days
- [x] 7b: Achievements list + new-achievement cards (Home, summary)
- [x] 7b: PR celebration (post-set highlight, summary, Home)

## Milestone 8 — Polish & install
- [x] 8a: Empty states (audited, already present), onboarding (units, bodyweight, goals), Settings screen, in-app confirm dialogs
- [x] 8b: Accessibility pass (labels, contrast, reduced motion, focus)
- [x] 8b: Performance (bundle split done; virtualization not needed at 30 rows)
- [x] 8b: Install-to-home-screen help; offline check; real app icons
- [~] 8b: Cloudflare Pages deploy (config + `docs/deploy.md` ready; connecting the repo is a user step)

## Milestone 9 — Strength tab redesign (user request: cluttered, wants a per-exercise page, score/tiers feel off)
Design (agreed in chat 2026-11-25):
- Strength tab becomes ONE clean list of lifts: name, current e1RM, change over the last 4 weeks, last done date; search box; most recent first. Nothing else on the main screen.
- Tapping a lift opens a per-exercise page (Strong/Hevy style): header with current best e1RM and PR badges; ONE chart (e1RM over time, range pills, formula named under it); segments below: History (workout by workout, working sets only, warm-ups folded), Records (best weight at 1, 3, 5, 8, 10 reps, with dates), Volume (per workout).
- Score, tiers, body map, weekly sets per muscle, balance and plateau move off the main screen into an opt-in "Insights" screen (button in the header). Nothing is deleted. Score and tiers are hidden until the user sets them up. Note for the session: the tier thresholds are the app's own rough multiples, not from a dataset; say so on the screen and ask the user what felt off before changing the formulas.
- Tasks:
  - [x] 9a (done 2026-11-25): information-diet pass modelled on Strong/Hevy. Home = status line + History (short rows, tap to open). Train = Start workout + Program + Routines only. Strength = plain list of lifts (e1RM, 4-week change) with Insights behind a button. Progress = 4-row menu, each on its own screen. Coach = one Copy button, preview hidden. Library, Import and Backup moved to Settings.
  - [x] 9b (done 2026-11-25): per-exercise page: header with current e1RM and PR badges; ONE chart; segments History (workout by workout, working sets only), Records (best weight at 1, 3, 5, 8, 10 reps with dates), Volume (per workout). Trim `ExerciseStrength.tsx` to match.
- Suggested model: Sonnet, medium effort. Verify on the phone: chart readability at iPhone width.

## Milestone 10 — Claude connector + cloud sync (user chose this over an in-app chat; free, uses the Claude Pro plan)
Goal: the Claude app on the phone (and web) can read ALL Forge data live and propose changes; the user approves in Forge. Principle 4 holds: Claude only proposes.
Architecture (to confirm at the start of 10a):
- One Cloudflare Worker + D1 database in the user's own free Cloudflare account. Rows already carry `id`, `updatedAt`, `deletedAt`, so sync is push/pull of rows changed since a cursor; conflict rule last-writer-wins by `updatedAt` (same rule as merge restore). Photos stay on the device. One user, no accounts: a long secret token.
- The same Worker exposes a remote MCP server. Read tools: profile, workouts by date range, exercise history, PRs, weekly sets per muscle, active program, the Copy-for-Claude summary. Write tool: `propose_program` (and notes) that only creates an `AiDecision` with status `proposed`; the app pulls it and shows it in Coach for approval with the existing diff and approve flow.
- The user adds the Worker URL in Claude → Settings → Connectors → Add custom connector. Check at the start that the Pro plan allows custom connectors and which auth the connector UI accepts (authless with an unguessable URL vs OAuth); decide and note it.
- Needs new dependencies (wrangler, an MCP SDK): ASK before adding. Deploy steps need the user's Cloudflare account; write `docs/connector.md`.
- Privacy: a copy of the training data lives in the user's own Cloudflare account. Say this plainly in the Settings screen.
- Tasks:
  - [x] 10a (done 2026-11-25): Worker + D1 schema, token auth, sync endpoints, tests (Vitest against the handler)
  - [x] 10b (done 2026-11-25): App sync layer behind the repository interface (push/pull, status in Settings, offline-safe queue, manual "Sync now")
  - [x] 10c (done 2026-11-25; untested against real Claude): MCP server on the Worker with read tools; docs/connector.md; user connects it in Claude
  - [x] 10d (done 2026-11-25; untested against real Claude): `propose_program` write tool + Coach "Proposals from Claude" inbox using the existing approve flow
- Suggested model: Opus, high effort (auth, sync conflicts). Prerequisite: the Cloudflare Pages deploy (docs/deploy.md) is done.

## Milestone 11 — Today (the reason to open the app)
- [x] 11a (done): Home shows "Next up": the active program's next session (or the last routine) with weights already filled from the progression rules; one tap starts it. Pure helper picks the next session (reuse `domain/program.ts` `nextSession`).
- [x] 11b (done): During logging, a "Suggested" chip per exercise (already computed by progression) that fills the set in one tap; show why in one short line.
- [x] 11c (done, milestone 11 complete): Auto warm-up builder: from the first working weight, add warm-up sets (bar, 50%, 70%, 85%) with the plate calculator; pure function with tests.
- Model: Sonnet, medium.

## Milestone 12 — Plain-language insights (tell the user what to do)
- [x] 12a (done): Rules that turn the existing analytics into one-sentence notes with the numbers behind them (plateau, low pulling volume, imbalance, missed sessions). Pure + tests; shown as at most 3 notes on Home under the status line, dismissible.
- [x] 12b (done, milestone 12 complete): Weekly review text the user can send to Claude (or Claude pulls via the connector once M10 exists).
- Model: Opus for the rules, medium effort.

## Milestone 13 — Fitness-test countdown (service academy and rugby)
- [x] 13a (done): Test date + target per test (pull-ups, push-ups, 1.5 mile, 40 yd, broad jump, vertical) on the Progress > Fitness tests screen; shows current best, target, gap and days left. No invented standards: targets are typed by the user (from the academy's published standards).
- [x] 13b (done, milestone 13 complete): Proposal text for Claude includes the countdown so plans aim at the test.
- Model: Sonnet, medium.

## Milestone 14 — Issue burn-down (small fixes, one sitting each)
- [x] Imported exercises get muscles and movement pattern: infer from the matched library exercise or the name, with a bulk review screen (so they count in weekly sets and balance). (done as 14a inference + 14b review screen)
- [x] Edit a past workout's name and start/end time.
- [ ] Drag to reorder exercises (needs a dependency: ask first) or keep buttons.
- [x] Unsaved-draft protection in the routine, program and proposal editors.
- [ ] kg increments in the exercise form; units changes convert displayed set weights.
- [ ] Settings: plate and bar editor; keyboard focus trap in dialogs.
- [ ] Library classification review (e.g. Olympic lifts classed as conditioning): fix the mapper heuristics and add tests for the most common lifts.
- [ ] Trash entry for routines; undo for deleting weigh-ins and tests.
- Model: Sonnet, medium. Milestone 14 is a list of independent fixes: do one or two per session and tick them off (no further ID split needed).

## Ideas backlog (not scheduled)
Auto warm-up ramp from the working weight; weekly volume landmarks per muscle; program library (5/3/1, linear progression) as importable JSON; muscle recovery view; Claude "what should I train today" proposals (after M10); beep-test and interval timers; light nutrition (daily calories and protein plus bodyweight trend to estimate maintenance); detailed set-by-set export for Claude (superseded by M10).

## Known issues
- Countdown (13): one date per test (no separate battery dates); the connector's MCP tools do not return targets or dates yet; not seen in a browser or on a phone. The date input is the native picker.
- Exercise page (9b): typechecked, unit-tested and built, not opened in a browser or on an iPhone; check chart readability and the three segments at phone width. Records use exact rep counts only (a heavier 5 does not fill the 3-rep row). Badges show PRs from the last 30 days (constant). The Insights tier thresholds remain the app's own rough multiples: ask the user what felt off before changing them.
- Settings (8a) has no plate or bar editor; those stay in Coach → Training profile (Settings points there). The pair-total toggle also remains on the Train home.
- Editing a past workout's times does not move its sets' completion times, and it does not re-evaluate a linked planned session or PR history beyond normal recompute.
- Superset rounds are not enforced or visually sequenced; supersets only affect when the rest timer starts.
- `navigator.vibrate` is unsupported on iOS Safari. The rest alarm is now an audio file (see Decisions) that should sound while locked, but this relies on iOS letting a home-screen app keep playing audio in the background: UNVERIFIED on a device. If it fails, the fallback is web push from the later Cloudflare Worker. While the alarm audio plays, iOS may show Forge on the lock screen's now-playing card.
- Rest alarm: the silent switch mutes the default 'Sound' mode (use 'Loud' to override, which pauses music). A rest of 5 minutes builds a ~2.4 MB in-memory file per set; fine for a phone.
- Reorder is up/down buttons, not drag-and-drop (no new dependency).
- Finish drops unticked sets and exercises with no completed sets (documented behaviour); undo is available for 20 s after finishing (snackbar) or from Backup.
- Discard soft-deletes the workout (goes to the Trash screen under Backup).
- History list is read-only and loads the latest 30 workouts without virtualization.
- Keypad ± for weight converts the exercise increment into the set's unit; weights are shown in the set's stored unit, not the profile unit, if they differ.
- Library pattern/loadModel/rest values are name-based heuristics (`exerciseMapper.ts`); some library entries will be mis-classified. Fix per exercise in the editor; bump `LIBRARY_VERSION` only to add missing exercises (existing ones are never overwritten).
- Exercise library JSON (~790 KB, 150 KB gzip) is a lazy chunk, precached by the service worker; The size warning limit is raised to 800 kB for it and the Recharts chunk.
- Increment unit is lb-only in the exercise form; kg increments come with the units setting.
- Library exercises (not just custom) can be deleted from the editor; deleted ones are not re-seeded.
- App icons are a simple red F on near-black (generated from `public/icon.svg`); swap for a designed mark whenever wanted.
- Google Fonts load from the network on first visit and are runtime-cached; if first load is offline the system fallback fonts are used.
- Strong import has only been exercised with synthetic CSVs (tests + a browser run); the real Strong export's column names, distance units and date format are unverified. Try the user's real file first and report anything that looks off.
- Strong import: a whole import can be undone only while it is the latest undo entry; "Past imports" only changes dumbbell conventions, and re-applying overwrites any manual edits to those sets.
- Imported exercises (14): muscles and pattern are guesses from the library or the name (see Settings → Review exercise muscles); names with no rule stay empty and need the library editor. Rules are English keywords only; the review screen cannot edit a single suggestion (untick it and use the library). The review lists only exercises with NO primary muscle, so a wrong earlier guess is not listed again.
- Strong import holds the whole file in memory and builds all entities in one transaction; fine for a few years of data, not tested on tens of thousands of sets.
- Preview lists every distinct exercise name with native selects; a long list (hundreds) has no search or bulk-apply.
- Backup and restore were tested with fake-indexeddb and headless Chromium (download path); the iPhone share-sheet path is untested on a device.
- Whole backup is built in memory as one JSON string; fine for years of personal data. Restore does not validate field shapes beyond `id` per row.
- Replace restore does not touch progress photos, undo or meta; after replace the library seed re-runs idempotently by `sourceRef`.
- Strong CSV export drops per-set notes (Forge has none) and writes the exercise note on every row.
- Undo only reverts the latest recorded action and assumes nothing later depends on it: undoing an import after logging workouts with its new exercises can leave dangling references (the stack order normally prevents it).
- Undoing "Finished workout" reopens it as the active workout; undoing "Saved workout edits" restores dropped sets but does not reopen the editor.
- Replace-restore has no undo and no automatic pre-restore snapshot; take a backup first.
- Trash and undo screens live under Train → Backup & restore; there is no top-level Settings screen yet.
- Reminder snackbar/undo bar and trash were verified in headless Chromium only; not on a device.
- Routine editor: weight targets are a plain number in the exercise's increment unit (lb shown for all); percent-of-e1RM targets exist in the type but have no editor until 3d. Progression rule on a routine exercise is not editable yet (3d).
- Routine editor uses up/down buttons, no drag and drop. Leaving via Cancel asks first, but switching tabs with the bottom bar still drops the draft (the editor unmounts).
- Trashed routines can only be restored through the undo bar (20 s / Backup screen latest entry); no Trash screen entry.
- Routine screens were verified in headless Chromium only (create, start); not on a device.
- Restoring a deleted workout from the Trash screen does not relink its planned session (undo does).
- Planned sessions are linked only when the workout was started from the session; a workout logged freehand is never matched to a plan automatically.
- Calendar loads every finished workout into memory (fine for years of personal data); heatmap and calendar were checked in headless Chromium only.
- Program editor keeps its draft in memory only (Cancel asks first; switching tabs loses it); no drag and drop; scheduled dates per session are stored but have no editor.
- Program screens were verified in headless Chromium only (create, activate, version, start); not on a device.
- Progression uses only the last session, so one bad day lowers or holds the next suggestion; a best-recent e1RM option can come with M4. `TargetSet.percentE1rm` (per-set percent) exists in the type but has no editor and is not applied; use the exercise-level % e1RM rule instead.
- The RPE rule treats RPE as reps in reserve = 10 − RPE and Epley beyond ~12 reps is unreliable; suggestions are estimates.
- Strength tab (4a) was typechecked, unit-tested and built but not opened in a browser or on a device; check the chart on the phone.
- PR timeline and e1RM series recompute from all of an exercise's sets on open (fine for personal data). The Strength list shows only exercises with completed non-warm-up sets, including ones with no usable load (they show an explanation).
- Rep PRs only track the listed rep counts (7, 9, 11 are skipped) and are not credited across counts (a heavier 5 does not set a 3-rep PR).
- Progress tab volume panel and Strength plateau flags were typechecked, unit-tested and built, not opened in a browser or on a device. The plateau window (6 weeks) and minimum sessions (3) are not editable yet.
- Strength tab loads every set into memory twice (list + plateau data); fine for personal data.
- Strength score setup and weigh-in entry were checked only for display (headless Chromium, seeded data); the setup editor (add lift, edit thresholds) was typechecked but not clicked through. Weigh-ins can now be edited or deleted on the Progress tab (5a).
- Tier templates assume a trained adult male; the profile `sex` field is not used yet. Edit thresholds per lift.
- Bodyweight lifts (pull-ups, dips) have no template; add them with any template and edit the thresholds.
- Balance thresholds (1.5×) and window (4 weeks) are fixed constants with no setting; unilateral and carry patterns are not counted. The balance cards were typechecked and unit-tested, and the page rendered without errors, but I only inspected the body map visually.
- Body map regions are tap-sized shapes with hover/long-press titles only; tapping a region does nothing yet.
- Bodyweight panel (5a): weight-only (no body fat or measurements yet, though `BodyMetricKind` has them); range pills are 30 d / 90 d / 1 yr / All; the date field is the browser's native picker (not tested on iPhone Safari). Deleting a weigh-in has no undo.
- Fitness tests (5b): no undo for deleting results or tests; a custom test's measure cannot be changed after creation; built-in tests cannot be renamed; results are not linked to conditioning workouts yet (`workoutId` unused); the date input is the native picker (not tested on iPhone Safari).
- Conditioning (5c-i): the Panel was unit- and store-tested but not seen with real data in a browser (it only renders once a session exists). The exercise picker in a conditioning session is the normal one (not filtered to time/distance exercises); library cardio entries are classed as time/distance by name heuristics. Fitness test results are not linked to conditioning sessions. Rounds/intervals have no structure beyond one set per effort; rest between efforts uses the exercise's default rest timer.
- Photos (5c-ii): not tested on a real iPhone (camera capture, HEIC pickup, share/save). iOS Safari can evict site data for PWAs that are not installed to the Home Screen; photos are in no backup, so the panel tells the user to keep copies. `clearAllData` (used in restore-replace tests) wipes photos too, but app restore never calls it. Full-size blobs are decoded for thumbnails (no separate thumbnail), fine for dozens of photos. The viewer is a simple overlay: no swipe between photos, no pinch zoom beyond the browser default.
- Coach (6a): the summary and the profile editor were checked in headless Chromium only (not on an iPhone). Copy uses `navigator.clipboard`; if blocked, the text is selected and the user is told to copy by hand. The summary has no conditioning detail, readiness or photo info, and no per-session workout log; it is a rolled-up view, so Claude cannot see individual sets. Profile editor has no unsaved-changes prompt. The weight and length units and the e1RM formula are still not editable in any Settings screen.
- Coach (6b): checked in headless Chromium only. Diff compares position, so inserting a session early in a week shows as changes to every later day. Per-set RPE/rest edits other than targets and rest are not diffed (notes, supersets, progression rule changes are saved but not shown in the diff). A proposal cannot create exercises; add them in the library first. There is no rollback screen for AI versions yet (the old version is archived and kept; `AiDecision.status` `rolledBack` is unused). No unsaved-text protection: pasted text is lost if you leave the tab's screen state.
- Achievements (7a): no UI yet. `sync()` re-reads all training data each call (fine for personal data). A lift milestone needs the lift on the strength-score list; imported history is credited on first sync, all unseen.
- Gamification (7b): Home and the summary were checked in headless Chromium with an empty database only (cards with data are covered by repository tests, not seen visually). Home shows the 6 newest achievements with no full list screen. Live PR check re-reads the exercise's history on each tick (fine for personal data). The summary sheet is lost if the app is closed before tapping Done (achievements still appear on Home as New).
- Settings/onboarding (8a): checked in headless Chromium only. Changing the weight unit does not convert existing sets or bodyweight entries (they keep their unit; analytics convert). The theme choice is stored both in localStorage and on the profile. Onboarding pre-fills the user's default goals; the confirm dialog has no focus trap. Increment unit in the exercise form is still lb-only.
- Polish (8b): offline was tested in headless Chromium only; not on an iPhone. Not yet deployed to Cloudflare. A keyboard focus trap in dialogs and a full screen-reader pass (VoiceOver) were not done; contrast was computed for the tokens, not measured on every screen. History still loads 30 rows with no virtualization.
- Sync (10a): worker tests need Node 22+ (node:sqlite). The Worker's CORS is open (`*`); safe because auth is a bearer token, no cookies. A push with one bad row is rejected whole. The D1 SQL is tested on SQLite, not on real D1.
- Sync (10b): sync runs only on tap (no background or on-open sync yet). Rows written by restore or import keep old `updatedAt`, so use Re-upload everything after them. Rows pulled from the server are re-sent once (server skips them as ties). Hard deletes (trash purge) and the undo of a hard delete do not propagate. A second device would receive duplicate seeded library exercises (different IDs); only one device is supported for now. Token is stored unencrypted in IndexedDB.
- Connector (10c): token is in the URL path, so it can show up in logs or browser history; rotate with `wrangler secret put SYNC_TOKEN`. Every tool call reads whole tables from D1 (fine for one user, would need limits for big data). Dates and weeks are UTC, not the user's time zone. Hard-set weekly totals come from the app's domain code, so they match the app only if the Worker and app stay in sync. Photos, fitness tests and conditioning are not exposed yet.
- Proposals (10d): editing the pasted text of an inbox proposal detaches it from its inbox row, so approving the edited text logs a new decision and the original stays pending until rejected. Proposals reach the app only on sync (tap Check for proposals); no push notification. The program format prompt is part of the tool description, so it is sent to Claude on every connection.
- Next up (11a): the card shows only on Home and needs an active program or a finished routine workout; a program session with no exercises shows an empty list. The preview is computed when Home opens and after a unit change or workout end, not live.
- Suggested chip (11b): only exercises started from a routine or program with a progression rule get a chip; exercises added by hand do not. Workouts started before this change keep the old note text and have no chip.
- Warm-ups (11c): percentages and reps are fixed (not editable per user yet); only barbell exercises with the total load model get the button; the button hides once any warm-up set exists.
