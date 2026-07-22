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
Belongs to a Bucket (or is Unassigned), and carries a concrete start time and a
duration (see **Layout**). A Block is a plan, not a record. A Block is either a **Container** or
**Concrete** (see below), independently of whether it is **Deep**.
_Avoid_: event, task (those are Log Entry kinds)

**Container**:
A Block flagged to hold an **Agenda** of tasks rather than being its own content
— a reserved chunk you fill per-day ("Engineering deep block", "Shallow batch").
Container-ness is a per-Block flag, orthogonal to **Deep**: a Container may be
deep (slot sprint work) or shallow (batch email/admin — Newport's shallow lane).
The Template holds the Container **empty**; specific tasks are only ever added at
the day layer, never baked into the Template.
_Avoid_: placeholder (informal shorthand for an *empty* Container, not the entity)

**Concrete**:
A Block that **is** its own content — nothing is filled into it (Lunch, Commute,
Workout). The opposite of a **Container**. Most Life/Routine Blocks are Concrete.

**Agenda**:
The ordered list of **Agenda items** inside a Container on one specific day.
Agenda items carry an **order** (a `position`), never a per-task duration — you
work them in priority order across the Container's single span; the Container is
not sub-divided into timed mini-blocks. To collapse every Container's Agenda to
just its header (deep and shallow alike), the Planner offers an **Agenda ↔
Chunks** view toggle — display-only, and composes with the **Focus** toggle.

**Agenda item**:
A **Log Entry** added to ("filled into") a Container's Agenda on a given day — a
**Dated one-off** parented to that Container (via `block_id`; see the collision
note under Materialize). Its source is irrelevant: a Sprint card, a Backlog or
Inbox card, or a freshly-typed ad-hoc one-off are all just Log Entries. Filling a
Container never forks the day — the item rides on top of the projection. An
unfinished Agenda item, in the **Migration ritual**, **un-fills** back to its
Sprint (drops date + parent, Project link intact) to be re-decided another day;
it never auto-carries into a future Container.
_Avoid_: slot, slotted task (`slot` is taken — it means a timeline landing
position: `scheduleSlot`, `reorderWithinSlots`), chip, todo

**Layout**:
Every Block holds its own **concrete start time** and duration; the timeline
renders each Block exactly where its stored start says, identically whether the
day is today or in the past. Blocks **never overlap** — the editor bounds every
resize by its neighbors (dragging a Block's edge stops at the adjacent Block; to
grow into a neighbor you explicitly shrink or move that neighbor). There is no
chaining, no anchoring, and no re-flow: a Block does not move because another
Block changed. Superseded the old anchored/unanchored **re-flow** model (see the
ADR superseding ADR-0002).
_Avoid_: re-flow, anchor, anchored, conflict (all retired).

**Gap**:
The empty span between one Block's end and the next Block's start — unclaimed
time. Derived, not stored — a Gap is the absence of a Block, never an entity.
Since every Block carries a concrete start, a Gap can open **anywhere** two
adjacent Blocks don't touch (no longer tied to anchoring).
_Avoid_: open block, open time (and "open" is a retired category name)

**Planner**:
The dated-weeks view (formerly "Week"). Plan-side in both directions: past days
show the plan as it was frozen — rendered at each entry's stored freeze-time
start (the same concrete-**Layout** rule as every other day) — future days show the Template
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
reorder, add, delete). Every entry renders at its own stored start (concrete
**Layout**), so opening a day never moves anything — the render is identical to
how the day looked live.
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
accrue hours — **except a Container always materializes** even from an uncounted
Bucket (a Container batches shallow work, which is exactly what an uncounted
Bucket like "Work" holds; it still accrues no counted hours). See migration 0023.

**Unassigned**:
A Block or Log Entry belonging to no Bucket — the "pick later" state, rendered
gray. Replaces the old `open` category.

**Deep**:
Per Bucket Task / Block / Log Entry flag marking deep work (▲). Deep work is
rendered visually boosted over shallow; the weekly scoreboard counts deep
sessions. Orthogonal to **Container**-ness: a deep session is a deep Block (a
deep Container is one session — the block owns the hours, the Agenda is just what
was attacked in it); a shallow Container never touches the deep scoreboard.
_Avoid_: focus, hard

**Depth/time lens**:
The weekly-review view that answers "how deep was my week, and where did the
hours go?" — hours + deep sessions grouped by **Bucket**, where each Block's
hours belong to the **Block's own Bucket** (a Math Agenda item finished inside a
Work Container still books a *Work* hour). The Block owns the time.

**Throughput lens**:
The complementary weekly-review view that answers "what project work actually
shipped?" — task **completions** grouped by **Project / Sprint / Bucket**. An
Agenda item's own Bucket/Project matters only here, on completion (that Math item
= a *Math* completion). Kept separate from the **Depth/time lens** precisely
because Agenda items have no duration to split hours by.

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
Template as it stood that day. A **Container** freezes into a **parent** Log
Entry with its **Agenda items** as **child** Log Entries under it; an empty
Container still freezes into a parent line (its reserved time survives). This is
what turns an intention into a record.
_Avoid_: generate, instantiate
_Note — `block_id` is overloaded_: on a Log Entry it has meant "materialized
**from** this Block" (1:1); it now *also* carries "Agenda item **under** this
Container" (N:1). The parent line and its children share the same `block_id`, so
they must be told apart by role, not by the column alone (mirrors the
`position` / **Board position** split — see ADR-0006).

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
