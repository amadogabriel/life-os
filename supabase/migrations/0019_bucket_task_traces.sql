-- Traces on Bucket Tasks (#20 habit, #21 project/sprint) + the trace columns a
-- placed traced chip carries onto its Block and, via materialize, its Log Entry.
--
-- A Bucket Task may carry independent, coexisting Traces (ADR-0003):
--   * a HABIT link — placing the chip pre-links the Block (blocks.habit_id, from
--     0008); checking the Block off logs the habit for that day.
--   * a PROJECT link, optionally narrowed to a SPRINT *container* (never an
--     individual task) — placing the chip carries the link on the Block; when
--     materialize freezes the Block into a Log Entry it stamps the link on, so a
--     checked-off accomplishment accrues to the project (Projects view).
--
-- Everything is nullable with ON DELETE SET NULL, so deleting a trace's target
-- DEGRADES the task to vague: the curated chip survives with its name, the link
-- dies (no dangling ref). Deleting a Project set-nulls both its own ref AND, via
-- the sprints->projects cascade + the sprint FK below, its sprint ref; deleting a
-- Sprint set-nulls only the sprint ref, keeping the project trace.
--
-- NOT applied live yet (Supabase MCP/CLI/psql unavailable in this worktree) --
-- needs a live `supabase db push` + a probe once applied.

-- ---------- Bucket Task traces ----------

alter table bucket_tasks
  add column if not exists habit_id   uuid references habits   on delete set null,
  add column if not exists project_id uuid references projects on delete set null,
  add column if not exists sprint_id  uuid references sprints  on delete set null;

create index if not exists bucket_tasks_habit_id_idx   on bucket_tasks (habit_id)   where habit_id   is not null;
create index if not exists bucket_tasks_project_id_idx on bucket_tasks (project_id) where project_id is not null;
create index if not exists bucket_tasks_sprint_id_idx  on bucket_tasks (sprint_id)  where sprint_id  is not null;

-- ---------- Block project/sprint traces ----------
-- Blocks already carry habit_id (0008). A placed project-traced chip carries the
-- project/sprint link so materialize can stamp it onto the frozen entry.

alter table blocks
  add column if not exists project_id uuid references projects on delete set null,
  add column if not exists sprint_id  uuid references sprints  on delete set null;

create index if not exists blocks_project_id_idx on blocks (project_id) where project_id is not null;
create index if not exists blocks_sprint_id_idx  on blocks (sprint_id)  where sprint_id  is not null;

-- ---------- materialize stamps the project/sprint trace onto the record ----------
-- Log entries already carry project_id/sprint_id (0007). Re-issue the freeze
-- primitive (0009) so it copies the source Block's project/sprint link onto the
-- frozen entry -- check-offs then accrue to the traced project (and sprint). The
-- habit link is NOT copied onto the entry: it rides on the Block (blocks.habit_id),
-- and the client mirrors the habit log from there when the Block's entry is
-- checked off. Everything else is unchanged from 0009 (idempotent, add-only).

create or replace function materialize_day(uid uuid, d date)
returns int  -- number of newly-frozen entries
language plpgsql
security definer
set search_path = public
as $$
declare
  target_dow int;
  inserted   int;
begin
  if auth.uid() is not null and auth.uid() <> uid then
    raise exception 'cannot materialize for another user';
  end if;

  -- days.dow / blocks.dow use Monday=0..Sunday=6; isodow is Monday=1..Sunday=7.
  target_dow := extract(isodow from d)::int - 1;

  insert into log_entries
    (user_id, on_date, kind, state, text, cat, block_id, dur_min, deep, position, project_id, sprint_id)
  select b.user_id, d, 'task', 'open', b.title, b.cat, b.id, b.dur_min, b.deep, b.position, b.project_id, b.sprint_id
  from blocks b
  where b.user_id = uid
    and b.dow = target_dow
    and b.cat <> 'life'   -- life blocks (sleep/meals) aren't checkable commitments
  on conflict (user_id, block_id, on_date) where block_id is not null
  do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Grants unchanged from 0009/0012: drivable by the owner + service_role, never anon.
revoke all on function materialize_day(uuid, date) from public;
revoke execute on function materialize_day(uuid, date) from anon;
grant execute on function materialize_day(uuid, date) to authenticated, service_role;
