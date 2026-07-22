# The edited block wins its slot: neighbors are pushed, then shrunk

**Amends [ADR-0007](./0007-concrete-layout-no-anchoring.md)** — keeps its
concrete-start, no-anchoring, no-reflow model, but replaces its *"No overlap,
enforced at the edit"* clause (a resize/move stopped dead at the adjacent block;
to grow into a neighbor you first shrank or moved that neighbor by hand).

## Context

Under ADR-0007 every edit was clamped by its neighbors. Retiming or growing a
block into an occupied slot did nothing until you manually made room. In
practice that meant a lot of shuffling to insert or lengthen a block in a full
day — the opposite of the calendar feel the timeline is going for.

## Decision

The block you are editing **wins its slot**. A move or resize goes exactly where
you drag it; the block it runs into is **displaced**, not a wall:

- **Slide, else shrink.** The displaced neighbor moves in the push direction if
  it has room; if it's boxed in, it shrinks — its near edge recedes to make room
  while its far edge holds.
- **The chip beyond it is the wall — no cascade.** Displacement stops at the
  *next* chip. The neighbor shrinks against it rather than pushing it too. If the
  far end is open (only the day boundary), the neighbor just slides; it only
  shrinks when a chip actually blocks it. ("Another chip at the other end → it
  shrinks; none → it just moves.")
- **A floor of `MIN_DUR` (30 min).** A pushed neighbor never shrinks below 30
  min; the mover is capped so it can't crush it past that.
- **Still no overlap, still concrete starts.** The invariant from ADR-0007
  holds — blocks never overlap and each carries its own start. What changed is
  *how* the edit resolves a collision: it displaces rather than refusing.

Applies uniformly to every edit path in `TimelineEditor`: dragging a card to
retime it, dragging the top edge (retime start), dragging the bottom edge or
tapping ＋ (grow duration). Shrinking a block (−, or dragging an edge inward)
touches nothing else. Dropping an *external* chip still lands in open space
(clamped into the slot, ADR-0007 style) rather than pushing — you drop chips
into gaps, you push existing ones by dragging.

The resolution is a pure function (`pushLayout`) computed in the editor; a
collision writes the mover plus at most one neighbor.

## Consequences

- Inserting/lengthening in a packed day is one gesture, not a pre-clearing ritual.
- An edit can now change a second block (the pushed neighbor). Persisted as an
  extra write; the optimistic cache merges by id so the neighbor's start and
  duration both land.
- No cascade keeps it predictable — you always know exactly which one block
  yields — at the cost of not rippling a whole stack out of the way in one drag.

## Considered and rejected

- **Cascade the push** (each displaced block shoves the next). Rejected for now:
  less predictable, and a single-neighbor rule matches how the interaction was
  described. Revisit if "shrink against the wall" feels too eager in dense days.
- **Keep the ADR-0007 hard clamp.** Rejected: it's the friction this amends.
