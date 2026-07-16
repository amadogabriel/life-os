-- Freeze what a completed block actually was at check-off time, so a finished
-- day stays a faithful record even after its weekday template is later edited
-- (previously a check-off only pointed at the mutable template by id, so past
-- days silently rewrote when a template changed).

alter table block_logs add column title   text    not null default '';
alter table block_logs add column cat     text    not null default '';
alter table block_logs add column dur_min int     not null default 0;
alter table block_logs add column deep    boolean not null default false;

-- One-time best-effort backfill from the current template values. Approximate
-- for rows whose template has since changed, but the best we can reconstruct.
update block_logs bl
set title   = b.title,
    cat     = b.cat,
    dur_min = b.dur_min,
    deep    = b.deep
from blocks b
where b.id = bl.block_id
  and bl.title = '';
