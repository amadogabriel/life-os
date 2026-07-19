import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ViewProps } from '../../App'
import {
  addDays,
  blockStyle,
  depthClass,
  dowOfIso,
  fmt,
  fmtDur,
  isCounted,
  isoDate,
  manilaDate,
  planForDate,
  stripeVar,
  weekRange,
  type DayPlan,
  type PlanItem,
} from '../../lib/planner'
import { AgendaModal } from './AgendaModal'
import { BlockModal, type EditingBlock } from './BlockModal'
import { DayEditor } from './DayEditor'
import { ForkPromptModal } from './ForkPromptModal'
import { TodayEditor } from '../today/TodayEditor'
import { TodayEntryModal } from '../today/TodayEntryModal'

const PXMIN = 30 / 60 // fixed scale: 1 hour = 30px, so a 1h block = one compact row
const HOLD_MS = 320 // touch long-press before a block starts moving

interface DragVis {
  id: string
  fromDow: number
  dx: number
  dy: number
  /** `min` is the snapped drop time — used when re-pinning an anchored block. */
  target: { dow: number; idx: number; min: number } | null
}

/** A pending edit to a still-projected future day, awaiting the fork prompt's
 *  "Just this ⟨date⟩ / Every ⟨weekday⟩" answer (ADR-0002 ask-on-first-edit).
 *  Each handler owns its own forking: "Every" never forks; "Just this" forks
 *  only when a real edit actually lands (a drag drop forks-then-applies; the
 *  day editor defers the fork to its own first mutation), so answering "Just
 *  this" and then changing nothing leaves the day unforked. */
interface ForkPrompt {
  di: number // column index === dow
  /** "Every ⟨weekday⟩": apply the edit to the weekday Template, as before. */
  onEveryWeek: () => void | Promise<void>
  /** "Just this ⟨date⟩": fork this date (the handler forks when/if the edit lands). */
  onJustThis: () => void | Promise<void>
}

