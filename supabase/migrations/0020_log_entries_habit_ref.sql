-- Log Entries carry a habit Trace (#24) — the entry-based mirror of the Block's
-- habit link (blocks.habit_id, 0008).
--
-- The canonical Planner/DayEditor placement path drops a habit-traced chip as a
-- Block pre-linked to its habit; checking that Block off logs the habit via the
-- block->habit mirror (#20). But the Today editor palette places a Log Entry
-- directly (no Block), so it had nowhere to hang the habit link and the promise
-- silently degraded on that surface. This column gives a block-less entry its
-- own habit Trace: `addFromChip` carries the task's habit_id onto the entry, and
-- checking the entry off logs the habit for that day (entryHabitMirror).
--
-- Nullable with ON DELETE SET NULL, matching the other Trace refs (0019):
-- deleting the habit degrades the entry to vague (its text survives, the link
-- dies) rather than leaving a dangling reference.
--
-- Scope: block-less entries only. Entries FROZEN from a Block by materialize_day
-- do NOT carry habit_id — the link rides on the source Block, and the Planner
-- check-off mirrors from there (see 0019's note). So materialize_day is
-- unchanged by this slice.

alter table log_entries
  add column if not exists habit_id uuid references habits on delete set null;

create index if not exists log_entries_habit_id_idx
  on log_entries (habit_id)
  where habit_id is not null;
