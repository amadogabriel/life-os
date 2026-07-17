-- Board card order (#26) is a distinct field from log_entries.position (ADR-0005).
--
-- position already means "order on a specific day's timeline" — shared with
-- reorderLogEntries and the Planner's drag-reorder, scoped by on_date. A Board
-- column (Inbox, a Project's Backlog, or a Sprint) needs its own order that
-- survives independently of whatever day (if any) the entry is also on, so
-- reordering one view can never silently reorder the other.
--
-- Scoped by whichever grouping the entry currently sits in: Inbox (global,
-- project_id is null), a Project's Backlog (project_id set, sprint_id null),
-- or a Sprint (sprint_id set) — mirroring how `position` is scoped by on_date.

alter table log_entries
  add column if not exists board_position int not null default 0;

create index if not exists log_entries_board_position_idx
  on log_entries (project_id, sprint_id, board_position);
