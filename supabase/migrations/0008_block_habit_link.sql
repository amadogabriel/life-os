-- Link a plan block to a habit. Checking the block off then auto-logs the
-- habit for that day (and un-checking removes it) — so recurring commitments
-- in the weekly plan feed the habit tracker without double entry.
alter table blocks
  add column if not exists habit_id uuid references habits(id) on delete set null;

create index if not exists blocks_habit_id_idx on blocks(habit_id);