export function PlannerView({ data, actions, today }: ViewProps) {
  const [weekOffset, setWeekOffset] = useState(0)
  // "Focus: counted only" — hide uncounted (Life/Unassigned) items across every
  // column so a week shows just the counted work (ADR-0002 amendment). Default
  // off; while on, drag-edit is suspended (the visible set is a filtered subset,
  // so drop-index math wouldn't line up with the full plan).
  const [focusCounted, setFocusCounted] = useState(false)
  const [editing, setEditing] = useState<EditingBlock | null>(null)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editingFork, setEditingFork] = useState<string | null>(null) // ISO date of the fork being edited
  // A still-projected future day opened for editing after "Just this ⟨date⟩":
  // the editor previews the Template and forks the day on its first real edit.
  const [editingProjected, setEditingProjected] = useState<{ dow: number; dateIso: string } | null>(null)
  const [editingToday, setEditingToday] = useState(false)
  // A dated one-off being edited in its future day's column (entry-backed).
  const [editingEntry, setEditingEntry] = useState<{ id: string; dateIso: string } | null>(null)
  // Filling/managing a Container's per-day Agenda (ADR-0006) — a date-scoped
  // surface, distinct from editing the Template Block itself.
  const [editingAgenda, setEditingAgenda] = useState<{ blockId: string; dateIso: string; title: string } | null>(null)
  const [forkPrompt, setForkPrompt] = useState<ForkPrompt | null>(null)
  const [dragVis, setDragVis] = useState<DragVis | null>(null)

  const todayDate = manilaDate(today)
  const todayIso = isoDate(todayDate)
  const range = weekRange(todayDate, weekOffset)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(range.start, i))
  // The single seam: each column renders whatever the resolver says the date's
  // plan is — frozen past, live today, Template projection, or Day Plan fork.
  const dayPlans: DayPlan[] = dates.map((d) =>
    planForDate(
      { blocksByDow: data.blocksByDow, logEntries: data.logEntries, dayForks: data.dayForks },
      isoDate(d),
      todayIso,
    ),
  )
  // What each column actually renders: the full plan, or (Focus on) only its
  // counted items. Drives both the shared time axis and the columns, so the
  // axis shrinks to the counted hours when focused. Edit/drag routing still
  // reads `dayPlans` (the full plan) — safe because drag is off while focused.
  const shownPlans: DayPlan[] = focusCounted
    ? dayPlans.map((p) => ({ ...p, items: p.items.filter((it) => isCounted(it, data.buckets)) }))
    : dayPlans
  // Column index === dow (Mon = 0): the visible week is always Mon–Sun.
  const editableCol = (di: number) => dayPlans[di].source === 'projection'

  const dateLabel = (di: number) =>
    `${data.days[di].name.slice(0, 3)}, ${dates[di].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  /** Ask-on-first-edit for a still-projected future day: opening its editor
   *  first asks whether the edit is for just this date (fork) or the weekday
   *  Template. Today, past, and already-forked days never reach this. */
  function openProjectedDayEditor(di: number) {
    setForkPrompt({
      di,
      onEveryWeek: () => setEditingDay(di),
      // "Just this" opens the editor on the Template preview; it forks lazily on
      // the first mutation, so opening and closing it untouched forks nothing.
      onJustThis: () => setEditingProjected({ dow: di, dateIso: dayPlans[di].dateIso }),
    })
  }

  async function unfork(di: number) {
    if (
      window.confirm(
        `Un-fork ${dateLabel(di)}? Its custom plan is discarded and the date follows the ${data.days[di].name} Template again.`,
      )
    )
      await actions.unforkDay(dayPlans[di].dateIso)
  }

  let axisStart: number | null = null
  let axisEnd: number | null = null
  for (const plan of shownPlans) {
    if (!plan.items.length) continue
    const s = plan.items[0].start
    const e = plan.items[plan.items.length - 1].start + plan.items[plan.items.length - 1].durMin
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
  for (let mm = Math.ceil(axisStart / 120) * 120; mm <= axisEnd; mm += 120) hourLabels.push(mm)

  // ----- drag a block across the grid (pointer-based, touch-friendly) -----
  // Dragging exists on projection columns (Template blocks + one-offs) and,
  // for one-offs only, on fork columns. A Template block edits the weekday
  // Template (asking first — fork or every week); a dated one-off (entry-backed
  // item) re-times its own Log Entry — dropping pins it at the drop time,
  // cross-column moves its date. Past columns are read-only and today's plan
  // is edited via the Today editor.

  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  // Drag state lives in a ref (always current at pointerup); dragVis mirrors it for rendering.
  const press = useRef<{
    id: string // blockId for a Template block, entryId for a dated one-off
    entryId: string | null // set only when dragging a dated one-off
    dow: number
    startX: number
    startY: number
    timer: number | null
    active: boolean
    anchored: boolean
    grabDy: number // pointer offset from the block's top — drop time tracks the top edge
    rects: (DOMRect | null)[]
    target: { dow: number; idx: number; min: number } | null
  } | null>(null)
  const suppressClick = useRef(false)
  const blockScroll = useRef<((ev: TouchEvent) => void) | null>(null)

  function insertIdxAt(dow: number, clientY: number): number {
    const rect = press.current?.rects[dow]
    if (!rect) return data.blocksByDow[dow].length
    const y = clientY - rect.top
    const items = dayPlans[dow].items
    for (let i = 0; i < items.length; i++) {
      const mid = (items[i].start + items[i].durMin / 2 - axisStart!) * PXMIN
      if (y < mid) return i
    }
    return items.length
  }

  /** Snapped (30-min) time of the dragged block's top edge inside a day column. */
  function minuteAt(dow: number, clientY: number): number {
    const rect = press.current?.rects[dow]
    if (!rect) return axisStart!
    const raw = axisStart! + (clientY - (press.current?.grabDy ?? 0) - rect.top) / PXMIN
    return Math.max(0, Math.min(1410, Math.round(raw / 30) * 30))
  }

  function activate(e: { clientX: number; clientY: number }) {
    const p = press.current
    if (!p || p.active) return
    p.active = true
    p.rects = colRefs.current.map((el) => el?.getBoundingClientRect() ?? null)
    const homeRect = p.rects[p.dow]
    const startNow = dayPlans[p.dow].items.find((it) => (it.entryId ?? it.blockId) === p.id)?.start
    if (homeRect && startNow !== undefined)
      p.grabDy = p.startY - (homeRect.top + (startNow - axisStart!) * PXMIN)
    // stop the page from scrolling while a block is in hand (touch)
    const blocker = (ev: TouchEvent) => ev.preventDefault()
    window.addEventListener('touchmove', blocker, { passive: false })
    blockScroll.current = blocker
    navigator.vibrate?.(30)
    const dow = dayAt(e.clientX)
    p.target = { dow, idx: insertIdxAt(dow, e.clientY), min: minuteAt(dow, e.clientY) }
    setDragVis({ id: p.id, fromDow: p.dow, dx: 0, dy: 0, target: p.target })
  }

  /** Nearest droppable column — never a past or today column. Template blocks
   *  drop only on projection columns; a dated one-off can also land on a
   *  forked date (it rides on top of the fork the same way); a fork's own
   *  block stays within its column (retime/reorder only). */
  function dayAt(clientX: number): number {
    const rects = press.current?.rects ?? []
    let best = press.current?.dow ?? 0
    let bestDist = Infinity
    const droppable = (d: number) => {
      if (editableCol(d)) return true
      if (dayPlans[d].source !== 'fork') return false
      // Fork column: a one-off from anywhere, or this fork's own block in place.
      return press.current?.entryId != null || d === press.current?.dow
    }
    for (let d = 0; d < rects.length; d++) {
      const r = rects[d]
      if (!r || !droppable(d)) continue
      if (clientX >= r.left && clientX <= r.right) return d
      const dist = clientX < r.left ? r.left - clientX : clientX - r.right
      if (dist < bestDist) {
        bestDist = dist
        best = d
      }
    }
    return best
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

  function onBlockDown(e: ReactPointerEvent, dow: number, it: PlanItem) {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone (or synthetic) — dragging still works while over the grid
    }
    const p = {
      id: it.entryId ?? it.blockId!,
      entryId: it.entryId,
      dow,
      startX: e.clientX,
      startY: e.clientY,
      timer: null as number | null,
      active: false,
      // A one-off drop always pins at the drop time, so it previews (and
      // behaves) like an anchored block; Template and fork blocks keep their own
      // flag (the resolved item already carries it).
      anchored: it.entryId ? true : it.anchored,
      grabDy: 0,
      rects: [] as (DOMRect | null)[],
      target: null as { dow: number; idx: number; min: number } | null,
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
    p2.target = { dow, idx: insertIdxAt(dow, e.clientY), min: minuteAt(dow, e.clientY) }
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
    const { id, entryId, dow: fromDow, anchored, target: t } = p
    cleanupPress()
    if (!t) return
    if (entryId) {
      // Dated one-off: pin the Log Entry at the drop time; a cross-column
      // drop also moves it to that column's date. Never touches the Template.
      await actions.updateLogEntry(entryId, {
        startMin: t.min,
        anchored: true,
        ...(t.dow !== fromDow && { onDate: isoDate(dates[t.dow]) }),
      })
      return
    }
    const dateIso = dayPlans[fromDow].dateIso
    const srcIsFork = dayPlans[fromDow].source === 'fork'
    if (t.dow === fromDow) {
      // A drop inside a single day retimes/reorders that day's own plan. On a
      // projection column it edits the weekday Template → ask first ("just this
      // date" forks the day, then the same edit lands on the fork). On a fork
      // column it edits the fork's dated Blocks silently — the fork decision was
      // already made, so there is nothing to ask.
      const srcBlocks = srcIsFork ? (data.dayForks[dateIso] ?? []) : data.blocksByDow[fromDow]
      if (anchored) {
        // Vertical drag of a pinned block = move the pin to the drop time,
        // then keep positions sorted by the resulting times.
        const starts = new Map(dayPlans[fromDow].items.map((it) => [it.blockId, it.start]))
        starts.set(id, t.min)
        const ids = [...srcBlocks]
          .sort((a, b) => starts.get(a.id)! - starts.get(b.id)! || a.position - b.position)
          .map((b) => b.id)
        const orderChanged = ids.some((x, i) => x !== srcBlocks[i]?.id)
        const pinChanged = srcBlocks.find((b) => b.id === id)?.startMin !== t.min
        if (!orderChanged && !pinChanged) return // dropped where it was — no edit
        if (srcIsFork) {
          await actions.updateBlock(id, { startMin: t.min })
          if (orderChanged) await actions.reorderForkBlocks(dateIso, ids)
          return
        }
        setForkPrompt({
          di: fromDow,
          onEveryWeek: async () => {
            await actions.updateBlock(id, { startMin: t.min })
            if (orderChanged) await actions.reorderBlocks(fromDow, ids)
          },
          onJustThis: async () => {
            const idMap = await actions.forkDay(dateIso)
            if (!idMap[id]) return
            await actions.updateBlock(idMap[id], { startMin: t.min })
            if (orderChanged)
              await actions.reorderForkBlocks(dateIso, ids.map((x) => idMap[x]).filter(Boolean))
          },
        })
      } else {
        const fromIdx = srcBlocks.findIndex((b) => b.id === id)
        const ids = srcBlocks.map((b) => b.id).filter((x) => x !== id)
        const idx = fromIdx >= 0 && fromIdx < t.idx ? t.idx - 1 : t.idx
        ids.splice(Math.min(idx, ids.length), 0, id)
        if (!ids.some((x, i) => x !== srcBlocks[i]?.id)) return // no change
        if (srcIsFork) {
          await actions.reorderForkBlocks(dateIso, ids)
          return
        }
        setForkPrompt({
          di: fromDow,
          onEveryWeek: () => actions.reorderBlocks(fromDow, ids),
          onJustThis: async () => {
            const idMap = await actions.forkDay(dateIso)
            await actions.reorderForkBlocks(dateIso, ids.map((x) => idMap[x]).filter(Boolean))
          },
        })
      }
    } else {
      // Moving a block between weekdays rearranges the weekly rhythm itself —
      // an unambiguous Template edit (no single date to fork), so no prompt.
      const ids = data.blocksByDow[t.dow].map((b) => b.id)
      ids.splice(Math.min(t.idx, ids.length), 0, id)
      await actions.moveBlock(id, t.dow, ids)
    }
  }

  return (
    <div>
      <div className="view-head mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2.5">
          <h2>Planner</h2>
          <p style={{ margin: 0 }}>{range.label}</p>
        </div>
        {/* Legend rides the header's empty middle instead of its own row —
            keeps the week grid one line higher on screen. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {data.buckets.map((bk) => (
            <span
              key={bk.id}
              className={`legend-chip s-${bk.cat}`}
              style={stripeVar(blockStyle({ bucketId: bk.id, cat: bk.cat }, data.buckets))}
            >
              <span className="dot" />
              {bk.name}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            className="btn ghost min-h-[42px]"
            aria-pressed={focusCounted}
            title="Focus: show only counted work — hide Life (sleep, commute, meals) and Unassigned"
            onClick={() => setFocusCounted((v) => !v)}
            style={focusCounted ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}
          >
            {focusCounted ? '◆ Counted only' : '◇ Focus'}
          </button>
          <button
            className="btn ghost min-h-[42px] min-w-[46px] text-[17px]"
            aria-label="Previous week"
            title="Previous week"
            onClick={() => setWeekOffset((o) => o - 1)}
          >
            ‹
          </button>
          {weekOffset !== 0 && (
            <button className="btn ghost min-h-[42px]" onClick={() => setWeekOffset(0)}>
              this week
            </button>
          )}
          <button
            className="btn ghost min-h-[42px] min-w-[46px] text-[17px]"
            aria-label="Next week"
            title="Next week"
            onClick={() => setWeekOffset((o) => o + 1)}
          >
            ›
          </button>
        </div>
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
        {shownPlans.map((plan, di) => {
          const day = data.days[di]
          const isToday = plan.source === 'today'
          const isPast = plan.source === 'frozen-past'
          const isFork = plan.source === 'fork'
          const editable = editableCol(di)
          return (
            <div key={plan.dateIso} className={'day' + (isToday ? ' today' : '')}>
              <div className="day-head">
                <span className="dname">
                  {day.name.slice(0, 3)} {dates[di].getDate()}
                </span>
                <span className="flex items-center gap-1">
                  {isFork ? (
                    <span className="dtag" title="Forked: this date has its own plan and no longer follows the Template">
                      ⑂ forked
                    </span>
                  ) : (
                    <span className="dtag">{day.loc}</span>
                  )}
                  {editable && (
                    <button className="bk-edit" title="Edit day" onClick={() => openProjectedDayEditor(di)}>
                      ✎
                    </button>
                  )}
                  {isFork && (
                    <>
                      <button
                        className="bk-edit"
                        title="Un-fork — follow the Template again"
                        onClick={() => unfork(di)}
                      >
                        ↺
                      </button>
                      <button
                        className="bk-edit"
                        title="Edit this day (forked)"
                        onClick={() => setEditingFork(plan.dateIso)}
                      >
                        ✎
                      </button>
                    </>
                  )}
                  {isToday && (
                    <button className="bk-edit" title="Edit today" onClick={() => setEditingToday(true)}>
                      ✎
                    </button>
                  )}
                </span>
              </div>
              <div
                className="blocks"
                ref={(el) => {
                  colRefs.current[di] = el
                }}
                style={{ height: spanPx, background: gridBg }}
              >
                {plan.items.map((it) => {
                  const top = Math.round((it.start - axisStart!) * PXMIN)
                  const hpx = Math.max(8, Math.round(it.durMin * PXMIN))
                  const tip = `${fmt(it.start)} · ${fmtDur(it.durMin)} — ${it.title}${it.detail ? '\n' + it.detail : ''}`
                  // On a projection or fork column an entry-backed item is a
                  // dated one-off riding on the base plan — its edits go to
                  // the Log Entry, never the Template or the fork.
                  const isOneOff = (editable || isFork) && it.entryId !== null
                  // Template blocks and one-offs drag on projection columns; a
                  // fork's own blocks and one-offs drag on fork columns (edits
                  // route silently to the fork). A plain tap still opens the
                  // relevant editor. Past/today items don't drag.
                  // Suspended while Focus is on — the visible items are a
                  // filtered subset, so drag drop-index math wouldn't align.
                  const draggable = !focusCounted && (editable || isFork || isOneOff)
                  const isDragging = draggable && dragVis?.id === (it.entryId ?? it.blockId)
                  // Past columns render the frozen plan: times/titles only — no
                  // done/undone styling, no drag or edit affordances. Fork
                  // columns are editable (silently) via the day editor; a
                  // one-off opens its own entry modal — never the fork prompt.
                  const interactive = editable || isToday || isFork
                  const open = () => {
                    // A Container's primary per-day action is filling its Agenda
                    // for THIS date (a Dated one-off surface — never forks). The
                    // Template Block itself is still editable via the day editor.
                    if (it.container && it.blockId && !isPast)
                      setEditingAgenda({ blockId: it.blockId, dateIso: plan.dateIso, title: it.title })
                    else if (isToday) setEditingToday(true)
                    else if (isOneOff) setEditingEntry({ id: it.entryId!, dateIso: plan.dateIso })
                    else if (isFork) setEditingFork(plan.dateIso)
                    else openProjectedDayEditor(di)
                  }
                  return (
                    <div
                      key={it.key}
                      className={`block s-${it.cat}${depthClass(it.deep)}${it.cat === 'open' ? ' is-open' : ''}${it.container ? ' is-container' : ''}${it.conflict ? ' conflict' : ''}${isDragging ? ' dragging' : ''}${hpx < 22 ? ' tiny' : ''}`}
                      style={{
                        ...stripeVar(blockStyle({ bucketId: it.bucketId, cat: it.cat }, data.buckets)),
                        top,
                        height: hpx,
                        ...(isPast && { cursor: 'default' }),
                        ...(isDragging && {
                          transform: `translate(${dragVis!.dx}px, ${dragVis!.dy}px)`,
                          zIndex: 20,
                        }),
                      }}
                      tabIndex={interactive ? 0 : undefined}
                      title={tip}
                      onPointerDown={draggable ? (e) => onBlockDown(e, di, it) : undefined}
                      onPointerMove={draggable ? onBlockMove : undefined}
                      onPointerUp={draggable ? onBlockUp : undefined}
                      onPointerCancel={draggable ? cleanupPress : undefined}
                      onClick={
                        interactive
                          ? () => {
                              if (suppressClick.current) {
                                suppressClick.current = false
                                return
                              }
                              open()
                            }
                          : undefined
                      }
                      onKeyDown={
                        interactive
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                open()
                              }
                            }
                          : undefined
                      }
                    >
                      <div className="bhead">
                        <span className="nm">
                          {it.container ? <span className="text-[9px] opacity-70">▤ </span> : null}
                          {it.title}
                          {it.anchored ? <span className="text-[8px]"> 📌</span> : null}
                        </span>
                        <span className="d">{fmtDur(it.durMin)}</span>
                      </div>
                      {it.container && it.agenda.length > 0 && (
                        <ul className="agenda-mini">
                          {it.agenda.map((a) => (
                            <li key={a.entryId} className={a.state === 'done' ? 'done' : undefined}>
                              {a.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
                {(editable || isFork) && dragVis?.target?.dow === di && (
                  <div
                    className="drop-line"
                    style={{
                      top:
                        press.current?.anchored && (press.current?.entryId != null || dragVis.fromDow === di)
                          ? Math.round((dragVis.target.min - axisStart!) * PXMIN)
                          : dragVis.target.idx < plan.items.length
                            ? Math.round((plan.items[dragVis.target.idx].start - axisStart!) * PXMIN)
                            : plan.items.length
                              ? Math.round(
                                  (plan.items[plan.items.length - 1].start +
                                    plan.items[plan.items.length - 1].durMin -
                                    axisStart!) *
                                    PXMIN,
                                )
                              : 0,
                    }}
                  />
                )}
              </div>
              <div className="p-[6px_8px]">
                {editable && (
                  <button className="add-block" onClick={() => openProjectedDayEditor(di)}>
                    ✎ Design day
                  </button>
                )}
                {isFork && (
                  <button className="add-block" onClick={() => setEditingFork(plan.dateIso)}>
                    ⑂ Edit this day
                  </button>
                )}
                {isToday && (
                  <button className="add-block" onClick={() => setEditingToday(true)}>
                    ✎ Edit today
                  </button>
                )}
              </div>
            </div>
          )
        })}
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
      {editingProjected && (
        <DayEditor
          data={data}
          actions={actions}
          dow={editingProjected.dow}
          lazyForkDate={editingProjected.dateIso}
          onClose={() => setEditingProjected(null)}
          // Once the lazy edit forks the day, `forkDate` comes back set so the
          // block modal edits the fork copy, not the Template.
          onEditBlock={(blockId, forkDate) => setEditing({ dow: editingProjected.dow, blockId, forkDate })}
        />
      )}
      {editingFork !== null && (
        <DayEditor
          data={data}
          actions={actions}
          dow={dowOfIso(editingFork)}
          forkDate={editingFork}
          onClose={() => setEditingFork(null)}
          onEditBlock={(blockId) => setEditing({ dow: dowOfIso(editingFork), blockId, forkDate: editingFork })}
        />
      )}
      {editing && (
        <BlockModal data={data} actions={actions} editing={editing} onClose={() => setEditing(null)} />
      )}
      {editingAgenda && (
        <AgendaModal
          data={data}
          actions={actions}
          blockId={editingAgenda.blockId}
          dateIso={editingAgenda.dateIso}
          title={editingAgenda.title}
          onClose={() => setEditingAgenda(null)}
        />
      )}
      {editingToday && (
        <TodayEditor data={data} actions={actions} dateIso={todayIso} onClose={() => setEditingToday(false)} />
      )}
      {editingEntry && (
        <TodayEntryModal
          data={data}
          actions={actions}
          entryId={editingEntry.id}
          dateIso={editingEntry.dateIso}
          onUnschedule={() => {
            actions.unscheduleEntry(editingEntry.id)
            setEditingEntry(null)
          }}
          onClose={() => setEditingEntry(null)}
        />
      )}
      {forkPrompt && (
        <ForkPromptModal
          dayName={data.days[forkPrompt.di].name}
          dateLabel={dateLabel(forkPrompt.di)}
          onJustThis={async () => {
            const p = forkPrompt
            setForkPrompt(null)
            await p.onJustThis()
          }}
          onEveryWeek={async () => {
            const p = forkPrompt
            setForkPrompt(null)
            await p.onEveryWeek()
          }}
          onClose={() => setForkPrompt(null)}
        />
      )}
    </div>
  )
}
