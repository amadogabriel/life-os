-- The Record joins the taxonomy: Log Entries reference their Bucket (ADR-0003,
-- #18) and materialization becomes bucket/counted-driven (#17).
--
-- A Log Entry gains a nullable `bucket_id`. Color resolves LIVE per entry
-- through it (bucket custom color → cat palette → Unassigned gray), the same
-- `blockStyle` resolution blocks use — recoloring a bucket restyles its log
-- entries too. `cat` stays stamped as derived plumbing; the bucket is
-- authoritative. Rapid-log picks a bucket; materialization stamps the source
-- block's bucket onto the frozen entry (below).
--
-- History is backfilled: block-sourced entries inherit the block's bucket;
-- hand-typed entries match cat → the user's 1:1 bucket (creating a missing one,
-- mirroring the #16 block backfill). Genuinely `open` entries stay Unassigned.
--
-- Finally, `materialize_day` is rewritten off the counted flag: it stamps
-- `bucket_id` onto frozen entries and freezes only blocks whose bucket is
-- counted (or has no bucket — Unassigned still materializes), replacing the old
-- `cat <> 'life'` special case.

-- ---------- schema ----------

alter table log_entries
  add column if not exists bucket_id uuid references buckets on delete set null;

create index if not exists log_entries_user_bucket
  on log_entries (user_id, bucket_id)
  where bucket_id is not null;

-- ---------- backfill ----------

-- 0. Create any bucket a hand-typed entry's cat needs but the user lacks
--    (mirrors the #16 block backfill), so every non-open cat has a home. Life
--    lands uncounted; everything else counted. `open` is skipped — those
--    entries are Unassigned by design.
insert into buckets (user_id, name, cat, position, counted)
select missing.user_id,
       initcap(missing.cat) as name,
       missing.cat,
       2000 + row_number() over (order by missing.user_id, missing.cat) as position,
       missing.cat <> 'life'
from (select distinct user_id, cat from log_entries where cat <> 'open') as missing
where not exists (
  select 1 from buckets bk
  where bk.user_id = missing.user_id and bk.cat = missing.cat
);

-- 1. Entries frozen from a block inherit that block's bucket (authoritative).
update log_entries e
set bucket_id = b.bucket_id
from blocks b
where e.block_id = b.id
  and e.bucket_id is null
  and b.bucket_id is not null;

-- 2. Hand-typed entries (no block) match their cat to the user's 1:1 bucket
--    (lowest-position, deterministic — same rule as the #16 block backfill).
--    A cat with no bucket, or the `open` cat, leaves the entry Unassigned.
update log_entries e
set bucket_id = (
  select bk.id from buckets bk
  where bk.user_id = e.user_id and bk.cat = e.cat
  order by bk.position, bk.id
  limit 1
)
where e.bucket_id is null
  and e.cat <> 'open';

-- ---------- materialize_day: stamp the bucket, gate on counted ----------

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

  target_dow := extract(isodow from d)::int - 1;

  select exists (select 1 from forked_days f where f.user_id = uid and f.on_date = d)
    into is_forked;

  with recursive ordered as (
    -- Freeze only blocks whose Bucket is counted (or has no bucket —
    -- Unassigned still materializes); an uncounted bucket (Life) never freezes,
    -- replacing the old `cat <> 'life'` case. Carries `bucket_id` so the frozen
    -- entry inherits it.
    select b.id, b.bucket_id, b.start_min, b.dur_min, b.anchored, b.title, b.cat, b.deep, b.position,
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
    (user_id, on_date, kind, state, text, cat, bucket_id, block_id, dur_min, deep, start_min, anchored, position)
  select uid, d, 'task', 'open', o.title, o.cat, o.bucket_id, o.id, o.dur_min, o.deep, res.computed_start, o.anchored, o.position
  from ordered o
  join resolved res on res.id = o.id
  on conflict (user_id, block_id, on_date) where block_id is not null
  do nothing;

  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- `create or replace` keeps the ACL, but re-assert the 0012 lockdown: anon must
-- be revoked explicitly on this SECURITY DEFINER function (default privileges
-- auto-grant EXECUTE to anon on new/replaced public functions).
revoke all on function materialize_day(uuid, date) from public;
revoke execute on function materialize_day(uuid, date) from anon;
grant execute on function materialize_day(uuid, date) to authenticated, service_role;
