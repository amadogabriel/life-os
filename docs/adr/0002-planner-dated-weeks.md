# Planner shows dated weeks: projection, whole-day forks, dated one-offs

The Week view rendered the undated weekday **Template** — no dates, no past, no
future. For a real planner the user needs to page backward ("what did I plan
that week") and forward ("what am I planning"), schedule sprint work onto
specific future days, and give one particular date a custom plan. We decided:
**the Planner (renamed from "Week") shows dated calendar weeks, and it is
plan-side in both directions.** The record never enters it — the Journal/Log
shows what actually happened.

- **Past weeks** render the plan as it stood: each day's frozen, materialized
  `log_entries` (which capture the plan at freeze time), read-only. Days never
  materialized are blank.
- **Future weeks are computed, not stored**: the weekday Template projected
  onto real dates. Paging writes nothing.
- **Editing a projected future day asks on first edit** — calendar-style:
  "Just this ⟨date⟩" **forks the whole day** into a dated Day Plan (that date
  stops following the Template entirely); "Every ⟨weekday⟩" edits the Template.
  Once forked, further edits go to the fork silently.
- **Scheduling a sprint task onto a date creates a dated one-off** — a plan
  item riding on top of that day (a log entry with a future `on_date` +
  `start_min`, the shape `0013` built for today). It does **not** fork the
  day, it is editable in its day's Planner column, and it replaces the old
  "▸ block" action, which had a real bug: it inserted into the weekday
  Template, so a one-off task would recur every week.
- **Declutter**: a sprint task with a day picked leaves the Sprint work card
  entirely; it lives on its day in the Planner. The card's M–S day picker
  gains ‹ › week-pager arrows to reach future weeks.
- **Materialization** at local midnight freezes a forked date from its Day
  Plan, an unforked date from the Template; dated one-offs are already log
  entries and need no copying.

## Considered options

- **Materialized week instances** (paging forward copies the Template into
  stored dated blocks). Rejected: paging must write nothing; the Planner is a
  view of the plan, not a generator of records.
- **Per-block dated exceptions** (override one block for one date; the rest of
  the day keeps following the Template). Rejected by the user in favor of the
  whole-day fork: "this day is custom now" is easier to reason about than a
  day that is half-Template, half-exception — accepting that a forked day no
  longer receives Template improvements.
- **Past weeks show the record**. Rejected: the Planner answers "what did I
  plan"; the Journal answers "what did I do". Same data store (frozen
  `log_entries`), different lens — the Planner shows times/titles, not
  done-states.

## Relation to ADR-0001

ADR-0001 rejected "materialize a day-instance" — but that rejection was about
the **record**: dated editable rows must not own the past. The Day Plan fork
is **plan-side only**: it exists for a future date, and it is still
`materialize_day` that turns it into the record when the date arrives. The
log stays the single source of truth for the past; the fork is just a
per-date plan the Template no longer speaks for.

## Consequences

- New plan-side storage for forked days (a dated Day Plan holding its own
  blocks), plus a rule in `materialize_day`: fork wins over Template.
- `resolve()` re-flow runs over whatever a day's plan is — Template
  projection, fork, or either merged with dated one-offs.
- A forked day silently stops tracking rhythm edits; the UI should mark
  forked days so this is visible.
- "▸ block" (Template insert from a sprint task) is retired.
- The Planner header names the visible week (e.g. "Week of Jul 20–26") and
  the explainer caption goes away; the view is renamed Planner everywhere.

## Amendment (2026-07-18): the frozen-past lens renders at stored times, no re-flow

Shipping revealed a rendering bug. The Planner's past columns ran each frozen
day's Log Entries back through `resolve()` — the live-timeline re-flow — which
discards every entry's stored `start_min` and re-chains them in `position`
order. A materialized day's entries are **not** in position=time order and most
are unanchored, so this collapsed the real clock layout into one contiguous
stack that overflowed past midnight: past days looked nothing like what was
planned.

Decision: the **frozen-past lens renders each entry at its stored `start_min`**,
sorted by clock time, with **no `resolve()` re-flow**. This matches migration
`0013`'s stated intent ("past days: position-ordered, no re-flow") — the frozen
rows already hold the freeze-time resolved start; the column simply honors it.
Today / projection / fork keep `resolve()`; they are live, editable chains.

- **Placeholders are dropped.** A frozen entry with a blank title or an explicit
  zero duration is a half-built Template block that froze empty (filled in
  later) — noise, not a plan item. A titled null-duration entry renders at the
  30-min default.
- **Collisions are flagged, not reflowed.** Two frozen items overlapping in time
  (an anchored block pinned inside another's span; a dated one-off dropped over a
  block) render at their true times; the later one gets the `conflict` tint. No
  side-by-side splitting.
- **Focus (counted-only)** — a Planner-wide toggle, default off, hides uncounted
  items (Life: sleep/commute/meals, and Unassigned) across all columns via
  `isCounted`, so a week can show just the counted work and the time axis shrinks
  to those hours.

A one-off operator re-sync repaired the project's two founding days
(`2026-07-15`, `2026-07-16`), whose frozen rows predated a complete Template (Thu
had 5 blank placeholders). Matched block-rows were updated **in place** to the
current Wed/Thu Template's title/cat/dur/deep/anchored + recomputed `start_min`,
preserving `state` and hand-added entries — no deletes, no re-materialize.
