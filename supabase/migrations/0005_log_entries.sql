-- Bullet-journal daily log: a first-class, dated record of what actually
-- happened each day. Rapid logging (task / event / note) with states and
-- signifiers, plus migration (open items carried forward). This is the
-- permanent record; blocks & habits stay as reusable templates.
--
-- `on_date` is the user's LOCAL day. Backfill below derives it in Asia/Manila
-- (the one user's timezone); go-forward writes pass the client's local date.

create table log_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  on_date date not null,
  kind text not null default 'task'
    check (kind in ('task', 'event', 'note')),
  state text not null default 'open'
    check (state in ('open', 'done', 'migrated', 'scheduled', 'dropped')),
  signifier text not null default ''
    check (signifier in ('', 'priority', 'inspiration')),
  text text not null,
  cat text not null default 'open',
  block_id uuid references blocks on delete set null,      -- optional: entry tied to a scheduled block
  migrated_to uuid references log_entries on delete set null, -- forward pointer set when migrated
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index log_entries_user_date on log_entries (user_id, on_date, position);

alter table log_entries enable row level security;
create policy "own rows" on log_entries for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- backfill (insert-only; old tables left intact as backup) ----------

-- todos -> tasks on their created day, preserving done/open.
insert into log_entries (user_id, on_date, kind, state, text, cat, position, created_at)
select user_id,
       (created_at at time zone 'Asia/Manila')::date,
       'task',
       case when done then 'done' else 'open' end,
       text,
       'open',
       position,
       created_at
from todos;

-- brain-dump items -> notes on their created day.
insert into log_entries (user_id, on_date, kind, state, text, cat, position, created_at)
select user_id,
       (created_at at time zone 'Asia/Manila')::date,
       'note',
       'open',
       text,
       'open',
       (row_number() over (partition by user_id order by created_at))::int,
       created_at
from dump_items;
