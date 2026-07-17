-- Log-primary record, step 1: the Materialize primitive.
--
-- `materialize_day(uid, d)` freezes a user's weekday Template Blocks into the
-- Daily Log as OPEN task Log Entries, capturing the Template as it stood that
-- day. It is the SINGLE implementation of "freeze this day" — called both by
-- the nightly pg_cron job (0010) and by the client catch-up (RPC). It is
-- idempotent and add-only: a unique index plus `on conflict do nothing` means
-- running it twice never duplicates, and it never touches an existing row (so a
-- block already checked `done` stays done).
--
-- Frozen fields: kind='task', state='open', text=block.title, cat=block.cat,
-- block_id=block.id, dur_min/deep copied from the block. `start_min` is
-- intentionally NOT frozen — a past Daily Log is a bujo list, not a timeline.
-- Hand-typed entries leave dur_min null / deep false.

-- ---------- schema: frozen snapshot columns on the record ----------
alter table log_entries add column if not exists dur_min int;               -- null for hand-typed entries
alter table log_entries add column if not exists deep    boolean not null default false;

-- One frozen entry per (user, block, day). Partial so hand-typed entries
-- (block_id is null) are never constrained.
create unique index if not exists log_entries_block_day_uk
  on log_entries (user_id, block_id, on_date)
  where block_id is not null;

-- ---------- the freeze primitive ----------
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
  -- Called via RPC, an authenticated user may only materialize their own days.
  -- Called from cron there is no auth.uid(), so the service path is unrestricted.
  if auth.uid() is not null and auth.uid() <> uid then
    raise exception 'cannot materialize for another user';
  end if;

  -- days.dow / blocks.dow use Monday=0..Sunday=6; isodow is Monday=1..Sunday=7.
  target_dow := extract(isodow from d)::int - 1;

  insert into log_entries
    (user_id, on_date, kind, state, text, cat, block_id, dur_min, deep, position)
  select b.user_id, d, 'task', 'open', b.title, b.cat, b.id, b.dur_min, b.deep, b.position
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

-- Drivable headlessly (Claude Code + MCP) and from the client, but never anon.
-- NB: Supabase default privileges auto-grant EXECUTE to anon+authenticated on
-- new public functions; `revoke from public` doesn't remove those, so we also
-- revoke anon explicitly (see 0012). Signed-in users are still bounded to their
-- own uid by the auth.uid() guard above.
revoke all on function materialize_day(uuid, date) from public;
revoke execute on function materialize_day(uuid, date) from anon;
grant execute on function materialize_day(uuid, date) to authenticated, service_role;
