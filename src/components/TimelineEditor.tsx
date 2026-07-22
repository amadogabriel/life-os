import { useRef, useState, type DragEvent, type PointerEvent } from 'react'
import { blockStyle, depthClass, fmt, fmtDur, resolve, stripeVar, type BucketColor, type Cat } from '../lib/planner'

export interface TimelineItem {
  id: string
  // `bucketId` drives live per-bucket color resolution (with `buckets` below);
  // null = Unassigned. `cat` is the stamped derived fallback palette key.
  bucketId?: string | null
  cat: string
  title: string
  startMin: number
  durMin: number
  anchored: boolean
  deep?: boolean
}

const PXMIN = 26 / 30 // slightly denser than the week grid — more day per screen
const SNAP = 30
const MIN_DUR = 30
const MAX_DUR = 960
const PAD = 20 // px of breathing room above/below the timeline

const snap = (mins: number) => Math.min(MAX_DUR, Math.max(MIN_DUR, Math.round(mins / SNAP) * SNAP))

/**
 * Proportional day timeline (week-view-look blocks) with editing: drag a card
 * to retime it (its start moves where you drop it), drag its bottom edge to
 * resize in 30-min snaps, drag its top edge to move its start, − / ＋ / ✕ on
 * the card. Every block sits at its own concrete start (ADR-0007). The edited
 * block wins its slot: when a move or resize runs into a neighbor, that
 * neighbor is displaced — it slides away if it has room, else it shrinks
 * against the chip beyond it, which holds still as a wall (ADR-0008; no
 * cascade). Unclaimed time renders as a Gap. External chips can be dropped
 * anywhere; the payload is passed through to `onDropExternal`.
 */
