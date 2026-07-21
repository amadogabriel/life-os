# Life OS — Claude Code operator manual

How to *use* the planner through Claude Code (add todos, move blocks, check
things off, organize the brain dump, run a Project Board) instead of opening
the web UI. The app has no backend: the UI and Claude are both just clients
writing to the same Supabase Postgres. Anything written here shows up in the
app on its next refetch (window focus / ~15 s).

> Copy this file to the folder you run Claude Code from (e.g. as `CLAUDE.md`)
> or point Claude at it at the start of a session. In this repo there's a
> ready-made subagent that embodies this manual: `.claude/agents/operator.md`
> — say "use the operator agent to …" and it handles the lookup, recipes, and
> guardrails itself.

For the domain vocabulary this manual assumes (Template / Block / Bucket /
Trace / Log Entry / Materialize / Project / Sprint / Board / Board position…),
see `CONTEXT.md` in this repo — it's the canonical glossary.

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
- **Two independent ordering sequences on `log_entries`** — never conflate them:
  - `position` (0-based): order within one **day's timeline** (`on_date`-scoped).
    Shared by the Today tab's plan and the Log tab.
  - `board_position` (0-based): order within one **Board column** — Inbox
    (global), a Project's Backlog, or a Sprint — scoped by `(project_id,
    sprint_id)`. Reordering a Board column never touches `position`, and
    scheduling a task onto a day never touches `board_position`.
  After inserting/moving in either sequence, renumber the affected
  day/column so its values stay 0..n-1.
- **Re-flow (the core scheduling rule)**: a day's blocks lay out in `position`
  order. An **anchored** block (`anchored = true`) starts at
  `max(start_min, previous block's end)` — it holds its pinned time, leaving a
  gap if the day is ahead, and gets pushed down (never overlapped) if the day
  runs long. An unanchored block starts exactly at the previous block's end;
  its stored `start_min` is ignored except for the first block. Blocks never
  overlap. A **Gap** (open span between blocks) is derived, never stored — it
  can only exist in front of an anchored block, so "move this block to 14:00
  leaving the morning open" means `anchored = true, start_min = 840` (in the
  UI, dragging a block's top edge does exactly this — it pins the block).
  `log_entries` on today's live timeline follow the same rule via
  their own `start_min`/`anchored`; a *past* day's entries render at their
  frozen `start_min` with **no re-flow** (ADR-0002 amendment) — never
  recompute a past day's layout.
- **Template vs Day Plan fork vs dated one-off** — three different ways a
  plan item can exist:
  - A **Template** block (`blocks.on_date is null`) recurs every week on its
    `dow`. Editing it affects all future instances of that weekday.
  - A **Day Plan (fork)** is one future date's own dated copy of the Template
    (`blocks.on_date = <date>`, plus a marker row in `forked_days`). That date
    stops following the Template entirely — even if every dated block is
    later deleted, the `forked_days` marker keeps it a blank fork rather than
    silently falling back to the Template. Usually created client-side
    ("just this Tuesday"); rarely something to hand-build via SQL.
  - A **dated one-off** is a `log_entries` row with a future `on_date` and a
    `start_min`, riding on top of that day's projection without forking it
    (e.g. scheduling a Sprint task onto next Wednesday).
- **Materialize** (`materialize_day(uid, date)`, a Postgres function — call
  it, don't hand-roll the freeze): at local midnight (or on demand/backfill)
  it copies a date's Blocks — its Day Plan fork if one exists, else the
  weekday Template — into the Daily Log as **open** task `log_entries`,
  stamping `bucket_id`/`project_id`/`sprint_id`/`dur_min`/`deep` and a
  resolve()-computed `start_min`/`anchored`. It freezes a block whose Bucket
  is `counted` (or has no bucket — Unassigned still materializes) **or which is
  a Container** (a Container always materializes, even from an uncounted bucket
  — migration 0023); an uncounted, non-Container bucket (e.g. Life:
  sleep/meals/commute) never freezes. It is
  idempotent and add-only (`on conflict do nothing` on `(user_id, block_id,
  on_date)`) — safe to call repeatedly, including for missed past days.
- **Buckets are the taxonomy.** Blocks, Habits, and Log Entries all belong to
  a Bucket (or are Unassigned = no bucket, gray). A Bucket has a `color` and a
  **`counted`** flag: uncounted buckets (Life) never materialize and never hit
  the scoreboard — **except a Container always materializes** even from an
  uncounted bucket (its hours still never hit the scoreboard). `cat` still
  exists on every row but is **derived plumbing
  only** — stamped from the chosen bucket on write; never invent a new `cat`
  value or treat `cat` as authoritative for color/counting.
- **Traces** (`habit_id` / `project_id` / `sprint_id` on `blocks` and
  `bucket_tasks`; `habit_id`/`project_id`/`sprint_id` also on `log_entries`):
  independent, coexisting links from a task/block to a Habit and/or a Project
  (optionally narrowed to a Sprint). Placing a traced Bucket Task pre-links
  the Block; materializing stamps the project/sprint trace onto the frozen
  entry so a check-off accrues to the Project. The habit trace is **not**
  copied onto a block-sourced entry — it rides on the Block, and checking it
  off is what mirrors the habit log. A block-less entry (rapid-logged via the
  Today editor's palette) can carry its own `habit_id` directly — checking
  *that* entry off mirrors the habit the same way (`entryHabitMirror`).
  Deleting a trace's target degrades the holder to vague (link dies, task
  survives).
- **Deep work**: `deep = true` on a block/bucket task/log entry renders it
  saturated in the UI; shallow is muted. Deep is per-item, *not* per bucket.
- **Categories** (`cat` text): `work`, `devops`, `thesis`, `math`, `chin`
  (Chinese), `exercise`, `wqu`, `life`, `open` (= Unassigned placeholder).
  Colors come from the Bucket (`buckets.color`, '' = default palette by `cat`).
- **Dates / "today"**: `on_date` (and other date columns) is the user's
  **local** day (Asia/Manila, UTC+8). The DB clock is UTC, so **never use SQL
  `current_date`** for "today" — in the 00:00–08:00 PHT window it is a day
  behind. Always use `(now() at time zone 'Asia/Manila')::date`.

## Tables

| table | what it is | key columns |
|---|---|---|
| `days` | the 7 weekday templates | `dow` PK-ish, `name`, `loc` (Office/WFH/Open) |
| `blocks` | Template AND Day Plan (fork) blocks — `on_date` tells them apart | `dow`, `on_date` (null = Template), `position`, `cat`, `title`, `detail`, `start_min`, `dur_min`, `anchored`, `deep`, `bucket_id`, `habit_id`, `project_id`, `sprint_id` |
| `forked_days` | the explicit "this date is a Day Plan fork" marker | `on_date` — presence (not dated-block presence) is what makes a date forked |
| `block_logs` | block checked off on a date (frozen snapshot) — legacy pre-log-primary table, superseded by `log_entries.block_id`-linked rows | `block_id`, `done_on`, `title`, `cat`, `dur_min`, `deep` |
| `log_entries` | **the record** — bullet-journal daily log AND materialized commitments AND today's live timeline AND Project Board cards, all one table | `on_date`, `kind` (task/event/note), `state` (open/done/migrated/scheduled/dropped), `signifier`, `text`, `cat`, `bucket_id`, `habit_id`, `project_id`, `sprint_id`, `block_id`, `migrated_to`, `position`, `board_position`, `dur_min`, `deep`, `start_min`, `anchored` |
| `habits` | habit definitions | `name`, `cat`, `bucket_id`, `days smallint[]` (target dows), `position` |
| `habit_logs` | habit logged on a date | `habit_id`, `done_on` |
| `buckets` | the taxonomy — task-palette groups everything else belongs to | `name`, `cat`, `color` ('' = default), `counted`, `position`; `deep` column exists but is unused/legacy — ignore |
| `bucket_tasks` | reusable tasks inside a bucket, may carry Traces | `bucket_id`, `name`, `deep`, `position`, `habit_id`, `project_id`, `sprint_id` |
| `projects` | a user-defined initiative Sprints run under | `name`, `goal`, `status` (planning/active/done/archived), `position` |
| `sprints` | a time-boxed run of work under a Project | `project_id`, `name`, `goal`, `status` (planning/active/done), `start_date`, `end_date`, `position` (left→right run order) |
| `profiles` | per-user singletons | `notes`, `design_wake_min` |
| `todos` | legacy dashboard todos — superseded by `log_entries` tasks (`kind='task', start_min is null`), kept as backup | `text`, `done`, `position` |
| `dump_items` | legacy brain-dump inbox — superseded by `log_entries` notes, kept as backup | `text`, `created_at` |
| `design_items` | legacy "design a day" scratch — UI removed, ignore | |
| `planners` | legacy jsonb blob, kept as a pre-migration backup — read-only | |

## Recipes

**Today's plan** (check `forked_days` first — a forked date reads its own
dated blocks, not the weekday Template; compute starts with the re-flow rule
in your head, or read `log_entries` if today is already materialized):

```sql
select exists (select 1 from forked_days
  where user_id = '<USER_ID>' and on_date = (now() at time zone 'Asia/Manila')::date);

-- if false (not forked):
select position, title, cat, start_min, dur_min, anchored, deep
from blocks where dow = <today's dow> and on_date is null order by position;
-- if true (forked):
select position, title, cat, start_min, dur_min, anchored, deep
from blocks where on_date = (now() at time zone 'Asia/Manila')::date order by position;
```

**Materialize a day** (freeze its Blocks — Day Plan fork if one exists, else
the weekday Template — into open `log_entries`; safe to call repeatedly,
including for missed past days):

```sql
select materialize_day('<USER_ID>'::uuid, (now() at time zone 'Asia/Manila')::date);
-- or an explicit past date: select materialize_day('<USER_ID>'::uuid, '2026-07-15'::date);
```

**Add a todo** (an undated backlog item — shows on the Today tab's Todos card
regardless of which day is viewed; `todos` above is legacy, don't use it):

```sql
insert into log_entries (user_id, on_date, kind, state, text, cat, position)
values ('<USER_ID>', (now() at time zone 'Asia/Manila')::date, 'task', 'open',
        'File the leave request', 'open',
        coalesce((select max(position)+1 from log_entries
                  where user_id='<USER_ID>' and on_date=(now() at time zone 'Asia/Manila')::date), 0));
-- start_min stays null (that's what keeps it in "Todos", not the timeline).
```

**Check off a block / habit for today**: prefer marking the block's
materialized `log_entries` row `done` (see "Mark a task done" below) — that's
the log-primary path the app itself uses. `block_logs` is a legacy snapshot
table, superseded but still readable for old history:

```sql
-- habit_logs has no snapshot, just a done-date row:
insert into habit_logs (user_id, habit_id, done_on)
values ('<USER_ID>', '<habit id>', (now() at time zone 'Asia/Manila')::date) on conflict do nothing;
```

**Add a block to a day** (append, then it flows after the last block; use
`on_date` instead of leaving it null to add to one date's Day Plan fork
instead of the weekday Template):

```sql
insert into blocks (user_id, dow, position, cat, title, detail, start_min, dur_min, anchored, deep)
values ('<USER_ID>', 2, (select count(*) from blocks where dow = 2 and on_date is null), 'work',
        'GenAI writeup', '', 0, 60, false, true);
```

To pin it at a time instead: `anchored = true, start_min = <minutes>`,
and set `position` so the day stays roughly time-sorted.

**Move a block to another day**: update its `dow` and `position` (Template),
or `on_date` (a Day Plan fork), then renumber both days' positions by their
current order.

**Change how long something is**: update `dur_min` (multiples of 30;
everything unanchored below it re-flows automatically).

**Buckets & Bucket Tasks**:

```sql
select id, name, cat, color, counted from buckets where user_id = '<USER_ID>' order by position;
select id, bucket_id, name, deep, habit_id, project_id, sprint_id from bucket_tasks
where bucket_id in (select id from buckets where user_id = '<USER_ID>') order by position;
```

Toggling a task's `deep` in `bucket_tasks` only affects *future* placements —
existing blocks/entries keep the `deep` they were placed/materialized with.
Set `habit_id`/`project_id`/`sprint_id` on a `bucket_tasks` row to pre-trace
it; placing that task creates a Block carrying the same trace.

### The log (bullet journal)

`log_entries` is the dated record. The Today tab's todos and brain-dump, the
Log tab, and the Project Board all write here. Bullets: task `•`, event `○`,
note `—`; states open / done `✕` / migrated `›` / scheduled `‹` / dropped.
Use local dates.

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
If the entry carries its own `habit_id` (a habit-traced chip placed via the
Today editor, not a block-sourced entry — `block_id is null`), also mirror
the habit log to match:

```sql
insert into habit_logs (user_id, habit_id, done_on)
select user_id, habit_id, on_date from log_entries where id = '<entry id>' and state = 'done'
on conflict do nothing;
-- (delete the habit_logs row instead if un-marking done)
```

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

**Weekly accomplishments** (what got *done*, not hours — from frozen,
counted-bucket `log_entries` that carry a `dur_min`, the modern replacement
for the legacy `block_logs` snapshot):

```sql
select le.cat, count(*) filter (where le.deep) as deep_sessions, count(*) as blocks,
       array_agg(distinct le.text) as what
from log_entries le
left join buckets bk on bk.id = le.bucket_id
where le.user_id = '<USER_ID>'
  and le.state = 'done' and le.dur_min is not null
  and coalesce(bk.counted, true)
  and le.on_date >= (now() at time zone 'Asia/Manila')::date - 13
group by le.cat order by blocks desc;
```

**Organize the brain dump** (the intended workflow): notes now live in
`log_entries` (`kind = 'note'`).

1. `select id, text, on_date from log_entries where kind='note' and state='open' order by on_date;`
2. Propose a split: actionable → a `task` entry (or patch the row to
   `kind='task'`); schedule-shaped → a block on a day; reference prose →
   `profiles.notes` or a memo file.
3. **Only after Jon confirms**, write the outputs and delete/patch the notes.

### Projects, Sprints & the Board

Tasks flow: **Inbox** (open task/note `log_entries` with `project_id is
null` — global, the bullet-journal capture queue) → triaged into a
**Project's Backlog** (`project_id` set, `sprint_id is null`) → assigned to a
**Sprint** (`sprint_id` set; only `status='active'` sprints surface in the
app's "Sprint work" list) → scheduled onto a day as a dated one-off
(`on_date`/`start_min` set — leaves the Sprint-work list, lives on its day).

The **Board** is the per-Project view: Inbox, Backlog, then one column per
Sprint (left→right by `sprints.position`). In the app cards move between
columns and reorder within one by drag-and-drop; from SQL, the same effect is
two things — a field update, and a `board_position` renumber of the
**destination column only** (its own `(project_id, sprint_id)` scope; the
source column is left alone):

**File an Inbox item into a Project's Backlog** (also promotes a note to a
task, same as the app's drag-to-file):

```sql
update log_entries
set project_id = '<project id>', sprint_id = null,
    kind = case when kind = 'note' then 'task' else kind end,
    board_position = coalesce((select max(board_position) + 1 from log_entries
                                where project_id = '<project id>' and sprint_id is null), 0)
where id = '<entry id>';
```

**Move a card from Backlog into a Sprint** (same shape; note→task promotion
applies here too, since it's still "processing into the project"):

```sql
update log_entries
set project_id = '<project id>', sprint_id = '<sprint id>',
    kind = case when kind = 'note' then 'task' else kind end,
    board_position = coalesce((select max(board_position) + 1 from log_entries
                                where sprint_id = '<sprint id>'), 0)
where id = '<entry id>';
```

**Move a card back to Inbox** (un-assign — no promotion, since it's leaving
the project rather than entering it):

```sql
update log_entries
set project_id = null, sprint_id = null,
    board_position = coalesce((select max(board_position) + 1 from log_entries
                                where project_id is null and kind in ('task','note') and state = 'open'), 0)
where id = '<entry id>';
```

**Reorder cards within one column** (e.g. a Sprint): renumber that column's
`board_position` 0..n-1 in the desired order — same "read the group, renumber
0..n-1" shape as day-timeline `position` renumbering, just scoped by
`(project_id, sprint_id)` instead of `on_date`. Deleting a Project deletes its
Sprints and returns its Log Entries to the Inbox (`project_id`/`sprint_id`
both null); deleting a Sprint only clears `sprint_id` (task stays in that
Project, drops to its Backlog).

### Container fill rules — Sprint work → Agenda

Canonical Containers (`blocks.container=true`) and their home Project (Work-bucket Containers
only exist Mon–Thu, `dow` 0–3):

| Container | Bucket | Home Project |
|---|---|---|
| Engineering and Development | Work | DevOps, Procurement Verifier |
| Study | Work | Learn Measure Theory |
| Busy Work | Work | Work Admin (first claim); Thesis/Measure Theory may spill in only when Work Admin's active Sprint is empty that day |
| Parallel Computing | JUIST | De-slop Thesis Software |
| Life OS | Personal Projects | Life OS |
| Clear activities | WQU | School Admin |

Meetings and every Chinese-bucket block stay Concrete on purpose — never fill Sprint tasks
into them.

Default agent-mode fill: one Agenda item per Container per day, priority-signifier-first then
Board position, from the home Project's active Sprint — never blocks manually adding more in
the app. An explicit "layout Sprint X" request instead lets the agent judge task size from its
text (no stored difficulty field) and spread/stack across days accordingly. Measure Theory
fills set `habit_id` directly on that Agenda item, never on the Study/Busy Work `bucket_tasks`
row (which would wrongly trace every session to the math Habit).

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
`log_entries` queries above), then `notion-create-pages` with
parent `data_source_id bf493db5-...` and properties
`{Name:'<YYYY-MM-DD · Weekday>', 'date:Day:start': <date>, 'Tasks done', 'Deep sessions', 'Blocks', 'Habits'}`,
accomplishments as page content. Idempotency: `notion-search` the Journal data
source for the date first and `notion-update-page` instead of duplicating.

**Intake from Notion** (the other direction): pull rows/pages and
`insert into log_entries (user_id, on_date, kind, text, cat) values (…)`.

For unattended sync, add a scheduled agent (cron) that mirrors yesterday each
morning — ask Claude to "schedule a daily Notion journal sync".

**Weekly stats**: hours per bucket = sum of `dur_min` grouped by `bucket_id`
(or `cat` for pre-Bucket history), among `counted` buckets only. Habit
streaks count consecutive on-target days (a habit only targets its `days`
array) backwards from today.

## Guardrails

- Confirm before deleting anything the user didn't just create in-session.
- Keep `planners` untouched (backup). Ignore `design_items` and `buckets.deep`.
- Don't edit `updated_at` manually; don't invent new `cat` values — new
  colors come from bucket `color`, not new cats.
- Never conflate `position` (day-timeline order) with `board_position` (Board
  column order) — they're deliberately separate fields (ADR-0005) so
  reordering one view can't silently reorder the other.
- Times past midnight (start + dur > 1440) are allowed and wrap in display.
- Prefer calling `materialize_day(uid, date)` over hand-rolling a freeze —
  it's the single source of truth for the resolve()/counted-gate/trace-stamp
  logic and stays correct as that logic evolves.
