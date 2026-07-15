import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ViewProps } from '../../App'
import { catStyles, depthClass, dowMon, fmt, fmtDur, resolve, stripeVar } from '../../lib/planner'
import { BlockModal, type EditingBlock } from './BlockModal'
import { DayEditor } from './DayEditor'

const ROW_H = 30 // fixed row height — the week is a compact list, not a time grid
const HOLD_MS = 320 // touch long-press before a block starts moving

interface DragVis {
  id: string
  fromDow: number
  dx: number
  dy: number
  target: { dow: number; idx: number } | null
}

export function WeekView({ data, actions, today }: ViewProps) {
  const [editing, setEditing] = useState<EditingBlock | null>(null)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [dragVis, setDragVis] = useState<DragVis | null>(null)
  const todayDow = dowMon(today)
  const styles = catStyles(data.buckets)

  const resolved = data.blocksByDow.map((blocks) => resolve(blocks))

  // ----- drag a block across the list grid (pointer-based, touch-friendly) -----

  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  // Drag state lives in a ref (always current at pointerup); dragVis mirrors it for rendering.
  const press = useRef<{
    id: string
    dow: number
    startX: number
    startY: number
    timer: number | null
    active: boolean
    anchored: boolean
    rects: (DOMRect | null)[]
    target: { dow: number; idx: number } | null
  } | null>(null)
  const suppressClick = useRef(false)
  const blockScroll = useRef<((ev: TouchEvent) => void) | null>(null)

  function insertIdxAt(dow: number, clientY: number): number {
    const rect = press.current?.rects[dow]
    if (!rect) return data.blocksByDow[dow].length
    const idx = Math.round((clientY - rect.top) / ROW_H)
    return Math.max(0, Math.min(data.blocksByDow[dow].length, idx))
  }

  function dayAt(clientX: number): number {
    const rects = press.current?.rects ?? []
    let best = 0
    let bestDist = Infinity
    for (let d = 0; d < rects.length; d++) {
      const r = rects[d]
      if (!r) continue
      if (clientX >= r.left && clientX <= r.right) return d
      const dist = clientX < r.left ? r.left - clientX : clientX - r.right
      if (dist < bestDist) {
        bestDist = dist
        best = d
      }
    }
    return best
  }

  function activate(e: { clientX: number; clientY: number }) {
    const p = press.current
    if (!p || p.active) return
    p.active = true
    p.rects = colRefs.current.map((el) => el?.getBoundingClientRect() ?? null)
    // stop the page from scrolling while a block is in hand (touch)
    const blocker = (ev: TouchEvent) => ev.preventDefault()
    window.addEventListener('touchmove', blocker, { passive: false })
    blockScroll.current = blocker
    navigator.vibrate?.(30)
    const dow = dayAt(e.clientX)
    p.target = { dow, idx: insertIdxAt(dow, e.clientY) }
    setDragVis({ id: p.id, fromDow: p.dow, dx: 0, dy: 0, target: p.target })
  }

  function cleanupPress() {
    const p = press.current
    if (p?.timer) clearTimeout(p.timer)
    if (blockScroll.current) {
      window.removeEventListener('touchmove', blockScroll.current)
      blockScroll.current = null
    }
    press.current = null
    setDragVis(null)
  }

  function onBlockDown(e: ReactPointerEvent, dow: number, id: string) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone (or synthetic) — dragging still works while over the grid
    }
    const p = {
      id,
      dow,
      startX: e.clientX,
      startY: e.clientY,
      timer: null as number | null,
      active: false,
      anchored: data.blocksByDow[dow].find((b) => b.id === id)?.anchored ?? false,
      rects: [] as (DOMRect | null)[],
      target: null as { dow: number; idx: number } | null,
    }
    press.current = p
    if (e.pointerType !== 'mouse') {
      const { clientX, clientY } = e
      p.timer = window.setTimeout(() => activate({ clientX, clientY }), HOLD_MS)
    }
  }

  function onBlockMove(e: ReactPointerEvent) {
    const p = press.current
    if (!p) return
    const dx = e.clientX - p.startX
    const dy = e.clientY - p.startY
    if (!p.active) {
      const dist = Math.hypot(dx, dy)
      if (e.pointerType === 'mouse' && dist > 4) activate(e)
      // touch: moving before the hold means the user is scrolling — let go
      else if (e.pointerType !== 'mouse' && dist > 10) cleanupPress()
      if (!press.current?.active) return
    }
    e.preventDefault()
    const p2 = press.current!
    const dow = dayAt(e.clientX)
    p2.target = { dow, idx: insertIdxAt(dow, e.clientY) }
    setDragVis({ id: p2.id, fromDow: p2.dow, dx, dy, target: p2.target })
  }

  async function onBlockUp() {
    const p = press.current
    if (!p) return
    if (!p.active) {
      cleanupPress()
      return // plain tap — let the click handler open the editor
    }
    suppressClick.current = true
    const { id, dow: fromDow, anchored, target: t } = p
    cleanupPress()
    if (!t) return
    if (t.dow === fromDow) {
      const fromIdx = data.blocksByDow[fromDow].findIndex((b) => b.id === id)
      const ids = data.blocksByDow[fromDow].map((b) => b.id).filter((x) => x !== id)
      const idx = fromIdx >= 0 && fromIdx < t.idx ? t.idx - 1 : t.idx
      ids.splice(Math.min(idx, ids.length), 0, id)
      const changed = ids.some((x, i) => x !== data.blocksByDow[fromDow][i]?.id)
      if (!changed) return
      if (anchored) {
        // A pinned block dropped into a new slot re-pins right after the row
        // above it (or takes the day's start when dropped on top). The rest
        // of the day is laid out *without* the dragged block so the new pin
        // reflects where things flow once it leaves its old slot.
        const others = resolve(data.blocksByDow[fromDow].filter((b) => b.id !== id))
        const newIdx = ids.indexOf(id)
        const prev = newIdx > 0 ? others[newIdx - 1] : null
        const startMin = prev ? prev.start + prev.block.durMin : others[0]?.start ?? 300
        await actions.updateBlock(id, { startMin: Math.min(1439, startMin) })
      }
      await actions.reorderBlocks(fromDow, ids)
    } else {
      const ids = data.blocksByDow[t.dow].map((b) => b.id)
      ids.splice(Math.min(t.idx, ids.length), 0, id)
      await actions.moveBlock(id, t.dow, ids)
    }
  }

  return (
    <div>
      <div className="view-head mb-[18px]">
        <h2>The week</h2>
        <p>
          Your standing rhythm and this week's plan in one place. Click a day to design it; hold and drag a
          block to move it — 📌 anchors hold their time, ▲ deep work is saturated.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap gap-x-[15px] gap-y-[7px]">
        {data.buckets.map((bk) => (
          <span key={bk.id} className={`legend-chip s-${bk.cat}`} style={stripeVar(styles[bk.cat])}>
            <span className="dot" />
            {bk.name}
          </span>
        ))}
      </div>
      <div className="week week-list">
        {data.days.map((day, di) => (
          <div key={di} className={'day' + (di === todayDow ? ' today' : '')}>
            <div className="day-head">
              <span className="dname">{day.name}</span>
              <span className="flex items-center gap-1">
                <span className="dtag">{day.loc}</span>
                <button className="bk-edit" title="Edit day" onClick={() => setEditingDay(di)}>
                  ✎
                </button>
              </span>
            </div>
            <div
              className="wrows"
              ref={(el) => {
                colRefs.current[di] = el
              }}
            >
              {resolved[di].map(({ block: b, start, conflict }) => {
                const isDragging = dragVis?.id === b.id
                const tip = `${fmt(start)} · ${fmtDur(b.durMin)} — ${b.title}${b.detail ? '\n' + b.detail : ''}`
                return (
                  <div
                    key={b.id}
                    className={`wrow s-${b.cat}${depthClass(b.deep)}${b.cat === 'open' ? ' is-open' : ''}${conflict ? ' conflict' : ''}${isDragging ? ' dragging' : ''}`}
                    style={{
                      ...stripeVar(styles[b.cat]),
                      height: ROW_H,
                      ...(isDragging && {
                        transform: `translate(${dragVis.dx}px, ${dragVis.dy}px)`,
                        zIndex: 20,
                        position: 'relative' as const,
                      }),
                    }}
                    tabIndex={0}
                    title={tip}
                    onPointerDown={(e) => onBlockDown(e, di, b.id)}
                    onPointerMove={onBlockMove}
                    onPointerUp={onBlockUp}
                    onPointerCancel={cleanupPress}
                    onClick={() => {
                      if (suppressClick.current) {
                        suppressClick.current = false
                        return
                      }
                      setEditingDay(di)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setEditingDay(di)
                      }
                    }}
                  >
                    <span className="t">{fmt(start)}</span>
                    <span className="nm">
                      {b.title}
                      {b.anchored ? <span className="text-[8px]"> 📌</span> : null}
                    </span>
                    <span className="d">{fmtDur(b.durMin)}</span>
                  </div>
                )
              })}
              {dragVis?.target?.dow === di && (
                <div className="drop-line" style={{ top: dragVis.target.idx * ROW_H }} />
              )}
            </div>
            <div className="p-[6px_8px]">
              <button className="add-block" onClick={() => setEditingDay(di)}>
                ✎ Design day
              </button>
            </div>
          </div>
        ))}
      </div>
      {editingDay !== null && (
        <DayEditor
          data={data}
          actions={actions}
          dow={editingDay}
          onClose={() => setEditingDay(null)}
          onEditBlock={(blockId) => setEditing({ dow: editingDay, blockId })}
        />
      )}
      {editing && (
        <BlockModal data={data} actions={actions} editing={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
