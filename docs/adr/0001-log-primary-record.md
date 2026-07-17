# Log-primary record: the Daily Log is the single source of truth for the past

The weekday **Template** (`days`/`blocks`) was doing two opposite jobs — a mutable
plan for the future *and*, via check-offs plus `0006` snapshots, the record of the
past — so editing a Template silently rewrote history. We split them: **Templates
plan the future only, and the Daily Log (`log_entries`) is the single source of
truth for the past.** A scheduled `materialize_day` freeze copies each day's
planned Blocks into the Daily Log as open task entries at local midnight; checking
a Block flips its entry `open → done` instead of writing a parallel `block_logs`
row. `block_logs` is retired to a read-only backup.

## Considered options

- **Keep Template-primary and patch the holes** (complete the `0006` snapshots).
  Rejected: keeps a mutable planning structure as the historical record and keeps
  the record fragmented across three dated stores.
- **Materialize a day-instance** (copy the Template into dated, editable rows that
  then own the day). Rejected: introduces "am I editing the day or the Template?"
  ambiguity and a parallel plan-snapshot store.
- **Log-primary (chosen).** One dated record; the check-off *becomes* a Log Entry.
  The natural end-state of the bullet-journal migration already underway.

## Consequences

- `block_logs` stops being written; it is backfilled once into `log_entries` and
  kept read-only. `habit_logs` stays as the separate streak store; the Block→Habit
  mirror moves onto the Log Entry state flip.
- Materialization must be scheduled (`pg_cron`, 16:00 UTC = 00:00 Asia/Manila) so
  unopened days still freeze from the correct-era Template; a client catch-up on
  app open is a best-effort backstop (it can only use the current Template for
  genuinely-missed days).
- `materialize_day(uid, date)` is the single implementation, called by both the
  cron and the client (RPC), so the logic is never duplicated across DB and TS.
- A frozen day is sealed against Template edits; "pull today's plan again" is
  add-only and idempotent.
- `materialize_day` does **not** freeze `life`-category Blocks (sleep, meals):
  they aren't checkable commitments and would otherwise sit forever open in the
  Migration ritual. They can still be checked off manually (the check-off
  inserts their entry on demand), and the report already excludes `life`.

## Amendment (2026-07-17): `start_min` reversal for "Today's plan"

The bujo-not-a-timeline stance still holds for **past** days — Report/Log stay
position-ordered off frozen `dur_min`/`deep`, no re-flow — but not for
**today**: the user tracks deep/shallow work hours by clock time, so the
"Today's plan" card needs each entry's own editable `start_min` and `anchored`
flag, mirroring `blocks`.

- `log_entries` gains `start_min` (nullable — null for entries not on today's
  timeline, i.e. rapid-log todos/notes) and `anchored`. `materialize_day` now
  freezes both: `start_min` is the Template's `resolve()`-computed start at
  freeze time (not the Block's raw, possibly-stale `start_min` — an unanchored
  Block's own value is meaningless); `anchored` is copied from the Block as a
  starting point, then edited independently of the Template from here on,
  through the same chained/anchored re-flow model `resolve()` already applies
  to `blocks`.
- `materialize_day`'s `cat <> 'life'` filter is dropped — life Blocks (sleep,
  meals) get an entry too, so today's timeline has no holes. They stay
  excluded from the Migration ritual and completion % exactly as before, now
  via an explicit `cat <> 'life'` filter at each call site (previously true by
  construction, since a life entry couldn't exist).
- Entries already materialized before this shipped are backfilled once, from
  the Template as it stands now (best-effort — approximate for a Template
  that's since changed, same caveat as `0006`'s snapshot backfill).
