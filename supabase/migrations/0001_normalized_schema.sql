-- Normalized planner schema (replaces the single `planners` jsonb blob).
-- Every row is per-user and independently updatable, so cross-device edits
-- no longer clobber each other. Run in the Supabase SQL editor or via
-- `supabase db push`.

-- ---------- tables ----------

-- One row per weekday template (0 = Monday … 6 = Sunday).
create table days (
  user_id uuid not null references auth.users on delete cascade,
  dow smallint not null check (dow between 0 and 6),
  name text not null,
  loc text not null default '',
  primary key (user_id, dow)
);

-- Scheduled blocks inside a weekday template. `position` is the order used
-- by the re-flow algorithm; `anchored` blocks keep their fixed start_min.
create table blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  dow smallint not null check (dow between 0 and 6),
  position int not null,
  cat text not null,
  title text not null,
  detail text not null default '',
  start_min int not null default 0 check (start_min between 0 and 1439),
  dur_min int not null check (dur_min between 5 and 1440),
  anchored boolean not null default false,
  updated_at timestamptz not null default now()
);
create index blocks_user_dow on blocks (user_id, dow, position);

-- A block checked off on a concrete date.
create table block_logs (
  user_id uuid not null references auth.users on delete cascade,
  block_id uuid not null references blocks on delete cascade,
  done_on date not null,
  primary key (block_id, done_on)
);
create index block_logs_user_date on block_logs (user_id, done_on);

create table habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  cat text not null,
  days smallint[] not null default '{}',  -- target weekdays, 0=Mon
  position int not null default 0
);
create index habits_user on habits (user_id, position);

create table habit_logs (
  user_id uuid not null references auth.users on delete cascade,
  habit_id uuid not null references habits on delete cascade,
  done_on date not null,
  primary key (habit_id, done_on)
);
create index habit_logs_user_date on habit_logs (user_id, done_on);

-- "Design a day" palette: buckets of reusable hour-sized tasks.
create table buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  cat text not null,
  position int not null default 0
);
create index buckets_user on buckets (user_id, position);

create table bucket_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  bucket_id uuid not null references buckets on delete cascade,
  name text not null,
  position int not null default 0
);
create index bucket_tasks_bucket on bucket_tasks (bucket_id, position);

-- Items currently placed in the day being designed.
create table design_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  position int not null,
  name text not null,
  cat text not null,
  mins int not null check (mins between 30 and 960)
);
create index design_items_user on design_items (user_id, position);

-- Per-user singletons: parked notes + design-day wake time.
create table profiles (
  user_id uuid primary key references auth.users on delete cascade,
  notes text not null default '',
  design_wake_min int not null default 300
);

-- ---------- row-level security ----------

do $$
declare t text;
begin
  foreach t in array array['days','blocks','block_logs','habits','habit_logs',
                           'buckets','bucket_tasks','design_items','profiles']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own rows" on %I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ---------- optional: realtime ----------
-- Uncomment to push changes live to other open devices (Supabase Realtime,
-- free tier). The app also refetches on window focus either way.
-- alter publication supabase_realtime add table
--   days, blocks, block_logs, habits, habit_logs,
--   buckets, bucket_tasks, design_items, profiles;
