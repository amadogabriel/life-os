-- Log-primary record, step 3: migrate the legacy record into the Daily Log.
--
-- Every `block_logs` row becomes a DONE task Log Entry on its `done_on` day,
-- carrying the frozen `dur_min`/`deep` snapshot so the accomplishment report
-- keeps working after `block_logs` is retired. `block_logs` itself is left
-- intact as a read-only backup (like `todos`/`dump_items`) — this migration is
-- insert-only and reversible.
--
-- Idempotent via the `log_entries_block_day_uk` unique index: `on conflict do
-- nothing` means a day already materialized (open) is NOT clobbered — so run
-- this BEFORE the cron/catch-up ever freezes a historical day, to be sure the
-- done state wins.

insert into log_entries
  (user_id, on_date, kind, state, text, cat, block_id, dur_min, deep, position)
select
  bl.user_id,
  bl.done_on,
  'task',
  'done',
  bl.title,
  bl.cat,
  bl.block_id,
  bl.dur_min,
  bl.deep,
  (row_number() over (partition by bl.user_id, bl.done_on order by bl.block_id))::int - 1
from block_logs bl
on conflict (user_id, block_id, on_date) where block_id is not null
do nothing;
