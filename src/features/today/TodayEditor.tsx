import { useState } from 'react'
import type { PlannerActions, PlannerData } from '../../lib/queries/planner'
import { blockStyle, depthClass, dowOfIso, fromIso, longDate, resolve, stripeVar, viewedEntries } from '../../lib/planner'
import { Modal } from '../../components/Modal'
import { TimelineEditor } from '../../components/TimelineEditor'
import { BlockModal, type EditingBlock } from '../planner/BlockModal'
import { TodayEntryModal } from './TodayEntryModal'



/** The single "day plan" editing affordance: drag to reorder, drag the bottom
 *  edge to resize (mirrors DayEditor's feel for the weekday Template), tap a
 *  title to open its detail modal, drag or tap a bucket task chip to drop it
 *  onto the day's timeline. Edits `dateIso`'s Log Entries only — never the
 *  Template or its buckets.
 *
 *  `past` (#25) edits a day other than the actual current one — sourced from
 *  the frozen-past-with-state lens (dropped/migrated included) instead of the
 *  live on-timeline lens. Every entry's *effective* anchor is forced `true`
 *  for the layout handed to `TimelineEditor` until the user explicitly saves
 *  it through `TodayEntryModal` (tracked in `touchedIds`) — a display-only
 *  safety net so opening a past day never silently reflows it before anything
 *  is touched (mirrors the ADR-0002 amendment's frozen-past rendering fix).
 *  Once touched, the entry's real `anchored` flag governs — the mechanism for
 *  "explicitly un-anchor to opt into reflow" (#25's #24). */
