-- Migrate data out of the legacy `planners` jsonb blob into the normalized
-- tables from 0001. Idempotence: skips users who already have a profiles row.
-- The `planners` table is left untouched as a backup; drop it once verified.

-- The app seeds defaults for any user whose `days` is empty, so a user may
-- have seeded rows before this migration runs. For users still awaiting
-- migration (no profiles row), wipe those defaults so the real data wins.
-- Their logs are empty by definition of "not yet migrated + freshly seeded".
delete from days d using planners p
  where d.user_id = p.user_id
    and not exists (select 1 from profiles pr where pr.user_id = p.user_id);
delete from blocks b using planners p
  where b.user_id = p.user_id
    and not exists (select 1 from profiles pr where pr.user_id = p.user_id);
delete from habits h using planners p
  where h.user_id = p.user_id
    and not exists (select 1 from profiles pr where pr.user_id = p.user_id);
delete from buckets k using planners p
  where k.user_id = p.user_id
    and not exists (select 1 from profiles pr where pr.user_id = p.user_id);
delete from design_items i using planners p
  where i.user_id = p.user_id
    and not exists (select 1 from profiles pr where pr.user_id = p.user_id);

-- Weekday templates (array index 0 = Monday).
insert into days (user_id, dow, name, loc)
select p.user_id, (d.ord - 1)::smallint, d.day->>'name', coalesce(d.day->>'loc', '')
from planners p
cross join lateral jsonb_array_elements(p.data->'days') with ordinality as d(day, ord)
where not exists (select 1 from profiles pr where pr.user_id = p.user_id);

-- Blocks inside each weekday. Old field names: desc/start/dur/anchor.
insert into blocks (user_id, dow, position, cat, title, detail, start_min, dur_min, anchored)
select p.user_id, (d.ord - 1)::smallint, (b.ord - 1)::int,
       b.blk->>'cat', b.blk->>'title', coalesce(b.blk->>'desc', ''),
       coalesce((b.blk->>'start')::int, 0),
       (b.blk->>'dur')::int,
       coalesce((b.blk->>'anchor')::boolean, false)
from planners p
cross join lateral jsonb_array_elements(p.data->'days') with ordinality as d(day, ord)
cross join lateral jsonb_array_elements(d.day->'blocks') with ordinality as b(blk, ord)
where not exists (select 1 from profiles pr where pr.user_id = p.user_id);

insert into habits (user_id, name, cat, days, position)
select p.user_id, h.hab->>'name', h.hab->>'cat',
       coalesce((select array_agg(v.x::smallint order by v.ord)
                 from jsonb_array_elements_text(h.hab->'days') with ordinality as v(x, ord)),
                '{}'),
       (h.ord - 1)::int
from planners p
cross join lateral jsonb_array_elements(p.data->'habits') with ordinality as h(hab, ord)
where not exists (select 1 from profiles pr where pr.user_id = p.user_id);

-- Buckets and their nested tasks; the CTE maps new bucket ids back to the
-- source rows via (user_id, position).
with src as (
  select p.user_id, k.bkt->>'name' as name, k.bkt->>'cat' as cat,
         (k.ord - 1)::int as position, k.bkt->'tasks' as tasks
  from planners p
  cross join lateral jsonb_array_elements(p.data->'buckets') with ordinality as k(bkt, ord)
  where not exists (select 1 from profiles pr where pr.user_id = p.user_id)
), ins as (
  insert into buckets (user_id, name, cat, position)
  select user_id, name, cat, position from src
  returning id, user_id, position
)
insert into bucket_tasks (user_id, bucket_id, name, position)
select i.user_id, i.id, t.tsk->>'name', (t.ord - 1)::int
from ins i
join src s on s.user_id = i.user_id and s.position = i.position
cross join lateral jsonb_array_elements(s.tasks) with ordinality as t(tsk, ord);

insert into design_items (user_id, position, name, cat, mins)
select p.user_id, (i.ord - 1)::int, i.it->>'name', i.it->>'cat', (i.it->>'mins')::int
from planners p
cross join lateral jsonb_array_elements(p.data->'design'->'items') with ordinality as i(it, ord)
where not exists (select 1 from profiles pr where pr.user_id = p.user_id);

-- Profiles last: its existence is the "already migrated" marker above.
insert into profiles (user_id, notes, design_wake_min)
select p.user_id, coalesce(p.data->>'notes', ''), coalesce((p.data->'design'->>'wake')::int, 300)
from planners p
where not exists (select 1 from profiles pr where pr.user_id = p.user_id);
