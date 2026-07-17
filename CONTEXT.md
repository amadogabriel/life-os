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
Carries a category, a duration, and anchoring for re-flow. A Block is a plan, not
a record.
_Avoid_: event, task (those are Log Entry kinds)

**Re-flow**:
The layout rule that lays a day's Blocks in `position` order without overlap; an
**anchored** Block holds its pinned start time, an unanchored one chains off the
previous Block's end.

**Planner**:
The dated-weeks view (formerly "Week"). Plan-side in both directions: past days
show the plan as it was frozen, future days show the Template **projected** onto
real dates plus any Day Plan forks and dated one-offs. Paging it writes nothing.
_Avoid_: week view, calendar

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
