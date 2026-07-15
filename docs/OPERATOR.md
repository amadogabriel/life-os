# Life OS — Claude Code operator manual

How to *use* the planner through Claude Code (add todos, move blocks, check
things off, organize the brain dump) instead of opening the web UI. The app
has no backend: the UI and Claude are both just clients writing to the same
Supabase Postgres. Anything written here shows up in the app on its next
refetch (window focus / ~15 s).

> Copy this file to the folder you run Claude Code from (e.g. as `CLAUDE.md`)
> or point Claude at it at the start of a session.

## Setup (once per machine)

```
claude mcp add --transport http supabase "https://mcp.supabase.com/mcp?project_ref=wzmhasemthrlagdsigbl"
```

Then `/mcp` → authenticate (Supabase OAuth). Use `execute_sql` for data
operations. **Never run DDL ad hoc** — schema changes belong in
`supabase/migrations/` in the repo, applied via `apply_migration`.

## The one user

MCP SQL runs with elevated access (RLS does not apply, `auth.uid()` is null),
so **every insert must supply `user_id` explicitly** and reads should filter
by it out of habit. Look it up once at the start of a session and substitute
it for `<USER_ID>` in the recipes below:

```sql
select user_id from profiles limit 1;
```

## Conventions

- **Weekdays**: `dow` smallint, **0 = Monday … 6 = Sunday**.
- **Times**: minutes past midnight (`start_min`, `dur_min`, `design_wake_min`).
  05:00 = 300, 13:30 = 810. Durations snap to 30 min in the UI.
- **Ordering**: `position` (0-based) is the order within a day/list. After
  inserting/moving, renumber the affected day so positions stay 0..n-1.
- **Re-flow (the core scheduling rule)**: a day's blocks lay out in position
  order. An **anchored** block (`anchored = true`) starts at
  `max(start_min, previous block's end)` — it holds its pinned time, leaving a
  gap if the day is ahead, and gets pushed down (never overlapped) if the day
  runs long. An unanchored block starts exactly at the previous block's end;
  its stored `start_min` is ignored except for the first block. Blocks never
  overlap.
- **Deep work**: `deep = true` on a block/task renders it saturated in the UI;
  shallow is muted. Deep is per block/task, *not* per bucket ("Engineering
  deep block" is deep; "Meetings" in the same Work bucket is not).
- **Categories** (`cat` text): `work`, `devops`, `thesis`, `math`, `chin`
  (Chinese), `exercise`, `wqu`, `life`, `open` (= unassigned placeholder).
  Colors come from the bucket with that cat (`buckets.color`, '' = default
  palette).
- **Dates**: logs use `done_on date` (ISO `YYYY-MM-DD`, local).

## Tables

| table | what it is | key columns |
|---|---|---|
| `days` | the 7 weekday templates | `dow` PK-ish, `name`, `loc` (Office/WFH/Open) |
| `blocks` | scheduled blocks per weekday | `dow`, `position`, `cat`, `title`, `detail`, `start_min`, `dur_min`, `anchored`, `deep` |
| `block_logs` | block checked off on a date | `block_id`, `done_on` |
| `habits` | habit definitions | `name`, `cat`, `days smallint[]` (target dows), `position` |
| `habit_logs` | habit logged on a date | `habit_id`, `done_on` |
| `buckets` | task palette groups | `name`, `cat`, `color` ('' = default), `position` |
| `bucket_tasks` | reusable tasks inside a bucket | `bucket_id`, `name`, `deep`, `position` |
| `todos` | dashboard todo list | `text`, `done`, `position` |
| `dump_items` | brain-dump inbox | `text`, `created_at` |
| `profiles` | per-user singletons | `notes`, `design_wake_min` |
| `design_items` | legacy "design a day" scratch — UI removed, ignore | |
| `planners` | legacy jsonb blob, kept as a pre-migration backup — read-only | |

## Recipes

**Today's plan** (compute starts with the re-flow rule in your head or a
window query; simplest is to read in order and narrate):

```sql
select position, title, cat, start_min, dur_min, anchored, deep
from blocks where dow = <today's dow> order by position;
```

**Add a todo**

```sql
insert into todos (user_id, text, position)
values ('<USER_ID>', 'File the leave request', extract(epoch from now())::int);
```

**Check off a block / habit for today**

```sql
insert into block_logs (user_id, block_id, done_on)
values ('<USER_ID>', '<block id>', current_date)
on conflict do nothing;  -- habit_logs works the same with habit_id
```

**Add a block to a day** (append, then it flows after the last block):

```sql
insert into blocks (user_id, dow, position, cat, title, detail, start_min, dur_min, anchored, deep)
values ('<USER_ID>', 2, (select count(*) from blocks where dow = 2), 'work',
        'GenAI writeup', '', 0, 60, false, true);
```

To pin it at a time instead: `anchored = true, start_min = <minutes>`,
and set `position` so the day stays roughly time-sorted.

**Move a block to another day**: update its `dow` and `position`, then
renumber both days' positions by their current order.

**Change how long something is**: update `dur_min` (multiples of 30;
everything unanchored below it re-flows automatically).

**Edit bucket tasks**: rows in `bucket_tasks`; toggling `deep` there only
affects future adds (existing blocks keep their own `deep`).

**Organize the brain dump** (the intended workflow):

1. `select id, text, created_at from dump_items order by created_at;`
2. Propose a split: actionable → `todos`; schedule-shaped → a block on a day;
   reference/reminder prose → append to `profiles.notes` or a memo file.
3. **Only after Jon confirms**, write the outputs and delete the processed
   `dump_items` rows.

**Weekly stats**: hours per cat = sum of `dur_min` grouped by `cat`;
"counted" cats exclude `life`/`open`. Habit streaks count consecutive
on-target days (a habit only targets its `days` array) backwards from today.

## Guardrails

- Confirm before deleting anything the user didn't just create in-session.
- Keep `planners` untouched (backup). Ignore `design_items`.
- Don't edit `updated_at` manually; don't invent new `cat` values — new
  colors come from bucket `color`, not new cats.
- Times past midnight (start + dur > 1440) are allowed and wrap in display.
