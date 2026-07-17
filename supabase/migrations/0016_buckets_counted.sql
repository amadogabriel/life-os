-- Buckets carry a `counted` flag: does this bucket's hours belong on the
-- scoreboard? (ADR-0003, #17.)
--
-- This REPLACES the two hardcoded category special cases the app leaned on:
--   * `COUNTED` / `cat <> 'life'` for stats gating, and
--   * `cat <> 'life'` for excluding a block from materialization.
-- Both now resolve LIVE through the block/entry's bucket → `counted`:
--   * a counted bucket accrues hours AND materializes;
--   * an uncounted bucket (e.g. Life: sleep/meals/commute) does neither —
--     it never freezes into the record and never hits the scoreboard;
--   * a NULL bucket is Unassigned: it still materializes as a commitment, but
--     never accrues counted hours (replacing the `open` cat's role).
--
-- `cat` stays as derived plumbing (ADR-0003). Default `true` so ordinary
-- work/study buckets count without any migration touch; only Life-type buckets
-- are flipped off below.
--
-- NOTE: scope is the flag + the Life backfill. Log-entry bucket refs and the
-- flag-driven materialize_day rewrite land in 0017.

alter table buckets
  add column if not exists counted boolean not null default true;

-- Life-category buckets (created by the #16 backfill, or user-made) are recovery
-- housekeeping, not commitments: mark them uncounted so they leave the
-- scoreboard and stop materializing. Idempotent.
update buckets set counted = false where cat = 'life' and counted;
