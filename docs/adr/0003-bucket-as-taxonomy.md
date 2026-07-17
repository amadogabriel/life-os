# Buckets are the taxonomy; categories retire to derived plumbing

The hardcoded `Cat` enum was doing three invisible jobs — coloring, stats
gating (`COUNTED`), and deep-work defaults — while **Buckets**, the user-curated
palette, sat 1:1 on top of it with a color picker that silently recolored the
whole category (first bucket per cat won, even with an empty color). We decided
**Bucket becomes the single user-facing taxonomy**: Blocks, Habits, and Log
Entries reference a Bucket (`bucket_id`, nullable = **Unassigned**, replacing
the `open` cat); color is per-bucket and resolves **live through the reference**
(recoloring a bucket restyles everything placed from it; deleting it reverts to
the fallback palette); stats and the weekly review group by bucket, gated by a
per-bucket **counted** flag (Life: `counted = false`, also what excludes it from
materialization, replacing the `cat <> 'life'` special case). History is
backfilled by matching each row's cat to its 1:1 bucket, creating missing
buckets (e.g. Life) during migration.

`cat` columns are **not dropped**: they are stamped from the bucket on write and
kept as derived legacy data so existing SQL, views, and the record's denormalized
history keep working. A future reader will find both columns — the bucket
reference is authoritative; `cat` is plumbing.

Bucket Tasks additionally carry **Traces** — independent, coexisting links to a
Habit and/or a Project/Sprint *container* (never an individual task; scheduling
specific sprint tasks stays with dated one-offs, ADR-0002 territory). A placed
traced task pre-links the Block (`habit_id`, `project_id`/`sprint_id`);
materialization stamps them onto the frozen Log Entry so check-offs log the
habit and hours accrue to the project. Deleting a trace's target **degrades the
task to vague** (set-null): the curated chip survives, the link dies.

## Considered options

- **Per-category color, honest UI** (make a bucket's custom color
  deterministically win for its cat). Rejected: cheap, but cements two
  overlapping taxonomies and keeps the picker's whole-category side effect.
- **Stats stay category-keyed; buckets are display-only lanes.** Rejected: the
  app would permanently explain both concepts; the category picker stays
  "doing nothing" visibly.
- **Trace to individual project tasks (log entries).** Rejected: one-shot, not
  reusable palette material, and duplicates dated one-offs.

## Consequences

- The backfill assumes the historical cat↔bucket 1:1 mapping is truthful; cats
  with no bucket get one created at migration time.
- `materialize_day` and the stats/report queries change their grouping key;
  this lands **after** the dated-weeks batch (#10–14) since both churn
  `blocks`, the resolver, and materialization.
- The `Cat` union in the client eventually becomes write-only glue; UI pickers
  for categories are removed once rapid-log and habits speak buckets.
