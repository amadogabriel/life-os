# Life OS → adapted bullet journal — build plan

Turns Life OS from a template-only planner into a Ryder-Carroll-style bullet
journal with a **permanent daily record** and an **accomplishment report**
(not an hours-logged report).

## Why
`days`/`blocks` are mutable weekday *templates*; the only dated data is a
check-off event (`block_logs`, `habit_logs`) pointing at a template by id. So
there is **no record of a finished day** — edit a template and history silently
rewrites. Hours are all the current Report can compute because a check-off is
all that was ever stored.

## Phases
1. **Schema** — `log_entries` (dated rapid-log record) + snapshot columns on
   `block_logs` so finished days freeze. Backfill `todos`/`dump_items`.
   (`0005_log_entries.sql`, `0006_block_log_snapshot.sql`)
2. **Log tab** — today's rapid log (task `•` / event `○` / note `—`, state
   cycling, signifiers) + a date-stepper archive of frozen days.
3. **Migration ritual** — review open tasks: keep-done / migrate `>` / schedule
   `<` / drop.
4. **Report rewrite** — "What you accomplished" (completed tasks+events, deep
   sessions, streaks, carried-forward, highlight); hours demoted.
5. **Operator + Notion** — MCP recipes for rapid-log/migrate/read-a-day; fix the
   `current_date`→`Asia/Manila` local-date bug; mirror the daily log to Notion.

## Conventions
- `on_date` is the user's **local** day (Asia/Manila), never UTC `current_date`.
- Old `todos`/`dump_items`/`planners` tables kept read-only as backup.
- Migrations applied additively; DDL only via `supabase/migrations/`.
