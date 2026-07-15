-- Bucket appearance (custom color + deep-work flag), a todos list, and a
-- brain-dump inbox for the dashboard.

alter table buckets add column color text not null default '';
alter table buckets add column deep boolean not null default false;

-- Deep-work defaults: engineering, math, thesis. Everything else shallow.
update buckets set deep = true where cat in ('work', 'math', 'thesis');

create table todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null,
  done boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index todos_user on todos (user_id, position);

create table dump_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);
create index dump_items_user on dump_items (user_id, created_at);

do $$
declare t text;
begin
  foreach t in array array['todos', 'dump_items']
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy "own rows" on %I for all
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;
