-- Blocks reference their Bucket; per-bucket color resolves live (ADR-0003, #16).
--
-- A Block gains a nullable `bucket_id`. Color no longer resolves per-`cat`
-- (first-bucket-wins); it resolves LIVE per block through this reference:
--   block -> its bucket's custom color -> the cat palette fallback.
-- Recoloring a bucket restyles every block placed from it; deleting a bucket
-- SET NULLs its blocks, which revert to the fallback palette. Two buckets that
-- share a legacy `cat` can now hold two different colors without interfering.
--
-- `cat` is NOT dropped: it stays stamped from the chosen bucket on write, as
-- derived legacy plumbing (existing SQL/views/denormalized history keep working;
-- a set-null block still carries its old cat). The bucket reference is
-- authoritative; `cat` is plumbing.
--
-- NOTE: scope is BLOCKS only. Log entries (#18), habits (#19), the counted flag
-- (#17), traces (#20/#21) and the Cat enum retirement (#23) are separate slices.

-- ---------- schema ----------

alter table blocks
  add column if not exists bucket_id uuid references buckets on delete set null;

create index if not exists blocks_user_bucket
  on blocks (user_id, bucket_id)
  where bucket_id is not null;

-- ---------- backfill: match each block's cat to its 1:1 bucket ----------

-- 1. Create any bucket that a block's cat needs but the user doesn't have yet
--    (e.g. Life / DevOps / Exercise) so every cat present in blocks has a home.
--    Positions land after the user's existing buckets (offset avoids clashes).
insert into buckets (user_id, name, cat, position)
select missing.user_id,
       initcap(missing.cat) as name,
       missing.cat,
       1000 + row_number() over (order by missing.user_id, missing.cat) as position
from (select distinct user_id, cat from blocks) as missing
where not exists (
  select 1 from buckets bk
  where bk.user_id = missing.user_id and bk.cat = missing.cat
);

-- 2. Link every still-unlinked block to its cat's bucket. A user may hold
--    several buckets sharing a cat (legacy); pick the lowest-position one
--    deterministically, so the backfill is stable and idempotent.
update blocks b
set bucket_id = (
  select bk.id from buckets bk
  where bk.user_id = b.user_id and bk.cat = b.cat
  order by bk.position, bk.id
  limit 1
)
where b.bucket_id is null;
