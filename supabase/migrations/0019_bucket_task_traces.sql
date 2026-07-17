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

-- ---------- materialize: the UNIFIED final definition ----------
-- This is the highest-numbered `create or replace function materialize_day`, so
-- (migrations running in number order) it is the FINAL, authoritative body and
-- MUST carry EVERYTHING accumulated across prior slices. It is the union of:
--   * fork-wins over Template + the recursive `resolve()` start_min computation
--     (0013/0014);
--   * the counted gate + `bucket_id` stamp (0017): freeze only blocks whose
--     Bucket is counted (or has no bucket -- Unassigned still materializes); an
--     uncounted bucket (Life) never freezes, replacing the old `cat <> 'life'`
--     special case. Carry `bucket_id` so the frozen entry inherits it.
--   * the project/sprint trace stamp (this slice, #21): copy the source Block's
--     project_id/sprint_id onto the frozen entry so a check-off accrues to the
--     traced project (and sprint).
-- The habit link is NOT copied onto the entry: it rides on the Block
-- (blocks.habit_id), and the client mirrors the habit log from there on
-- check-off. Idempotent (on conflict do nothing).

create or replace function materialize_day(uid uuid, d date)
returns int  -- number of newly-frozen entries
language plpgsql
security definer
set search_path = public
as $$
declare
  target_dow int;
  inserted   int;
  is_forked  boolean;
begin
  if auth.uid() is not null and auth.uid() <> uid then
    raise exception 'cannot materialize for another user';
  end if;

  -- days.dow / blocks.dow use Monday=0..Sunday=6; isodow is Monday=1..Sunday=7.
  target_dow := extract(isodow from d)::int - 1;

  -- The explicit marker decides: a forked date freezes from its Day Plan
  -- (dated blocks -- possibly none, for an intentionally-emptied day), an
  -- unforked date from the weekday Template (undated blocks only).
  select exists (select 1 from forked_days f where f.user_id = uid and f.on_date = d)
    into is_forked;

  with recursive ordered as (
    -- Freeze only blocks whose Bucket is counted (or has no bucket --
    -- Unassigned still materializes); an uncounted bucket (Life) never freezes,
    -- replacing the old `cat <> 'life'` case (#17). Carries `bucket_id` (#17)
    -- and the project/sprint trace (#21) so the frozen entry inherits them.
    select b.id, b.bucket_id, b.project_id, b.sprint_id, b.start_min, b.dur_min,
           b.anchored, b.title, b.cat, b.deep, b.position,
           row_number() over (order by b.position) as rn
    from blocks b
    left join buckets bk on bk.id = b.bucket_id
    where b.user_id = uid
      and coalesce(bk.counted, true)
      and case when is_forked
            then b.on_date = d
            else b.dow = target_dow and b.on_date is null
          end
  ),
  resolved as (
    -- Replicates src/lib/planner.ts's resolve(): the first block in position
    -- order always starts at its own start_min (no prior cursor); an anchored
    -- block afterward is pushed to max(its pin, the prior end); an unanchored
    -- one chains immediately after the prior end.
    select id, start_min as computed_start, start_min + dur_min as cursor_end, rn
    from ordered where rn = 1
    union all
    select o.id,
           case when o.anchored then greatest(o.start_min, r.cursor_end) else r.cursor_end end,
           case when o.anchored then greatest(o.start_min, r.cursor_end) else r.cursor_end end + o.dur_min,
           o.rn
    from ordered o join resolved r on o.rn = r.rn + 1
  )
  insert into log_entries
    (user_id, on_date, kind, state, text, cat, bucket_id, block_id, dur_min, deep, start_min, anchored, position, project_id, sprint_id)
  select uid, d, 'task', 'open', o.title, o.cat, o.bucket_id, o.id, o.dur_min, o.deep, res.computed_start, o.anchored, o.position, o.project_id, o.sprint_id
  from ordered o
  join resolved res on res.id = o.id
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
