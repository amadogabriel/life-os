-- Lock down the materialize RPCs.
--
-- Supabase's default privileges auto-grant EXECUTE on every new public function
-- to `anon` + `authenticated`. `revoke ... from public` (in 0009/0010) does NOT
-- remove those explicit per-role grants — so without this, an anonymous caller
-- could POST /rpc/materialize_day with any user's uuid and inject open Log
-- Entries into their account (auth.uid() is null for anon, so the owner-guard
-- passes), and anyone could trigger the all-users freeze.
--
-- After this: materialize_day is callable only by signed-in users (still guarded
-- to their own uid inside the function); materialize_all is cron/service-only.
-- 0009/0010 carry the same revokes now, so a fresh database is locked from the
-- start; this migration re-applies them to databases already migrated past them.
revoke execute on function materialize_day(uuid, date) from anon;
revoke execute on function materialize_all() from anon, authenticated;
