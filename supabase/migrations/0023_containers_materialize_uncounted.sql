-- Containers must materialize even in an uncounted bucket (#29 follow-up).
--
-- Bug: materialize_day (0016/0017, carried through 0022) freezes a block onto a
-- day only if its Bucket is `counted` (or it has no bucket). That gate exists so
-- an uncounted "Life" bucket (sleep/meals/commute) never clutters the frozen log
-- or the deep-work scoreboard. But a Container is a per-day Agenda holder, and
-- the whole point of Containers is to batch *shallow* work — which is exactly
-- what lives in an uncounted bucket (e.g. a "Work" bucket kept off the deep
-- scoreboard). The gate therefore made Containers structurally impossible in any
-- uncounted bucket: the block saves with `container = true`, but materialize_day
-- silently skips it, so today (log-primary, ADR-0002) never renders it and it can
-- never be clicked into its Agenda.
--
-- Fix: freeze a block when its bucket is counted, OR it has no bucket, OR it is a
-- Container. Ordinary uncounted blocks (Life: sleep/meals/commute) still stay out
-- of the frozen log and the scoreboard exactly as before; only Containers gain an
-- always-materialize exemption. A Container's own hours still don't accrue counted
-- time — `deepMinutes`/accrual read the bucket's `counted` flag live and are
-- untouched here; this changes materialization only.
--
-- Body is byte-identical to 0022's definition EXCEPT the one WHERE predicate on
-- line "coalesce(bk.counted, true)" -> "(coalesce(bk.counted, true) or b.container)".
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
    -- Freeze a block whose Bucket is counted (or has no bucket -- Unassigned
    -- still materializes), OR which is a Container (a Container batches shallow
    -- work and must land on the day even from an uncounted bucket -- #29). An
    -- uncounted, non-Container bucket (Life) still never freezes. Carries
    -- `bucket_id` (#17) and the project/sprint trace (#21) so the frozen entry
    -- inherits them.
    select b.id, b.bucket_id, b.project_id, b.sprint_id, b.start_min, b.dur_min,
           b.anchored, b.title, b.cat, b.deep, b.position,
           row_number() over (order by b.position) as rn
    from blocks b
    left join buckets bk on bk.id = b.bucket_id
    where b.user_id = uid
      and (coalesce(bk.counted, true) or b.container)
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
  on conflict (user_id, block_id, on_date) where block_id is not null and not is_agenda_item
  do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- Grants unchanged from 0009/0012: drivable by the owner + service_role, never anon.
revoke all on function materialize_day(uuid, date) from public;
revoke execute on function materialize_day(uuid, date) from anon;
grant execute on function materialize_day(uuid, date) to authenticated, service_role;
