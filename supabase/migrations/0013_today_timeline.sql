-- Log-primary record, step 2: "Today's plan" becomes a real timeline.
--
-- Partial reversal of 0009's "start_min is intentionally NOT frozen — a past
-- Daily Log is a bujo list, not a timeline" call (see
-- docs/adr/0001-log-primary-record.md's amendment): the user tracks
-- deep/shallow work hours by clock time, so *today's* entries need their own
-- editable start time and anchor flag, mirroring `blocks`. Past days are
-- unaffected — Report/Log still read frozen dur_min/deep, position-ordered,
-- no re-flow.
--
-- `materialize_day` now also freezes `start_min` (the Template's
-- resolve()-computed start at freeze time, replicating src/lib/planner.ts's
-- resolve() as a recursive CTE) and `anchored` (copied from the source
-- Block), and drops its `cat <> 'life'` filter — life blocks (sleep, meals)
-- get an entry too, so today's timeline has no holes. They stay excluded from
-- the Migration ritual and completion % exactly as before, now via an
-- explicit `cat <> 'life'` filter at each call site (src/features/log/LogView.tsx,
-- src/features/today/TodayView.tsx) rather than by never existing as a row.

alter table log_entries add column if not exists start_min int;              -- null: not on today's timeline (rapid-log todos/notes)
alter table log_entries add column if not exists anchored boolean not null default false;

-- ---------- backfill: entries already materialized before this shipped ----------
-- Best-effort, from the Template as it stands now — approximate for rows
-- whose Template has since changed, same caveat as 0006's snapshot backfill.
with recursive ordered as (
  select b.id as block_id, b.user_id, b.dow, b.start_min, b.dur_min, b.anchored,
         row_number() over (partition by b.user_id, b.dow order by b.position) as rn
  from blocks b
),
resolved as (
  select block_id, user_id, dow, start_min as computed_start,
         start_min + dur_min as cursor_end, rn
  from ordered where rn = 1
  union all
  select o.block_id, o.user_id, o.dow,
         case when o.anchored then greatest(o.start_min, r.cursor_end) else r.cursor_end end,
         case when o.anchored then greatest(o.start_min, r.cursor_end) else r.cursor_end end + o.dur_min,
         o.rn
  from ordered o
  join resolved r on o.rn = r.rn + 1 and o.user_id = r.user_id and o.dow = r.dow
)
update log_entries le
set start_min = res.computed_start,
    anchored  = ob.anchored
from resolved res
join blocks ob on ob.id = res.block_id
where le.block_id = res.block_id
  and le.start_min is null;

-- ---------- materialize_day: freeze start_min/anchored, include life blocks ----------
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

  target_dow := extract(isodow from d)::int - 1;

  with recursive ordered as (
    select b.id, b.start_min, b.dur_min, b.anchored, b.title, b.cat, b.deep, b.position,
           row_number() over (order by b.position) as rn
    from blocks b
    where b.user_id = uid
      and b.dow = target_dow
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
    (user_id, on_date, kind, state, text, cat, block_id, dur_min, deep, start_min, anchored, position)
  select uid, d, 'task', 'open', o.title, o.cat, o.id, o.dur_min, o.deep, res.computed_start, o.anchored, o.position
  from ordered o
  join resolved res on res.id = o.id
  on conflict (user_id, block_id, on_date) where block_id is not null
  do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;