export function TimelineEditor({
  items,
  startAt,
  onSetMins,
  onSetStart,
  onReorder,
  onRemove,
  onTitleClick,
  onDropExternal,
  emptyHint = 'Tap a task chip (or drag it here) to add.',
  newItemDurMin = 60,
  buckets,
}: {
  items: TimelineItem[]
  startAt?: number
  onSetMins: (id: string, mins: number) => void
  /** When given, cards can be retimed: dragging the card body or its top handle
   *  writes the block's new concrete start (ADR-0007). Absent → cards reorder by
   *  index instead. */
  onSetStart?: (id: string, startMin: number) => void
  onReorder: (orderedIds: string[]) => void
  onRemove: (id: string) => void
  onTitleClick?: (id: string) => void
  /** `startMin` is the clock time under the drop, clamped into the open slot it
   *  landed in so the new item never overlaps a neighbor (ADR-0007). */
  onDropExternal?: (payload: string, insertIdx: number, startMin: number) => void
  emptyHint?: string
  /** Duration assumed for an externally-dropped chip when clamping its dropped
   *  start into a gap (matches the placed-chip default). */
  newItemDurMin?: number
  /** Items resolve color LIVE per-item through their `bucketId` (see
   *  `blockStyle`) — kills first-bucket-wins; null bucket = Unassigned gray. */
  buckets: BucketColor[]
}) {
  const itemStyle = (it: TimelineItem) =>
    stripeVar(blockStyle({ bucketId: it.bucketId ?? null, cat: it.cat as Cat }, buckets))
  const [dragId, setDragId] = useState<string | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [resizing, setResizing] = useState<{
    id: string
    mode: 'end' | 'start'
    val: number
    startY: number
    orig: number
  } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // The live target of a pointer retime sits in a ref so pointerup never reads a
  // stale render; `overIdx` state drives the re-render as it moves.
  const moveRef = useRef<{ id: string; at: number; startMin: number } | null>(null)

  /** Place block `id` at [start, start+dur] — the edited block always wins its
   *  slot — then displace the one neighbor it runs into: that neighbor slides
   *  away if it has room, else it shrinks against the chip beyond it, which
   *  holds still as a wall (ADR-0008; no cascade past that wall). Returns the
   *  full list with the mover (and at most one neighbor) retimed/resized. */
  function pushLayout(id: string, start: number, dur: number): TimelineItem[] {
    const self = items.find((x) => x.id === id)
    if (!self) return items
    dur = Math.max(MIN_DUR, Math.min(MAX_DUR, dur))
    const oldStart = self.startMin
    const oldEnd = oldStart + self.durMin
    // A non-overlapping layout partitions cleanly into blocks wholly above and
    // wholly below the edited one; nearest neighbor first.
    const others = items.filter((x) => x.id !== id)
    const below = others.filter((o) => o.startMin >= oldEnd).sort((a, b) => a.startMin - b.startMin)
    const above = others.filter((o) => o.startMin + o.durMin <= oldStart).sort((a, b) => b.startMin - a.startMin)
    const isResizeEnd = start === oldStart && dur !== self.durMin

    let s = Math.max(0, Math.min(1439 - dur, start))
    let e = s + dur
    const changes = new Map<string, { startMin: number; durMin: number }>()

    if (e > oldEnd && below.length) {
      // Bottom edge advanced into the block below — push it down.
      const B = below[0]
      const wall = below[1] ? below[1].startMin : 1439
      e = Math.min(e, wall - MIN_DUR) // leave the pushed neighbor at least MIN_DUR
      if (!isResizeEnd) s = e - dur // a move keeps its duration; a bottom-resize keeps its top
      if (e > B.startMin) {
        const bEnd = Math.min(e + B.durMin, wall) // slides, or shrinks against the wall
        changes.set(B.id, { startMin: e, durMin: bEnd - e })
      }
    } else if (s < oldStart && above.length) {
      // Top edge retreated into the block above — push it up.
      const B = above[0]
      const wall = above[1] ? above[1].startMin + above[1].durMin : 0
      s = Math.max(s, wall + MIN_DUR)
      e = s + dur
      if (s < B.startMin + B.durMin) {
        const bStart = Math.max(s - B.durMin, wall)
        changes.set(B.id, { startMin: bStart, durMin: s - bStart })
      }
    }

    changes.set(id, { startMin: s, durMin: e - s })
    return items.map((it) => {
      const c = changes.get(it.id)
      return c ? { ...it, startMin: c.startMin, durMin: c.durMin } : it
    })
  }

  /** Persist a push edit: write the mover and any pushed neighbor (start and/or
   *  duration). The neighbor's two fields go as sequential writes — the
   *  optimistic cache merges by id, so both land. */
  function commitEdit(id: string, start: number, dur: number) {
    for (const it of pushLayout(id, start, dur)) {
      const orig = items.find((o) => o.id === it.id)
      if (!orig) continue
      if (it.startMin !== orig.startMin) onSetStart?.(it.id, it.startMin)
      if (it.durMin !== orig.durMin) onSetMins(it.id, it.durMin)
    }
  }

  // Live preview: a resize shows the mover AND the neighbor it pushes. (A move
  // previews via the insertion indicator, not a card-follow — repositioning the
  // card mid-drag could shift `axisStart` and make the drag jumpy; the push
  // lands on drop.)
  let displayItems: TimelineItem[] = items
  if (resizing) {
    const cur = items.find((x) => x.id === resizing.id)
    displayItems =
      resizing.mode === 'end'
        ? pushLayout(resizing.id, cur?.startMin ?? 0, resizing.val)
        : pushLayout(resizing.id, resizing.val, cur?.durMin ?? MIN_DUR)
  }
  const layout = resolve(displayItems)

  const axisStart = layout.length ? Math.min(startAt ?? Infinity, layout[0].start) : (startAt ?? 300)
  const end = layout.length ? layout[layout.length - 1].start + layout[layout.length - 1].block.durMin : null
  const spanPx = end !== null ? Math.round((end - axisStart) * PXMIN) : 120
  const yOf = (min: number) => PAD + Math.round((min - axisStart) * PXMIN)

  const hourLabels: number[] = []
  if (end !== null) for (let mm = Math.ceil(axisStart / 60) * 60; mm <= end; mm += 60) hourLabels.push(mm)
  const hourPx = Math.round(60 * PXMIN)
  const gridBg = `repeating-linear-gradient(to bottom, var(--line-soft) 0, var(--line-soft) 1px, transparent 1px, transparent ${hourPx}px)`
  const gridOffset = PAD - Math.round(((axisStart % 60) + 60) % 60 * PXMIN)

  /** Insertion index for a pointer at client Y — by card midpoints. */
  function insertIdxAt(clientY: number): number {
    const rect = bodyRef.current?.getBoundingClientRect()
    if (!rect) return items.length
    const y = clientY - rect.top
    for (let i = 0; i < layout.length; i++) {
      if (y < yOf(layout[i].start) + (layout[i].block.durMin * PXMIN) / 2) return i
    }
    return items.length
  }

  function orderWith(id: string, at: number): string[] {
    const from = items.findIndex((it) => it.id === id)
    const ids = items.map((it) => it.id).filter((x) => x !== id)
    const idx = from >= 0 && from < at ? at - 1 : at
    ids.splice(Math.min(idx, ids.length), 0, id)
    return ids
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault()
    setOverIdx(insertIdxAt(e.clientY))
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const at = overIdx ?? items.length
    setOverIdx(null)
    setDragId(null)
    const s = e.dataTransfer.getData('text/plain')
    if (!s) return
    if (s.startsWith('tl|')) {
      const id = s.slice(3)
      const ids = orderWith(id, at)
      if (ids.some((x, i) => x !== items[i]?.id)) onReorder(ids)
    } else {
      // Land the chip at the clock time it was dropped on, clamped into the
      // open slot there so it doesn't overlap a neighbor (ADR-0007).
      onDropExternal?.(s, at, slotStart('', newItemDurMin, timeAt(e.clientY)))
    }
  }

  // Dragging a card **retimes** it (calendar-style) — its start moves to
  // wherever it is dropped and the block it lands on is pushed aside (ADR-0008).
  // Pointer-based (works on touch, where HTML5 DnD does not). Falls back to
  // index reordering only when the surface has no start editing (`onSetStart`).
  /** Snapped clock time under a pointer Y, clamped to the day. */
  function timeAt(clientY: number): number {
    const rect = bodyRef.current?.getBoundingClientRect()
    const y = rect ? clientY - rect.top : PAD
    const mins = axisStart + (y - PAD) / PXMIN
    return Math.max(0, Math.min(1439, Math.round(mins / SNAP) * SNAP))
  }
  /** Clamp a retimed start into the gap it's dropped into so the block never
   *  overlaps a neighbor (ADR-0007). Walks the other blocks in start order:
   *  anything ending before the drop raises the floor, the first block at/after
   *  it sets the ceiling (minus this block's duration). */
  function slotStart(id: string, dur: number, desired: number): number {
    let lo = 0
    let hi = 1439 - dur
    for (const { block: o } of layout) {
      if (o.id === id) continue
      const oEnd = o.startMin + o.durMin
      if (o.startMin >= desired) {
        hi = Math.min(hi, o.startMin - dur)
        break
      }
      if (oEnd > lo) lo = oEnd // ends before the drop (or straddles it) → floor
    }
    return Math.min(Math.max(desired, lo), Math.max(lo, hi))
  }
  function startMove(e: PointerEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone (or synthetic) — dragging still works while over the list
    }
    moveRef.current = { id, at: insertIdxAt(e.clientY), startMin: timeAt(e.clientY) }
    setDragId(id)
    setOverIdx(moveRef.current.at)
  }

  function moveMove(e: PointerEvent) {
    if (!moveRef.current) return
    moveRef.current.at = insertIdxAt(e.clientY)
    moveRef.current.startMin = timeAt(e.clientY)
    setOverIdx(moveRef.current.at)
  }

  function endMove() {
    const m = moveRef.current
    moveRef.current = null
    setDragId(null)
    setOverIdx(null)
    if (!m) return
    if (onSetStart) {
      const it = items.find((x) => x.id === m.id)
      if (it && m.startMin !== it.startMin) commitEdit(m.id, m.startMin, it.durMin)
      return
    }
    const ids = orderWith(m.id, m.at)
    if (ids.some((x, i) => x !== items[i]?.id)) onReorder(ids)
  }

  function startResize(e: PointerEvent, id: string, orig: number, mode: 'end' | 'start') {
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone (or synthetic) — resize still tracks while over the card
    }
    setResizing({ id, mode, val: mode === 'end' ? snap(orig) : orig, startY: e.clientY, orig })
  }

  function moveResize(e: PointerEvent) {
    if (!resizing) return
    const steps = Math.round((e.clientY - resizing.startY) / PXMIN / SNAP)
    // The edited block wins its slot; a neighbor it grows into is displaced in
    // pushLayout, so clamp only to day / duration bounds here.
    const val =
      resizing.mode === 'end'
        ? Math.max(MIN_DUR, Math.min(MAX_DUR, snap(resizing.orig + steps * SNAP)))
        : Math.max(0, Math.min(1439, resizing.orig + steps * SNAP))
    if (val !== resizing.val) setResizing({ ...resizing, val })
  }

  function endResize() {
    if (!resizing) return
    const { id, mode, val, orig } = resizing
    const it = items.find((x) => x.id === id)
    setResizing(null)
    if (val === orig || !it) return
    // 'end' resizes the duration; 'start' translates (keeps duration).
    if (mode === 'end') commitEdit(id, it.startMin, val)
    else commitEdit(id, val, it.durMin)
  }

  const indicatorY =
    overIdx === null ? null : overIdx < layout.length ? yOf(layout[overIdx].start) : end !== null ? yOf(end) : PAD

  return (
    <div
      ref={bodyRef}
      className="tl"
      style={{ height: spanPx + PAD * 2, background: gridBg, backgroundPosition: `0 ${gridOffset}px` }}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (e.target === e.currentTarget) setOverIdx(null)
      }}
      onDrop={onDrop}
    >
      {items.length === 0 && (
        <div className="p-[38px_16px] text-center text-[13px]" style={{ color: 'var(--ink-faint)' }}>
          {emptyHint}
        </div>
      )}
      {hourLabels.map((mm) => (
        <div key={mm} className="hourlab tl-hourlab" style={{ top: yOf(mm) }}>
          {fmt(mm)}
        </div>
      ))}
      {layout.map(({ block: it, start }, i) => {
        const prevEnd = i > 0 ? layout[i - 1].start + layout[i - 1].block.durMin : startAt ?? null
        const gap = prevEnd !== null && start > prevEnd ? start - prevEnd : 0
        const hpx = Math.round(it.durMin * PXMIN)
        return (
          <div key={it.id} className="contents">
            {gap > 0 && (
              <div className="tlgap" style={{ top: yOf(prevEnd!), height: Math.round(gap * PXMIN) }}>
                {fmtDur(gap)} open
              </div>
            )}
            <div
              className={
                `tlcard s-${it.cat}` +
                depthClass(it.deep ?? false) +
                (dragId === it.id ? ' dragging' : '') +
                (hpx <= 40 ? ' compact' : '')
              }
              style={{ ...itemStyle(it), top: yOf(start), height: hpx }}
            >
              <div
                className="dh"
                title="Drag to move"
                onPointerDown={(e) => startMove(e, it.id)}
                onPointerMove={moveMove}
                onPointerUp={endMove}
                onPointerCancel={() => {
                  moveRef.current = null
                  setDragId(null)
                  setOverIdx(null)
                }}
              >
                ⠿
              </div>
              <div className="row">
                {onTitleClick ? (
                  <button
                    className="title cursor-pointer border-0 bg-transparent p-0 text-left"
                    title="Edit details (label, notes)"
                    onClick={() => onTitleClick(it.id)}
                  >
                    {it.title}
                  </button>
                ) : (
                  <span className="title">{it.title}</span>
                )}
                <div className="stp">
                  <button title="30 min less" onClick={() => onSetMins(it.id, snap(it.durMin - SNAP))}>
                    −
                  </button>
                  <span className="hrs">{fmtDur(it.durMin)}</span>
                  {/* ＋ grows the duration and pushes the block below (ADR-0008). */}
                  <button title="30 min more" onClick={() => commitEdit(it.id, it.startMin, snap(it.durMin + SNAP))}>
                    ＋
                  </button>
                  <button className="x" title="Remove" onClick={() => onRemove(it.id)}>
                    ✕
                  </button>
                </div>
              </div>
              {onSetStart && (
                <div
                  className="rzt"
                  title="Drag to move the start time (30-min steps)"
                  draggable={false}
                  onDragStart={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onPointerDown={(e) =>
                    // Retime the start; pushLayout displaces the block above if
                    // this one moves up into it (ADR-0008).
                    startResize(e, it.id, start, 'start')
                  }
                  onPointerMove={moveResize}
                  onPointerUp={endResize}
                  onPointerCancel={() => setResizing(null)}
                />
              )}
              <div
                className="rz"
                title="Drag to resize (30-min steps)"
                draggable={false}
                onDragStart={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onPointerDown={(e) =>
                  // Grow the duration; pushLayout displaces the block below if
                  // this one grows down into it (ADR-0008).
                  startResize(e, it.id, it.durMin, 'end')
                }
                onPointerMove={moveResize}
                onPointerUp={endResize}
                onPointerCancel={() => setResizing(null)}
              />
            </div>
          </div>
        )
      })}
      {end !== null && (
        <div className="tlend" style={{ top: yOf(end) }}>
          <span>{fmt(end)} · end of day</span>
        </div>
      )}
      {indicatorY !== null && <div className="tl-indicator" style={{ top: indicatorY }} />}
    </div>
  )
}
