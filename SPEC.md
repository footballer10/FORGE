# Forge — Product Spec

Forge is a personal strength-training tracker for one user, built iPhone first. It aims to log workouts as fast as Strong, go deeper on strength analytics than Liftoff, and let Claude act as a coach using real training data. It costs nothing to run: no subscriptions, ads, paid APIs or required accounts.

## User
- High school rugby fullback preparing for the spring season.
- Trains full-body; most sessions include squat, bench, deadlift and pull-ups.
- Equipment: rec center (squat racks, benches, dumbbells to ~120 lb, cables, dip station, leg press, no trap bar) and a home pull-up bar.
- Goals: overall strength, tackling power, speed and conditioning, service-academy fitness tests.
- History: older Strong CSV export to import. Dumbbells in Strong were logged as the **pair total**. Current Fullback Strength artifact data is not imported (fresh start).

## Product principles
1. **Logging speed comes first.** Completing a set that matches the plan takes one tap; the app works one-handed between sets.
2. **My data is mine.** Offline-first; everything exportable in documented formats.
3. **Analytics are honest.** Every score shows its formula and inputs. No invented percentiles.
4. **Claude never changes training silently.** It proposes; the user approves.
5. **Foundation before features.** Data model, load conventions and import must be right first.

## Tech stack
- PWA: React + TypeScript + Vite
- Storage: Dexie.js over IndexedDB, behind a repository layer
- State: Zustand · Styling: Tailwind CSS · Charts: Recharts
- Offline + install: vite-plugin-pwa · Tests: Vitest
- Hosting: **Cloudflare Pages** (chosen so the later sync Worker, D1 database and Claude MCP connector live on the same account and domain)
- Fully offline after first load. Installed to the iPhone home screen it should feel native: safe areas, standalone display, no rubber-band scrolling, no zoom on input focus.
- Screen Wake Lock API during workouts; Vibration API where available.
- Default unit lb. Every weight is stored with its unit and converted only for display.
- Weeks start on **Monday** (ISO) for streaks, weekly volume and planned vs completed.

## Look and feel
- Dark by default (near-black surfaces, off-white text); light theme available.
- One accent, `#d7261e`, used only for the primary action, PRs and progress. Everything else neutral.
- Display face: Barlow Condensed for numbers and headings; Inter for body text.
- Large tabular numerals for weight and reps.
- Tap targets ≥ 44 pt; primary actions in the bottom third of the screen.
- Bottom tab bar: **Home, Train, Strength, Progress, Nutrition**. Claude is reached through the Claude app (connector); the approval inbox and connection live in Settings → Claude.
- Custom numeric keypad for weight/reps, with +/- steps matching the exercise's increment.
- Motion is brief and purposeful (set complete, PR).
- Gamification is subtle: achievements, weekly streaks and PR celebrations appear on Home and the post-workout summary, never on the logging screen.

## Data model
Implemented in `src/domain/types.ts`. All entities carry `id`, `createdAt`, `updatedAt` and optional `deletedAt` (soft delete, sync-ready).

- **Exercise**: name, aliases[], equipment, primary/secondary muscles, movement pattern (squat, hinge, horizontalPush, verticalPush, horizontalPull, verticalPull, carry, core, conditioning, other), unilateral, default rest, weight increment, loadModel (`total | perImplement | bodyweightPlusAdded | assisted | timeDistance | repsOnly`), source (`library | custom | import`), sticky note.
- **Workout** (performed session) → **WorkoutExercise** (order, superset group, notes) → **SetEntry** (type, weight, unit, reps, rpe, rir, durationSec, distanceM, completedAt).
- **Routine** (template) with target sets, reps, rest, RPE.
- **Program** → **ProgramWeek** → **PlannedSession**, linked to Workouts for planned vs completed. Programs carry a version number and a reason for each change.
- **BodyMetric**; **FitnessTest** and **TestResult**; **ProgressPhoto**.
- **Profile**: goals, sport, position, training phase, equipment profiles, constraints, display preferences.
- **ImportBatch** and **RawImportRow**: original rows kept unchanged beside normalized records so a convention fix can be re-applied.
- **Achievement**; **AiDecision** (date, summary, reason, program version); **ReadinessCheckIn** (later phase).

