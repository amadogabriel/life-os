# Life OS

A personal weekly operating system: a time-blocked plan for the week ahead and a
permanent bullet-journal record of what actually happened each day.

## Language

The central distinction: a **Plan** is a mutable intention for the future; a
**Record** is an immutable fact about the past. These are separate concerns and
live in separate tables. The record is log-primary — the daily log is the single
source of truth for the past.

### Plan (the future)

**Template**:
The reusable, undated weekday plan — `days` plus their `blocks`. There is one
template per weekday (Monday–Sunday). Editing a template only affects future
days; it never rewrites the past.
_Avoid_: schedule, routine

**Block**:
A single time-blocked item in a weekday Template (e.g. "Math — focused hour").
Belongs to a Bucket (or is Unassigned), and carries a duration and anchoring for
re-flow. A Block is a plan, not a record.
_Avoid_: event, task (those are Log Entry kinds)

**Re-flow**:
The layout rule that lays a day's Blocks in `position` order without overlap; an
**anchored** Block holds its pinned start time, an unanchored one chains off the
previous Block's end. Re-flow never shrinks a Block: when an anchored Block's
pinned start can't be honored, the Block is pushed later and marked in
**conflict**.

**Gap**:
The empty span between one Block's end and the next Block's start. Derived, not
stored — a Gap is the absence of a Block, never an entity. Because unanchored
Blocks chain, a Gap can only exist in front of an anchored Block (or between the
day's start and an anchored first Block).
_Avoid_: open block, open time (and "open" is a retired category name)

**Planner**:
The dated-weeks view (formerly "Week"). Plan-side in both directions: past days
show the plan as it was frozen — rendered at each entry's stored freeze-time
start, **not** re-flowed (ADR-0002 amendment) — future days show the Template
**projected** onto real dates plus any Day Plan forks and dated one-offs. A
Planner-wide **Focus** toggle can hide uncounted (Life) items. Paging it writes
nothing. Clicking into the cell for the live current day opens the Today
(tab)'s plan editor (Log Entries only — no Bucket/Bucket Task management);
every other day (Template weekday, fork, or projected day) opens the Day
editor instead, which is the only place Buckets and Bucket Tasks are created
or edited.
_Avoid_: week view, calendar

**Today (tab)**:
The pageable live/record editor for any day up to and including today (#25) —
distinct from Planner's dated *plan* weeks and the Log tab's flat journal. An
Earlier/Today/Later pager (never into the future) re-anchors every card —
plan, Todos, Brain dump, Habits, header stats, Week-at-a-glance — to the
viewed day. On the actual current day it's the live, editable timeline
(unchanged); on a past day it's that day's Daily Log through the frozen-past
lens with full state (`frozenPastEntries`) — dropped/migrated entries stay
visible and actionable — opened for structural editing (retime, resize,
reorder, add, delete) with every entry pinned at its stored start until
explicitly un-anchored, so opening it never silently reflows history.
_Avoid_: today's plan (the card within it, not the tab)

**Day Plan (fork)**:
A dated, whole-day copy of the weekday Template, created when the user edits one
specific future date's plan ("just this Tuesday"). That date stops following the
Template entirely. Plan-side only — `materialize_day` still turns it into the
record. _Avoid_: exception, override (those suggest per-block granularity)

**Dated one-off**:
A plan item for one specific date riding on top of the day's projection — a Log
Entry with a future `on_date` and a `start_min` (e.g. a sprint task scheduled
onto next Wednesday). Does not fork the day. _Avoid_: block (it never enters the
Template)

### Taxonomy (what things belong to)

**Bucket**:
The user-defined lane that everything belongs to — Blocks, Habits, and Log
Entries alike. A Bucket has a name, a color, and a **counted** flag. It is the
unit the stats and weekly review group by, and the palette a day is designed
from. _Avoid_: category (legacy — a retired hardcoded enum, now derived
plumbing only)

**Bucket Task**:
A reusable palette item inside a Bucket ("Sentence mining"), placed onto a day
to create a Block. May be vague (a mere name) or carry Traces. Vague and traced
tasks coexist in the same Bucket.
_Avoid_: chip (that's the widget, not the concept), todo

**Trace**:
A Bucket Task's link to a Habit and/or a Project (optionally a Sprint) — the two
are independent and may coexist on one task. Placing a traced task pre-links the
Block: checking it off logs the Habit, and its materialized Log Entry accrues to
the Project. When a trace's target is deleted, the task **degrades to vague** —
the chip survives, the link dies; a trace whose target is finished is stale and
shows it.

**Counted**:
A Bucket's flag saying its hours belong on the scoreboard. Uncounted Buckets
(e.g. Life: sleep, meals, commute) never materialize into the record and never
accrue hours.

**Unassigned**:
A Block or Log Entry belonging to no Bucket — the "pick later" state, rendered
gray. Replaces the old `open` category.

**Deep**:
Per Bucket Task / Block / Log Entry flag marking deep work (▲). Deep work is
rendered visually boosted over shallow; the weekly scoreboard counts deep
sessions.
_Avoid_: focus, hard

### Record (the past)

**Daily Log**:
The dated record of a single day — the `log_entries` for one `on_date`. The
permanent record; it is never rewritten by later Template edits.
_Avoid_: journal, diary

**Log Entry**:
One line in a Daily Log. Has a **kind** (task `•` / event `○` / note `—`), a
**state** (open, done, migrated, scheduled, dropped), and an optional
**signifier** (priority, inspiration). The atomic unit of the Record.
_Avoid_: todo, item

**Materialize**:
The daily freeze (at local midnight, Asia/Manila) that copies each planned Block
for that weekday into the Daily Log as an **open** task Log Entry, capturing the
Template as it stood that day. This is what turns an intention into a record.
_Avoid_: generate, instantiate

**Migration ritual**:
Reviewing a day's still-open Log Entries and deciding each one's fate: keep
(done), migrate forward (`>`), schedule (`<`), or drop. The habit that keeps the
Record honest.
_Avoid_: rollover, carry-over

**on_date**:
The user's **local** day (Asia/Manila, UTC+8) that a Log Entry belongs to. Never
UTC `current_date`.

### Projects (turning notes into runs of work)

**Project**:
A user-defined initiative that Sprints run under. Has a status and its own
list-order `position`. Deleting a Project deletes its Sprints; the Project's
Log Entries return to the Inbox.
_Avoid_: initiative, epic

**Sprint**:
A time-boxed run of work under a Project, arranged left→right in the order the
user will run them (its own `position` — distinct from a Log Entry's
day-timeline `position` or a card's **Board position**). Has a status.
_Avoid_: milestone, iteration

**Inbox** (Projects sense):
The open task/note Log Entries with no Project assigned yet — the
bullet-journal capture queue awaiting triage into a Project. It is **global**:
the same Inbox appears on the Projects index page and on every Project's
Board, since triaging an Inbox item is what gives it a Project.
_Avoid_: unsorted, backlog (Backlog is Project-scoped; Inbox is not)

**Backlog**:
A Project's open Log Entries that have been accepted into the Project but not
yet assigned to a Sprint.

**Board**:
The per-Project view: Inbox, Backlog, then one column per Sprint (left→right
by Sprint `position`), each holding its Log Entries. Cards move between
columns by drag-and-drop; within a column they're ordered by **Board
position**.
_Avoid_: board view, kanban

**Board position**:
The order of Log Entry cards within one Board column (Inbox, a Project's
Backlog, or a Sprint). A distinct concept from a Log Entry's day-timeline
`position` — reordering a Board column never touches day-timeline order, and
vice versa.
