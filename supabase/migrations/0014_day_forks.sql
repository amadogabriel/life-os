-- Day Plan (whole-day fork): one future date stops following its weekday
-- Template and carries its own dated Blocks (ADR-0002, "just this Tuesday").
--
-- Plan-side only — the Daily Log stays the sole record (ADR-0001): the fork
-- exists for a date, and `materialize_day` is still what turns it into the
-- record when the date arrives.
--
-- Two pieces of storage:
--   * `blocks.on_date` (nullable): null = a weekday Template Block, exactly as
--     before; set = a Day Plan Block for that one date. Dated Blocks reuse the
--     whole `blocks` shape (cat/title/start_min/dur_min/anchored/deep/habit_id
--     and the same re-flow), so the client edits them with the same actions.
--     `dow` still holds the date's weekday for those rows.
--   * `forked_days` (user_id, on_date): the explicit forked-day marker. It —
--     not the presence of dated Blocks — is what makes a date forked, so an
--     intentionally-emptied fork (all dated Blocks deleted) stays a blank
--     forked day rather than silently falling back to the Template.
--
-- Forking copies the weekday Template's Blocks into dated Blocks client-side
-- (both backends implement `forkDay`/`unforkDay`); un-forking deletes the
-- dated Blocks + marker and the date returns to the projection.
--
-- `materialize_day` becomes fork-aware: a forked date freezes from its Day
-- Plan, an unforked date from the Template — including retro-materialization
-- (the catch-up path calls the same function for missed days). The Template
-- branch now also excludes dated Blocks (`on_date is null`), since both kinds
-- share the table. Everything else — the resolve()-replicating recursive CTE,
-- add-only/idempotent `on conflict do nothing` — is unchanged from 0013.

-- ---------- schema ----------

alter table blocks add column if not exists on_date date; -- null = Template block

create index if not exists blocks_user_on_date
  on blocks (user_id, on_date, position)
  where on_date is not null;

create table if not exists forked_days (
  user_id uuid not null references auth.users on delete cascade,
  on_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, on_date)
);

alter table forked_days enable row level security;
create policy "own rows" on forked_days for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- materialize_day: fork wins over Template ----------

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

  -- The explicit marker decides: a forked date freezes from its Day Plan
  -- (dated blocks — possibly none, for an intentionally-emptied day), an
  -- unforked date from the weekday Template (undated blocks only).
  select exists (select 1 from forked_days f where f.user_id = uid and f.on_date = d)
    into is_forked;

  with recursive ordered as (
    select b.id, b.start_min, b.dur_min, b.anchored, b.title, b.cat, b.deep, b.position,
           row_number() over (order by b.position) as rn
    from blocks b
    where b.user_id = uid
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

-- `create or replace` keeps the existing ACL, but re-assert the 0012 lockdown
-- anyway: Supabase default privileges auto-grant EXECUTE to anon+authenticated
-- on public functions, and `revoke from public` alone doesn't remove those —
-- anon must be revoked explicitly on this SECURITY DEFINER function.
revoke all on function materialize_day(uuid, date) from public;
revoke execute on function materialize_day(uuid, date) from anon;
grant execute on function materialize_day(uuid, date) to authenticated, service_role;