### Load rules
- `perImplement` stores one dumbbell's weight. Analytics never double it. An optional display setting can show the pair total.
- `bodyweightPlusAdded`: effective load = bodyweight on that date + added load.
- `assisted`: effective load = bodyweight on that date − assistance.
- Warm-up sets are excluded from PRs, volume and all analytics.
- Strong import: dumbbell exercises default to halving the pair total; overridable per exercise in the preview.

## Version 1 scope (build order)

### M0 Foundation
Scaffold, data model, repository layer, tests, design tokens, app shell with five tabs.

### M1 Workout logging
Fast set entry prefilled from the last session; one tap to complete; optional RPE/RIR; set types (warm-up, working, drop, failure, AMRAP); timestamp-based auto rest timer with per-exercise defaults; screen wake lock; supersets and circuits (timer runs after the round); sticky exercise notes and session notes; reorder/swap/add mid-workout; edit or duplicate past workouts; crash-safe (every set saved instantly, resume on reopen); plate calculator; exercise library seeded from free-exercise-db (public domain); load model per exercise; custom exercises and aliases.

### M2 Import, export & safety
Offline-first, no account; Strong CSV import (preview, exercise matching, dumbbell fixes, duplicate checks, original rows kept); full JSON export (documented); Strong-format CSV export; weekly backup reminder and one-tap restore; undo; trash with 30-day recovery.

### M3 Routines & programs
Routines/templates; multi-week programs with planned vs completed; calendar and heatmap; progression rules (double progression, % of e1RM, RPE targets).

### M4 Strength analytics
e1RM charts with selectable formula; rep-range, e1RM and volume PRs and a PR timeline; weekly hard sets per muscle; period comparisons; strength score (per lift, muscle, overall; user-chosen lifts and weights; formula shown); strength tiers from editable bodyweight-relative standards; muscle body map; plateau detection; push:pull and squat:hinge balance.

### M5 Body & athletic
Bodyweight trend with smoothing; fitness tests (pull-up max, push-ups, 1.5-mile, 40 yd, broad and vertical jump, custom); conditioning sessions by time/distance; on-device progress photos.

### M6 Claude coach
Copy-for-Claude summary; training profile included in every export; paste Claude's JSON program, preview, approve; documented program schema.

### M7 Gamification
Achievements; weekly streaks (planned days per week, no daily pressure); PR celebrations.

### M8 Polish & install
Empty states, onboarding, performance, accessibility, install help, offline check.

## Later phases (data model ready, not built)
Lock-screen timer / Live Activity; Apple Watch app; gym equipment profiles; training phases and deloads; test battery presets (CFA-style, rugby); body measurements; readiness check-in; nutrition; XP and levels; monthly challenges; Claude connector (remote MCP on a Cloudflare Worker); proposal tools; decision log and program versions with rollback; weekly report template; Hevy and generic CSV import; cloud sync (Cloudflare free tier).

## Decisions log
| Date | Decision |
|---|---|
| 2026-11-24 | Host on Cloudflare Pages (`base: '/'`). |
| 2026-11-24 | Week starts Monday. |
| 2026-11-24 | Strong dumbbells were pair totals → import halves by default. |
| 2026-11-24 | No Fullback Strength import. |
| 2026-11-24 | Tab navigation via Zustand state (no router dependency). |
| 2026-11-25 | Coach tab removed: talking to Claude happens in the Claude app via the connector; the proposal inbox, connection and profile moved to Settings → Claude. Nutrition took the fifth tab. |
| 2026-11-25 | Academy tests: USAFA PFT and AFT preset (user's academy). No scoring tables are bundled; the user types targets. |
| 2026-11-25 | Drag-to-reorder added with @dnd-kit (user approved new dependencies as needed). |
| 2026-11-25 | Apple Watch: needs a native watchOS app; not buildable in this environment (see PROGRESS). |
| 2026-11-24 | Tailwind v3 (stable config); `fake-indexeddb` dev-only for repository tests. |
