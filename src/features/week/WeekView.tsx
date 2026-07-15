import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ViewProps } from '../../App'
import { CATS, dowMon, fmt, fmtDur, resolve, type Cat } from '../../lib/planner'
import { BlockModal, type EditingBlock } from './BlockModal'
import { DayEditor } from './DayEditor'

const PXMIN = 38 / 30 // 30 min = 38px, shared across all days
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

  const resolved = data.blocksByDow.map((blocks) => resolve(blocks))
  let axisStart: number | null = null
  let axisEnd: number | null = null
  for (const res of resolved) {
    if (!res.length) continue
    const s = res[0].start
    const e = res[res.length - 1].start + res[res.length - 1].block.durMin
    if (axisStart === null || s < axisStart) axisStart = s
    if (axisEnd === null || e > axisEnd) axisEnd = e
  }
  if (axisStart === null || axisEnd === null) {
    axisStart = 300
    axisEnd = 1320
  }
  const spanPx = Math.round((axisEnd - axisStart) * PXMIN)
  const hourPx = Math.round(60 * PXMIN)
  const gridBg = `repeating-linear-gradient(to bottom, var(--line-soft) 0, var(--line-soft) 1px, transparent 1px, transparent ${hourPx}px)`

  const hourLabels: number[] = []
  for (let mm = Math.ceil(axisStart / 60) * 60; mm <= axisEnd; mm += 60) hourLabels.push(mm)

  // ----- drag a block across the grid (pointer-based, touch-friendly) -----

  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  // Drag state lives in a ref (always current at pointerup); dragVis mirrors it for rendering.
  const press = useRef<{
    id: string
    dow: number
    startX: number
    startY: number
    timer: number | null
    active: boolean
    rects: (DOMRect | null)[]
    target: { dow: number; idx: number } | null
  } | null>(null)
  const suppressClick = useRef(false)
  const blockScroll = useRef<((ev: TouchEvent) => void) | null>(null)

  function insertIdxAt(dow: number, clientY: number): number {
    const rect = press.current?.rects[dow]
    if (!rect) return data.blocksByDow[dow].length
    const y = clientY - rect.top
    const res = resolved[dow]
    for (let i = 0; i < res.length; i++) {
      const mid = (res[i].start + res[i].block.durMin / 2 - axisStart!) * PXMIN
      if (y < mid) return i
    }
    return res.length
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
    const { id, dow: fromDow, target: t } = p
    cleanupPress()
    if (!t) return
    if (t.dow === fromDow) {
      const fromIdx = data.blocksByDow[fromDow].findIndex((b) => b.id === id)
      const ids = data.blocksByDow[fromDow].map((b) => b.id).filter((x) => x !== id)
      const idx = fromIdx >= 0 && fromIdx < t.idx ? t.idx - 1 : t.idx
      ids.splice(Math.min(idx, ids.length), 0, id)
      if (ids.some((x, i) => x !== data.blocksByDow[fromDow][i]?.id))
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
          block to move it — 📌 anchors hold their time, everything between re-flows.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap gap-x-[15px] gap-y-[7px]">
        {(Object.keys(CATS) as Cat[])
          .filter((k) => k !== 'life' && k !== 'open')
          .map((k) => (
            <span key={k} className={`legend-chip s-${k}`}>
              <span className="dot" />
              {CATS[k]}
            </span>
          ))}
      </div>
      <div className="week">
        <div>
          <div className="day-head" style={{ borderBottomColor: 'transparent', background: 'transparent' }}>
            <span className="gname">Time</span>
          </div>
          <div className="blocks" style={{ height: spanPx }}>
            {hourLabels.map((mm) => (
              <div key={mm} className="hourlab" style={{ top: Math.round((mm - axisStart!) * PXMIN) }}>
                {fmt(mm)}
              </div>
            ))}
          </div>
        </div>
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
              className="blocks"
              ref={(el) => {
                colRefs.current[di] = el
              }}
              style={{ height: spanPx, background: gridBg }}
            >
              {resolved[di].map(({ block: b, start, conflict }) => {
                const top = Math.round((start - axisStart!) * PXMIN)
                const hpx = Math.round(b.durMin * PXMIN)
                const lines = Math.max(1, Math.floor((hpx - 4) / 14))
                const tip = `${fmt(start)} · ${fmtDur(b.durMin)} — ${b.title}${b.detail ? '\n' + b.detail : ''}`
                const isDragging = dragVis?.id === b.id
                return (
                  <div
                    key={b.id}
                    className={`block s-${b.cat}${b.cat === 'open' ? ' is-open' : ''}${conflict ? ' conflict' : ''}${isDragging ? ' dragging' : ''}`}
                    style={{
                      top,
                      height: hpx,
                      ...(isDragging && {
                        transform: `translate(${dragVis.dx}px, ${dragVis.dy}px)`,
                        zIndex: 20,
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
                    <div className="title" style={{ WebkitLineClamp: lines }}>
                      {b.title}
                      {b.anchored ? <span className="text-[8px]"> 📌</span> : null}
                    </div>
                  </div>
                )
              })}
              {dragVis?.target?.dow === di && (
                <div
                  className="drop-line"
                  style={{
                    top:
                      dragVis.target.idx < resolved[di].length
                        ? Math.round((resolved[di][dragVis.target.idx].start - axisStart!) * PXMIN)
                        : resolved[di].length
                          ? Math.round(
                              (resolved[di][resolved[di].length - 1].start +
                                resolved[di][resolved[di].length - 1].block.durMin -
                                axisStart!) *
                                PXMIN,
                            )
                          : 0,
                  }}
                />
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
