-- Log-primary record, step 2: the nightly freeze.
--
-- `materialize_all()` runs `materialize_day` for every user for the current
-- Asia/Manila day, so unopened days still get a faithful record. It is the
-- primary path (the client catch-up in the app is only a best-effort backstop).
-- pg_cron fires it at 16:00 UTC == 00:00 Asia/Manila (UTC+8, no DST), i.e. the
-- instant a new local day begins — never touching UTC `current_date`.

create or replace function materialize_all()
returns int  -- total entries frozen across all users
language plpgsql
security definer
set search_path = public
as $$
declare
  u     uuid;
  total int := 0;
  d     date := (now() at time zone 'Asia/Manila')::date;
begin
  for u in select distinct user_id from blocks loop
    total := total + materialize_day(u, d);
  end loop;
  return total;
end;
$$;

-- Cron/service only — never client-callable. Revoke the anon+authenticated
-- grants Supabase's default privileges add to new public functions (see 0012).
revoke all on function materialize_all() from public;
revoke execute on function materialize_all() from anon, authenticated;
grant execute on function materialize_all() to service_role;

-- Upsert by job name, so re-applying this migration is idempotent.
select cron.schedule('materialize-daily', '0 16 * * *', $$select materialize_all()$$);
