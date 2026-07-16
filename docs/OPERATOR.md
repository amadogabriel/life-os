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
  shallow is muted. Deep is per block/task, *not* per bucket ("Math —
  focused hour" is deep; "Life OS" in the same Math bucket is not).
- **Categories** (`cat` text): `work`, `devops`, `thesis`, `math`, `chin`
  (Chinese), `exercise`, `wqu`, `life`, `open` (= unassigned placeholder).
  Colors come from the bucket with that cat (`buckets.color`, '' = default
  palette).
- **Dates / "today"**: `done_on` and `on_date` are the user's **local** day
  (Asia/Manila, UTC+8). The DB clock is UTC, so **never use SQL `current_date`**
  for "today" — in the 00:00–08:00 PHT window it is a day behind. Always use
  `(now() at time zone 'Asia/Manila')::date`.

## Tables

| table | what it is | key columns |
|---|---|---|
| `days` | the 7 weekday templates | `dow` PK-ish, `name`, `loc` (Office/WFH/Open) |
| `blocks` | scheduled blocks per weekday | `dow`, `position`, `cat`, `title`, `detail`, `start_min`, `dur_min`, `anchored`, `deep` |
| `block_logs` | block checked off on a date (frozen snapshot) | `block_id`, `done_on`, `title`, `cat`, `dur_min`, `deep` |
| `log_entries` | bullet-journal daily record | `on_date`, `kind` (task/event/note), `state` (open/done/migrated/scheduled/dropped), `signifier`, `text`, `cat`, `migrated_to`, `position` |
| `habits` | habit definitions | `name`, `cat`, `days smallint[]` (target dows), `position` |
| `habit_logs` | habit logged on a date | `habit_id`, `done_on` |
| `buckets` | task palette groups | `name`, `cat`, `color` ('' = default), `position` |
| `bucket_tasks` | reusable tasks inside a bucket | `bucket_id`, `name`, `deep`, `position` |
| `todos` | legacy dashboard todos — superseded by `log_entries` tasks, kept as backup | `text`, `done`, `position` |
| `dump_items` | legacy brain-dump inbox — superseded by `log_entries` notes, kept as backup | `text`, `created_at` |
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

**Check off a block / habit for today** (freeze the block's shape so the record
survives later template edits):

```sql
insert into block_logs (user_id, block_id, done_on, title, cat, dur_min, deep)
select '<USER_ID>', b.id, (now() at time zone 'Asia/Manila')::date, b.title, b.cat, b.dur_min, b.deep
from blocks b where b.id = '<block id>'
on conflict do nothing;
-- habit_logs is simpler — no snapshot:
--   insert into habit_logs (user_id, habit_id, done_on)
--   values ('<USER_ID>', '<habit id>', (now() at time zone 'Asia/Manila')::date) on conflict do nothing;
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

### The log (bullet journal)

`log_entries` is the dated record. The Today tab's todos and brain-dump, and the
Log tab, all write here. Bullets: task `•`, event `○`, note `—`; states
open / done `✕` / migrated `›` / scheduled `‹` / dropped. Use local dates.

**Rapid-log something today**

```sql
insert into log_entries (user_id, on_date, kind, text, cat)
values ('<USER_ID>', (now() at time zone 'Asia/Manila')::date, 'task', 'Email adviser', 'thesis');
-- kind: 'task' | 'event' | 'note'
```

**Read a day's log**

```sql
select position, kind, state, signifier, text, cat
from log_entries
where user_id = '<USER_ID>' and on_date = (now() at time zone 'Asia/Manila')::date
order by position;
```

**Mark a task done / dropped**: `update log_entries set state='done' where id='<id>';` (or `'dropped'`).

**Show the migration backlog** (open tasks stranded before today):

```sql
select on_date, text, cat, signifier from log_entries
where user_id = '<USER_ID>' and kind = 'task' and state = 'open'
  and on_date < (now() at time zone 'Asia/Manila')::date
order by on_date;
```

**Migration ritual — carry one task forward** (leaves a `›` record on the
original day, opens a fresh copy today; the whole ritual is scriptable, so it
can run unattended from a cron):

```sql
with src as (select * from log_entries where id = '<entry id>'),
ins as (
  insert into log_entries (user_id, on_date, kind, text, cat, signifier, position)
  select user_id, (now() at time zone 'Asia/Manila')::date, kind, text, cat, signifier,
         coalesce((select max(position) + 1 from log_entries l
                   where l.user_id = src.user_id
                     and l.on_date = (now() at time zone 'Asia/Manila')::date), 0)
  from src returning id
)
update log_entries set state = 'migrated', migrated_to = (select id from ins)
where id = '<entry id>';
```

**Carry *all* stale open tasks forward** — lightweight variant, safe from a cron
(bumps the date in place, no record-copy):

```sql
update log_entries set on_date = (now() at time zone 'Asia/Manila')::date
where user_id = '<USER_ID>' and kind = 'task' and state = 'open'
  and on_date < (now() at time zone 'Asia/Manila')::date;
```

**Weekly accomplishments** (what got *done*, not hours — from the frozen
`block_logs` snapshots):

```sql
select cat, count(*) filter (where deep) as deep_sessions, count(*) as blocks,
       array_agg(distinct title) as what
from block_logs
where user_id = '<USER_ID>'
  and done_on >= (now() at time zone 'Asia/Manila')::date - 13
  and cat not in ('life', 'open')
group by cat order by blocks desc;
```

**Organize the brain dump** (the intended workflow): notes now live in
`log_entries` (`kind = 'note'`).

1. `select id, text, on_date from log_entries where kind='note' and state='open' order by on_date;`
2. Propose a split: actionable → a `task` entry (or patch the row to
   `kind='task'`); schedule-shaped → a block on a day; reference prose →
   `profiles.notes` or a memo file.
3. **Only after Jon confirms**, write the outputs and delete/patch the notes.

### Notion — knowledge base + journal

Notion holds the **reference layer** (there's no app-side integration — Claude
mirrors via the Notion MCP, or the `notion-sync` edge function). Structure, in
workspace **Jul Jon General's Space**:

- **Life OS** home page — `39f078c7-026e-816b-8c2e-e65b8182dee1`
  - **Knowledge Base** — data source `collection://9f2dc71d-680c-45eb-9908-e64ab457b99e`,
    database id `c10bb0bb8d05493fb0611c0802e9d113` (props: `Name`, `Category`, `Source`, `Status`, `Captured`)
  - **Journal** — data source `collection://73edbef5-e514-4991-b175-c7b1fde374b7`,
    database id `9a6e9dc1dbfe4d53a378b8ecd74cb7cf` (props: `Name`, `Day`, `Tasks done`, `Deep sessions`, `Blocks`, `Habits`)

**File a note into the KB** (reference/knowledge captured in a brain-dump):
read open notes (`select id, text, on_date from log_entries where kind='note'
and state='open'`), then per note `notion-create-pages` with parent
`data_source_id 5cc15ad0-...` and properties
`{Name, Category, Source:'brain-dump', Status:'inbox', 'date:Captured:start': <on_date>}`.
After Jon confirms, clear the source note: `update log_entries set state='dropped' where id='<note id>';`

**Mirror a day to the Journal**: compute the numbers + accomplishments (the
`block_logs` / `log_entries` queries above), then `notion-create-pages` with
parent `data_source_id bf493db5-...` and properties
`{Name:'<YYYY-MM-DD · Weekday>', 'date:Day:start': <date>, 'Tasks done', 'Deep sessions', 'Blocks', 'Habits'}`,
accomplishments as page content. Idempotency: `notion-search` the Journal data
source for the date first and `notion-update-page` instead of duplicating.

**Intake from Notion** (the other direction): pull rows/pages and
`insert into log_entries (user_id, on_date, kind, text, cat) values (…)`.

For unattended sync, add a scheduled agent (cron) that mirrors yesterday each
morning — ask Claude to "schedule a daily Notion journal sync".

**Weekly stats**: hours per cat = sum of `dur_min` grouped by `cat`;
"counted" cats exclude `life`/`open`. Habit streaks count consecutive
on-target days (a habit only targets its `days` array) backwards from today.

## Guardrails

- Confirm before deleting anything the user didn't just create in-session.
- Keep `planners` untouched (backup). Ignore `design_items`.
- Don't edit `updated_at` manually; don't invent new `cat` values — new
  colors come from bucket `color`, not new cats.
- Times past midnight (start + dur > 1440) are allowed and wrap in display.