export function TodayEditor({
  data,
  actions,
  dateIso,
  past = false,
  todayIso,
  onClose,
}: {
  data: PlannerData
  actions: PlannerActions
  dateIso: string
  past?: boolean
  todayIso?: string
  onClose: () => void
}) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [editingBlock, setEditingBlock] = useState<EditingBlock | null>(null)
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set())
  // A block just created by `addCustomBlock`, still not on this list (`items`
  // is Log-primary — a bare Block has no citem until materialized). Freezing
  // on the modal's close (not on creation) means the frozen entry captures
  // the title/duration/Container the user actually saved, not the "New block
  // — assign" placeholder.
  const [freshBlockId, setFreshBlockId] = useState<string | null>(null)
  const items = viewedEntries(data.logEntries, dateIso, past)

  /** Open the full Bucket/Task/Detail/Deep/Habit editor (BlockModal, same as
   *  a future day's) for a block-sourced entry — lazily forking today's own
   *  Day Plan on first use (mirrors DayEditor's lazyForkDate) so the edit
   *  never leaks into the shared weekday Template. Live-today only: a past
   *  day is already frozen, so its titles keep opening TodayEntryModal. */
  async function editSourceBlock(blockId: string) {
    const forked = data.dayForks[dateIso]?.some((b) => b.id === blockId)
    const dow = dowOfIso(dateIso)
    if (forked) {
      setEditingBlock({ dow, blockId, forkDate: dateIso })
      return
    }
    const idMap = await actions.forkDay(dateIso)
    setEditingBlock({ dow, blockId: idMap[blockId] ?? blockId, forkDate: dateIso })
  }

  function handleTitleClick(id: string) {
    const item = items.find((e) => e.id === id)
    if (!past && item?.blockId) {
      editSourceBlock(item.blockId)
    } else {
      setEditingEntryId(id)
    }
  }

  /** Where a freshly-added item lands: right after the day's last on-timeline
   *  entry. `startMin` is what marks an entry as "on the timeline" at all
   *  (vs. a rapid-log todo) — every add path must set one. */
  function nextStartMin(): number {
    const resolved = resolve(items.map((e) => ({ ...e, startMin: e.startMin ?? 0, durMin: e.durMin ?? 30 })))
    const last = resolved[resolved.length - 1]
    return last ? last.start + last.block.durMin : 480
  }

  /** A dropped/tapped bucket task becomes an unanchored on-timeline entry —
   *  it chains into wherever it landed, same as a Block dropped in DayEditor. */
  async function addFromChip(bucketId: string, taskId: string): Promise<string | null> {
    const bucket = data.buckets.find((bk) => bk.id === bucketId)
    const task = bucket?.tasks.find((t) => t.id === taskId)
    if (!bucket || !task) return null
    return actions.addLogEntry({
      onDate: dateIso,
      kind: 'task',
      text: task.name,
      // Record the source Bucket (#18) so the entry groups into and recolors
      // live with it; `cat` is stamped from the bucket on write (ADR-0003).
      bucketId: bucket.id,
      cat: bucket.cat,
      durMin: 60,
      startMin: nextStartMin(),
      anchored: false,
      // Carry the task's traces onto the entry so a check-off both logs the
      // habit (#24 — the entry-based mirror, since a directly-added entry has no
      // Block) and accrues to the project/sprint (#21).
      habitId: task.habitId,
      projectId: task.projectId,
      sprintId: task.sprintId,
    })
  }

  async function addItem() {
    // Not auto-opened for editing: the query cache hasn't caught up with this
    // mutation yet, so an edit modal opened synchronously here would read the
    // stale (pre-add) data and show placeholder defaults instead of what was
    // just created. Tap the new "New item" card to rename it once it renders.
    await actions.addLogEntry({
      onDate: dateIso,
      kind: 'task',
      text: 'New item',
      cat: 'open',
      durMin: 30,
      startMin: nextStartMin(),
      anchored: true,
    })
  }

  /** Add a genuinely new dated Block for this day (mirrors DayEditor's "+
   *  Custom block") — the only way to get a fresh Container onto a specific
   *  day, since `addItem`/`addFromChip` only ever create Block-less Log
   *  Entries. Lazily forks the day first, same as `editSourceBlock`. */
  async function addCustomBlock() {
    const forkBlocks = data.dayForks[dateIso] ?? data.blocksByDow[dowOfIso(dateIso)] ?? []
    if (!data.dayForks[dateIso]) await actions.forkDay(dateIso)
    const id = await actions.addForkBlock(dateIso, forkBlocks.length)
    setFreshBlockId(id)
    setEditingBlock({ dow: dowOfIso(dateIso), blockId: id, forkDate: dateIso })
  }

  /** Closing the fresh block's editor (Save OR Cancel) is the trigger to
   *  freeze it into today's Log — otherwise it stays invisible everywhere
   *  until the next manual ↻. */
  async function closeBlockEditor() {
    setEditingBlock(null)
    if (freshBlockId) {
      setFreshBlockId(null)
      await actions.materializeDay(dateIso)
    }
  }

  /** In past mode, force the displayed anchor to `true` (pinned at stored
   *  start) until the user has explicitly saved this entry through the modal
   *  — the safety net that keeps opening a past day from silently reflowing
   *  it (#25). Live-today mode always honors the entry's real anchor. */
  function effectiveAnchor(e: { id: string; anchored: boolean }): boolean {
    if (!past) return e.anchored
    return touchedIds.has(e.id) ? e.anchored : true
  }

  return (
    <Modal title={past ? `${longDate(fromIso(dateIso))} · edit` : "Today's plan · edit"} onClose={onClose} wide>
      <div className="grid items-start gap-3 max-md:grid-cols-1 md:grid-cols-[1fr_240px]">
        <div className="daycard" style={{ maxHeight: 'calc(90vh - 180px)', overflowY: 'auto' }}>
          <TimelineEditor
            items={items.map((e) => ({
              id: e.id,
              // Log Entries carry a Bucket reference (#18) — color resolves live
              // per-item through it (see `blockStyle`), killing first-bucket-wins.
              bucketId: e.bucketId,
              cat: e.cat,
              title: e.text,
              startMin: e.startMin ?? 0,
              durMin: e.durMin ?? 30,
              anchored: effectiveAnchor(e),
              deep: e.deep,
            }))}
            buckets={data.buckets}
            onSetMins={(id, mins) => actions.updateLogEntry(id, { durMin: mins })}
            onSetStart={(id, startMin) => actions.updateLogEntry(id, { startMin, anchored: true })}
            onReorder={(ids) => actions.reorderLogEntries(dateIso, ids)}
            onRemove={(id) => actions.deleteLogEntry(id)}
            onTitleClick={handleTitleClick}
            emptyHint={
              past
                ? 'Nothing recorded — ↻ pulls the Template in, or add a custom item below.'
                : 'Tap a task chip (or drag it here) to add — or add a custom item below.'
            }
            onDropExternal={async (payload, at) => {
              const [bk, task] = payload.split('|')
              const id = await addFromChip(bk, task)
              if (id && at < items.length) {
                const ids = items.map((e) => e.id)
                ids.splice(at, 0, id)
                await actions.reorderLogEntries(dateIso, ids)
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-3" style={{ maxHeight: 'calc(90vh - 180px)', overflowY: 'auto' }}>
          {data.buckets.map((bk) => (
            <div key={bk.id} className="bucket shrink-0">
              <div className="bucket-head">
                <span className={`hname s-${bk.cat}`} style={stripeVar(blockStyle({ bucketId: bk.id, cat: bk.cat }, data.buckets))}>
                  <span className="dot" />
                  {bk.name}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 p-[11px_13px]">
                {bk.tasks.map((tk) => (
                  <button
                    key={tk.id}
                    className={`chip s-${bk.cat}${depthClass(tk.deep)}`}
                    style={stripeVar(blockStyle({ bucketId: bk.id, cat: bk.cat }, data.buckets))}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', bk.id + '|' + tk.id)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => addFromChip(bk.id, tk.id)}
                  >
                    {tk.deep ? '▲ ' : ''}
                    {tk.name}
                    <span className="add">＋</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button className="addbucket shrink-0" onClick={addItem}>
            + Add item
          </button>
          {!past && (
            <button className="addbucket shrink-0" onClick={addCustomBlock}>
              + Custom block (can be a Container)
            </button>
          )}
        </div>
      </div>
      <div className="mt-[14px] flex justify-end">
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
      {editingEntryId && (
        <TodayEntryModal
          data={data}
          actions={actions}
          entryId={editingEntryId}
          dateIso={dateIso}
          past={past}
          todayIso={todayIso}
          onSaved={(id) => setTouchedIds((s) => new Set(s).add(id))}
          onClose={() => setEditingEntryId(null)}
        />
      )}
      {editingBlock && <BlockModal data={data} actions={actions} editing={editingBlock} onClose={closeBlockEditor} />}
    </Modal>
  )
}
