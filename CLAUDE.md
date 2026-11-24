# CLAUDE.md — Forge

Personal strength-training PWA, iPhone first, one user. Full product spec: `SPEC.md`. Task list and status: `PROGRESS.md`.

## Session ritual
1. Read this file and `PROGRESS.md`. Do not read the whole repo; open only files the current task needs.
2. Work one milestone (or one split part of it) per session, in small steps.
3. Commit after each working step so a usage limit never leaves things half-done.
4. End the session: `npm run test`, `npm run build`, update `PROGRESS.md` (done, next, known issues), commit, push.
5. If a milestone is too big, split it in `PROGRESS.md` first.

## Rules
- No new dependencies beyond the stack without asking the user.
- No subagents unless the user asks.
- Ask before hard-to-reverse decisions; otherwise pick a sensible default and note it in `PROGRESS.md` (Decisions).
- Claude never changes training silently: program changes are proposals the user approves.
- Analytics must show formula and inputs. No invented percentiles.

## Stack
React 18 + TypeScript + Vite · Dexie (IndexedDB) · Zustand · Tailwind CSS v3 · Recharts · vite-plugin-pwa · Vitest (+ fake-indexeddb in tests). Hosted on Cloudflare Pages (`base: '/'`).

## Commands
```
npm install
npm run dev        # dev server
npm run build      # typecheck + production build (+ service worker)
npm run preview    # serve the build
npm run test       # vitest run
npm run typecheck  # tsc --noEmit
```

## Folder layout
```
src/
  app/            AppShell, TabBar, ui store (current tab, theme)
  features/       one folder per tab/feature: home, train, strength, progress, coach
  components/     shared UI (Keypad, Button, ...)
  domain/         types.ts (all entities), pure functions: units, load, e1rm, prs, volume, import
                  *.test.ts next to the code
  db/             schema.ts (Dexie), repositories/ (the ONLY way screens touch storage)
  styles/         tokens.css (CSS variables, dark + light), index.css
public/           icons, manifest assets
```

## Conventions
- **Storage**: screens and stores import from `src/db/repositories`, never from Dexie directly. Keeps sync addable later.
- **IDs**: `crypto.randomUUID()` strings. Every entity has `createdAt`, `updatedAt` (ISO strings) and optional `deletedAt` (soft delete → trash).
- **Weights**: always `{ weight, unit }`; unit is `'lb' | 'kg'`. Convert only for display (`domain/units.ts`). Default lb.
- **Load models** (`domain/load.ts`):
  - `perImplement` stores ONE dumbbell. Analytics never double it; pair total is display-only.
  - `bodyweightPlusAdded` = bodyweight on that date + load; `assisted` = bodyweight − load.
  - `timeDistance` / `repsOnly` have no load for e1RM.
- **Warm-ups** are excluded from PRs, volume and analytics (`isAnalyticSet`).
- **Pure calculations** (e1RM, scores, PRs, volume, import conversion) live in `src/domain` as pure functions with unit tests. No Dexie or React imports there.
- **Strong import**: test dumbbell, bodyweight, kg and lb cases. Dumbbells default to halving (user logged pair totals). Keep raw rows in `RawImportRow`.
- **Weeks** start Monday.
- **Timers** are timestamp-based (store `endsAt`), never interval counters.
- **Crash safety**: persist every set change immediately through the repository.

## UI conventions
- Dark default; light via `data-theme="light"` on `<html>`. Colours come from CSS variables in `tokens.css`, exposed as Tailwind colours (`bg-surface`, `text-fg`, `text-muted`, `bg-accent`, ...).
- Accent `#d7261e` only for the primary action, PRs and progress.
- Fonts: `font-display` (Barlow Condensed) for numbers/headings, `font-sans` (Inter) for text. Use `tabular-nums` for weights/reps.
- Tap targets ≥ 44px (`min-h-tap`). Primary actions in the bottom third.
- Inputs ≥ 16px font (prevents iOS zoom). Respect `env(safe-area-inset-*)`.
- Motion short (≤ 250ms) and only for set complete / PR.
- Gamification never appears on the logging screen.

## Testing
- Vitest, `environment: node` for domain tests; repository tests import `fake-indexeddb/auto`.
- Name tests `*.test.ts` beside the module.

## Git
- Develop on the session branch given by the harness; commit small; push at session end.
