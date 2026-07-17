-- Habits reference their Bucket; per-bucket color resolves live (ADR-0003, #19).
--
-- A Habit gains a nullable `bucket_id`, joining Blocks (#16) in the taxonomy.
-- Its toggles, streak cells and bars no longer color per-`cat`; they resolve
-- LIVE per habit through this reference (the same `blockStyle` resolver blocks
-- use): habit -> its bucket's custom color -> the cat palette fallback.
-- Recoloring a bucket restyles every habit placed from it; deleting a bucket
-- SET NULLs its habits, which revert to the fallback palette but stay fully
-- functional (Unassigned / gray).
--
-- `cat` is NOT dropped: it stays stamped from the chosen bucket on write, as
-- derived legacy plumbing (existing SQL/views/denormalized history keep working;
-- a set-null habit still carries its old cat). The bucket reference is
-- authoritative; `cat` is plumbing.
--
-- NOTE: scope is HABITS only. Blocks (#16), log entries (#18), the counted flag
-- (#17), traces (#20/#21) and the Cat enum retirement (#23) are separate slices.

-- ---------- schema ----------

alter table habits
  add column if not exists bucket_id uuid references buckets on delete set null;

create index if not exists habits_user_bucket
  on habits (user_id, bucket_id)
  where bucket_id is not null;

-- ---------- backfill: match each habit's cat to its 1:1 bucket ----------

-- 1. Create any bucket that a habit's cat needs but the user doesn't have yet
--    (migration 0015 already covers block cats; a habit may carry a cat no
--    block does). Positions land after the user's existing buckets.
insert into buckets (user_id, name, cat, position)
select missing.user_id,
       initcap(missing.cat) as name,
       missing.cat,
       2000 + row_number() over (order by missing.user_id, missing.cat) as position
from (select distinct user_id, cat from habits) as missing
where not exists (
  select 1 from buckets bk
  where bk.user_id = missing.user_id and bk.cat = missing.cat
);

-- 2. Link every still-unlinked habit to its cat's bucket. A user may hold
--    several buckets sharing a cat (legacy); pick the lowest-position one
--    deterministically, so the backfill is stable and idempotent.
update habits h
set bucket_id = (
  select bk.id from buckets bk
  where bk.user_id = h.user_id and bk.cat = h.cat
  order by bk.position, bk.id
  limit 1
)
where h.bucket_id is null;
