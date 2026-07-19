-- Containers & Agenda, slice 1 of #29 (#30): the schema substrate only — NO
-- user-visible behavior change. This is the prefactor everything else builds on
-- ("make the change easy, then make the easy change"). Three moves, all additive
-- or constraint-preserving; existing rows read exactly as before.
--
-- ---------- 1. `container` on blocks ----------
-- A Block is now either a Container (holds a per-day Agenda) or Concrete (is its
-- own content). Default false → every existing Block is Concrete and unaffected
-- (US 29). Orthogonal to the existing `deep` flag (0004): a Container may be deep
-- or shallow. Because a fork copies the whole `blocks` shape and a projected day
-- reads Template blocks directly, the flag rides through to Day Plan forks and
-- projected days for free (the client fork-copy also carries it — see forkDay).
-- materialize_day does NOT read `container` yet: freezing a Container into a
-- parent line + Agenda children is a LATER slice; here materialize is unchanged
-- except for the on-conflict target rework below.
--
-- ---------- 2. the `block_id` role disambiguator (ADR-0006) ----------
-- `log_entries.block_id` becomes overloaded. It has meant "materialized *from*
-- this Block" (1:1); it now *also* means "Agenda item *under* this Container"
-- (N:1), and a Container's materialized parent line shares its `block_id` with
-- its children. Parent and child must be told apart by ROLE, not by the column
-- alone — the same hazard and resolution as `position` vs Board position
-- (ADR-0005): add a distinct field.
--
-- Choice: a boolean role marker `is_agenda_item`, NOT a `parent_entry_id` self-FK.
-- Why the marker and not the FK — a filled *future* Container (US 13, does not
-- fork) creates its children BEFORE materialize creates the parent Log Entry, so
-- at fill time there is no parent row for a child to point at. A self-FK would be
-- null exactly when we most need the role known; the marker is well-defined from
-- birth. A child finds its parent line by (user_id, block_id, on_date) among
-- rows where NOT is_agenda_item (guaranteed unique by the index below), so the
-- explicit back-pointer buys nothing here. Default false → every existing entry
-- (and every materialized parent line) is a non-Agenda-item, i.e. keeps the old
-- 1:1 meaning.
--
-- ---------- 3. rework the load-bearing 1:1 constraint ----------
-- The partial unique index (0009) and materialize_day's matching on-conflict
-- target hard-code the old 1:1 meaning: one row per (user, block, day) among
-- rows with a block_id. An N:1 Agenda child sharing its parent's block_id would
-- violate it. Narrow both with `and not is_agenda_item`: the single parent line
-- per (user, block, day) stays unique, while children (is_agenda_item = true)
-- are unconstrained and coexist.

-- ---------- 1. container flag ----------
alter table blocks
  add column if not exists container boolean not null default false;

-- ---------- 2. Agenda-item role marker ----------
alter table log_entries
  add column if not exists is_agenda_item boolean not null default false;

-- ---------- 3a. redefine the partial unique index ----------
-- `create index if not exists` won't alter an existing index's predicate, so
-- drop and recreate. Narrowed to parent lines only.
drop index if exists log_entries_block_day_uk;
create unique index if not exists log_entries_block_day_uk
  on log_entries (user_id, block_id, on_date)
  where block_id is not null and not is_agenda_item;

-- ---------- 3b. redefine materialize_day's on-conflict target ----------
-- Body is byte-identical to the 0019 unified definition EXCEPT the on-conflict
-- inference predicate, which must now match the narrowed index above (Postgres
-- rejects an ON CONFLICT whose predicate no longer names any index). materialize
-- only ever inserts parent lines (is_agenda_item defaults false), so every
-- inserted row satisfies the predicate and the arbiter still applies. Container
-- freeze-to-parent+children is deliberately NOT added here — that is a later slice.
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
