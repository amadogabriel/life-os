# Board position is a new field, not a reuse of `position`

Log Entry cards on the Board can now be reordered within a column (Inbox, a Project's
Backlog, or a Sprint). `log_entries.position` already exists but means "order on a
specific day's timeline" — it's shared with `reorderLogEntries` and the Planner's
drag-reorder, and is scoped by `on_date`. Reusing it for Board order would let the two
meanings collide for any task that is both scheduled to a day and sitting in a Project
column, where reordering one view would silently reorder the other. We added a
separate field instead (see Board position in CONTEXT.md), keeping `position`
unambiguous as day-timeline order everywhere in the codebase.
