# Deep/shallow Containers hold an Agenda of tasks

A Block can now be a **Container** — a reserved chunk (e.g. "Engineering deep block")
you fill per-day with tasks — instead of only being its own content. We picked a
specific shape for this out of several real alternatives:

- **An Agenda item is a Dated one-off parented to the Container, not a new entity or a
  reference-copy.** Filling a Container = giving any Log Entry (Sprint card, Backlog/Inbox
  card, or an ad-hoc one-off) an `on_date` + a parent-Container link. One source of truth,
  reusing existing Dated-one-off machinery. The rejected alternative — a pointer that keeps
  the card on the Board as a second copy — invites two-representations-out-of-sync drift.
- **Agenda items carry order, not duration.** The Container stays a single span; its items
  are an ordered checklist worked in priority order (reusing `reorderWithinSlots`). We
  rejected sub-timing each item (a timeline inside the block) — it re-imports the shallow
  micro-scheduling a deep block exists to escape, and complicates re-flow.
- **The Block owns the hours; completions own project progress.** Because items have no
  duration, hours can't be split by an item's Bucket. So the weekly review has two lenses:
  **Depth/time** (hours + deep sessions by the *Block's* Bucket) and **Throughput**
  (completions by Project/Sprint). A Math task done in a Work Container is a Work deep-hour
  *and* a Math completion — both true, no arbitrary time-splitting.
- **Container-ness is orthogonal to Deep.** Shallow Containers exist (batched email/admin,
  Newport's shallow lane) and never touch the deep scoreboard.

Naming: we deliberately did **not** call this "slotting." `slot` already means a timeline
landing position (`scheduleSlot`, `reorderWithinSlots`); overloading it would mislead every
future reader. The canonical terms are **Container**, **Agenda**, and **Agenda item**.

Consequence — `block_id` is overloaded. On a Log Entry it meant "materialized *from* this
Block" (1:1); it now also means "Agenda item *under* this Container" (N:1), and a Container's
parent line shares `block_id` with its children. Parent and child must be distinguished by
role, not by the column alone — the same hazard, and the same resolution, as `position` vs
**Board position** (ADR-0005).
