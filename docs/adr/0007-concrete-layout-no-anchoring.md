# Blocks carry concrete starts; no anchoring, no re-flow

**Supersedes the layout model of [ADR-0002](./0002-planner-dated-weeks.md)** —
specifically its anchored/unanchored re-flow and its "past renders at stored
start, live re-flows" split.

## Context

The layout engine (`resolve()`) laid a day out by walking Blocks in `position`
order and **chaining**: an *unanchored* Block started where the previous one
ended; an *anchored* Block held its pinned start, and if a prior Block overran
it, it was pushed later and flagged **conflict**. A live day was rendered this
way. A **past** day, by the ADR-0002 amendment, was *not* re-flowed — it pinned
each entry at its **stored** `start_min`.

That split had a latent trap. For an unanchored entry the stored `start_min` was
never authoritative — the real position came from chaining and was recomputed on
every render, never written back. While a day was "today" the chaining hid the
stale stored starts. The moment the day rolled into the past, the render rule
flipped to "pin at stored start" and exposed them: a hand-organized, contiguous
day re-appeared the next morning scattered into gaps and overlaps. Nothing had
mutated the record overnight — the *rendering rule changed because the date
rolled over*. (Observed 2026-07-21 → 07-22.)

## Decision

Every Block (Template, fork, and each materialized Log Entry) carries a
**concrete start time** that is the single source of truth. The timeline renders
each Block exactly at its stored start, **identically whether the day is today or
in the past**. Concretely:

- **No anchoring.** The anchored/unanchored distinction is retired. Retired *in
  place*: code stops reading/writing `anchored`; the DB columns stay for now and
  are dropped in a later cleanup.
- **No chaining / no re-flow.** `resolve()` no longer moves a Block because a
  neighbor changed. A Block sits at its own start, full stop.
- **No overlap, enforced at the edit.** The editor bounds every resize by its
  neighbors: dragging a Block's edge stops at the adjacent Block. To grow into a
  neighbor you explicitly shrink or move that neighbor.
- **Gaps are allowed anywhere.** Free time is unclaimed space between two
  concrete Blocks; it is no longer tied to an anchor.
- **Conflict is removed.** With no anchoring and no push, the conflict state can
  never arise.

## Consequences

- The live-vs-past divergence is structurally impossible: one render rule.
- One-time data backfill required — existing Template/fork Blocks stored
  placeholder starts (unanchored Blocks defaulted to noon). Their concrete
  starts are baked by running the old chaining once and writing the result back.
- `position` decouples from time. Its remaining job is tie-break/ordering
  provenance, not layout.

## Considered and rejected

- **Make the past re-flow like live** (drop the ADR-0002 "don't re-flow the
  past" rule). Rejected: reopens the exact "history shifts under me" wound
  ADR-0002's amendment closed.
- **Persist the re-flowed starts on every live edit** while keeping the chaining
  engine. Rejected: keeps anchoring and its conflict machinery, writes on every
  reflow, and races with background nudges — more moving parts to get the same
  guarantee concrete starts give for free.
