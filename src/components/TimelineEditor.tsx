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
 * to reorder, drag its bottom edge to resize in 30-min snaps, − / ＋ / ✕ on
 * the card. Gaps before anchored items render as open space. External chips
 * can be dropped anywhere; the payload is passed through to `onDropExternal`.
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
  buckets,
}: {
  items: TimelineItem[]
  startAt?: number
  onSetMins: (id: string, mins: number) => void
  /** When given, anchored cards get a top handle that shifts their pinned start. */
  onSetStart?: (id: string, startMin: number) => void
  onReorder: (orderedIds: string[]) => void
  onRemove: (id: string) => void
  onTitleClick?: (id: string) => void
  onDropExternal?: (payload: string, insertIdx: number) => void
  emptyHint?: string
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

  const live = items.map((it) =>
    resizing?.id === it.id
      ? resizing.mode === 'end'
        ? { ...it, durMin: resizing.val }
        : { ...it, startMin: resizing.val }
      : it,
  )
  const layout = resolve(live, startAt)

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
      onDropExternal?.(s, at)
    }
  }

  // Card moving is pointer-based (works on touch, where HTML5 DnD does not).
  // The live values sit in a ref so pointerup never reads a stale render.
  const moveRef = useRef<{ id: string; at: number } | null>(null)
  function startMove(e: PointerEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone (or synthetic) — dragging still works while over the list
    }
    moveRef.current = { id, at: insertIdxAt(e.clientY) }
    setDragId(id)
    setOverIdx(moveRef.current.at)
  }

  function moveMove(e: PointerEvent) {
    if (!moveRef.current) return
    moveRef.current.at = insertIdxAt(e.clientY)
    setOverIdx(moveRef.current.at)
  }

  function endMove() {
    const m = moveRef.current
    moveRef.current = null
    setDragId(null)
    setOverIdx(null)
    if (!m) return
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
    const val =
      resizing.mode === 'end'
        ? snap(resizing.orig + steps * SNAP)
        : Math.max(0, Math.min(1439 - SNAP, resizing.orig + steps * SNAP))
    if (val !== resizing.val) setResizing({ ...resizing, val })
  }

  function endResize() {
    if (!resizing) return
    const { id, mode, val, orig } = resizing
    setResizing(null)
    if (val === orig) return
    if (mode === 'end') onSetMins(id, val)
    else onSetStart?.(id, val)
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
      {layout.map(({ block: it, start, conflict }, i) => {
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
                (conflict ? ' conflict' : '') +
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
                    title="Edit details (label, notes, anchor)"
                    onClick={() => onTitleClick(it.id)}
                  >
                    {it.title}
                    {it.anchored ? <span className="text-[9px]"> 📌</span> : null}
                  </button>
                ) : (
                  <span className="title">
                    {it.title}
                    {it.anchored ? <span className="text-[9px]"> 📌</span> : null}
                  </span>
                )}
                <div className="stp">
                  <button title="30 min less" onClick={() => onSetMins(it.id, snap(it.durMin - SNAP))}>
                    −
                  </button>
                  <span className="hrs">{fmtDur(it.durMin)}</span>
                  <button title="30 min more" onClick={() => onSetMins(it.id, snap(it.durMin + SNAP))}>
                    ＋
                  </button>
                  <button className="x" title="Remove" onClick={() => onRemove(it.id)}>
                    ✕
                  </button>
                </div>
              </div>
              {it.anchored && onSetStart && (
                <div
                  className="rzt"
                  title="Drag to shift the pinned start time (30-min steps)"
                  draggable={false}
                  onDragStart={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onPointerDown={(e) => startResize(e, it.id, it.startMin, 'start')}
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
                onPointerDown={(e) => startResize(e, it.id, it.durMin, 'end')}
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
