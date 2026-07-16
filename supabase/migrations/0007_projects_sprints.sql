-- Project management: projects and sprints, and links from log_entries so
-- bullet-journal tasks can be processed into a sprint. A project runs a
-- lifecycle (planning → active → done → archived); a sprint (planning → active
-- → done) groups tasks within it.

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  goal text not null default '',
  status text not null default 'planning' check (status in ('planning', 'active', 'done', 'archived')),
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user on projects (user_id, position);

create table sprints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  project_id uuid not null references projects on delete cascade,
  name text not null,
  goal text not null default '',
  status text not null default 'planning' check (status in ('planning', 'active', 'done')),
  start_date date,
  end_date date,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index sprints_project on sprints (project_id, position);

-- A task/note can belong to a project, and optionally a sprint within it.
-- Null project_id = still in the bullet-journal inbox (unprocessed).
alter table log_entries add column project_id uuid references projects on delete set null;
alter table log_entries add column sprint_id uuid references sprints on delete set null;

alter table projects enable row level security;
create policy "own rows" on projects for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
alter table sprints enable row level security;
create policy "own rows" on sprints for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
