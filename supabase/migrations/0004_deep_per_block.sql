-- Deep work is a property of the individual block/task, not the bucket:
-- a Work bucket holds both "Engineering deep block" (deep) and
-- "Meetings" (shallow). buckets.deep stays but is no longer read.

alter table blocks add column deep boolean not null default false;
alter table bucket_tasks add column deep boolean not null default false;

-- Sensible starting point: study blocks and anything self-described as deep.
update blocks set deep = true
  where cat in ('math', 'thesis') or title ilike '%deep%';
update bucket_tasks set deep = true
  where name ilike '%deep%'
     or bucket_id in (select id from buckets where cat in ('math', 'thesis'));
