# life-os — weekly operating system

A personal weekly planner: time-blocked week grid with anchor/re-flow scheduling,
daily checklist with a completion ring, habits with streaks, stats, fortnight
reports, and a drag-and-drop "design a day" composer.

**Stack:** React + Vite + TypeScript + Tailwind · TanStack Query · Supabase
(Postgres + auth + RLS) · Vitest + Playwright · GitHub Actions. Static hosting,
$0 at personal scale. See [PLAN.md](PLAN.md) for the architecture rationale and
[SETUP.md](SETUP.md) for setup, data import, and deployment.

```bash
cp .env.example .env   # fill in your Supabase URL + anon key
npm install
npm run dev
```

## Layout

```
src/
  features/          # one folder per view (today, week, habits, stats, report, design, account, auth)
  lib/planner.ts     # pure domain logic: block re-flow, streaks, stats, reports (unit-tested)
  lib/queries/       # all data access; UI never touches supabase directly
  lib/supabase.ts    # typed client (database.types.ts mirrors the schema)
supabase/migrations/ # normalized schema + RLS policies
scripts/             # one-time legacy jsonb → normalized-tables import
legacy/index.html    # the original single-file mockup (reference)
```

## Data model

Each block, habit, log entry, bucket, and design item is its own row keyed to
`auth.users` with row-level security — editing on two devices no longer clobbers
whole-planner state. Completion logs (`block_logs`, `habit_logs`) are keyed by
`(id, date)`, so streaks and the fortnight report survive schema edits.
