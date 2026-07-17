import { useState } from 'react'
import type { PlannerActions, PlannerData } from '../../lib/queries/planner'
import { blockStyle, catStyles, depthClass, onTimelineEntries, resolve, stripeVar } from '../../lib/planner'
import { Modal } from '../../components/Modal'
import { TimelineEditor } from '../../components/TimelineEditor'
import { TodayEntryModal } from './TodayEntryModal'

/** The single "today" editing affordance: drag to reorder, drag the bottom
 *  edge to resize (mirrors DayEditor's feel for the weekday Template), tap a
 *  title to open its detail modal, drag or tap a bucket task chip to drop it
 *  onto today's timeline. Edits today's Log Entries only — never the
 *  Template or its buckets. */
export function TodayEditor({
  data,
  actions,
  todayIso,
  onClose,
}: {
  data: PlannerData
  actions: PlannerActions
  todayIso: string
  onClose: () => void
}) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const items = onTimelineEntries(data.logEntries, todayIso)
  const styles = catStyles(data.buckets)

  /** Where a freshly-added item lands: right after today's last on-timeline
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
      onDate: todayIso,
      kind: 'task',
      text: task.name,
      cat: bucket.cat,
      durMin: 60,
      startMin: nextStartMin(),
      anchored: false,
      // Carry the task's project trace (#21) onto today's entry so a check-off
      // accrues to the project. (Habit traces ride on Blocks, not on directly
      // added today entries — those have no Block to mirror the habit from.)
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
      onDate: todayIso,
      kind: 'task',
      text: 'New item',
      cat: 'open',
      durMin: 30,
      startMin: nextStartMin(),
      anchored: true,
    })
  }

  return (
    <Modal title="Today's plan · edit" onClose={onClose} wide>
      <div className="grid items-start gap-3 max-md:grid-cols-1 md:grid-cols-[1fr_240px]">
        <div className="daycard" style={{ maxHeight: 'calc(90vh - 180px)', overflowY: 'auto' }}>
          <TimelineEditor
            items={items.map((e) => ({
              id: e.id,
              cat: e.cat,
              title: e.text,
              startMin: e.startMin ?? 0,
              durMin: e.durMin ?? 30,
              anchored: e.anchored,
              deep: e.deep,
            }))}
            styles={styles}
            onSetMins={(id, mins) => actions.updateLogEntry(id, { durMin: mins })}
            onSetStart={(id, startMin) => actions.updateLogEntry(id, { startMin })}
            onReorder={(ids) => actions.reorderLogEntries(todayIso, ids)}
            onRemove={(id) => actions.deleteLogEntry(id)}
            onTitleClick={setEditingEntryId}
            emptyHint="Tap a task chip (or drag it here) to add — or add a custom item below."
            onDropExternal={async (payload, at) => {
              const [bk, task] = payload.split('|')
              const id = await addFromChip(bk, task)
              if (id && at < items.length) {
                const ids = items.map((e) => e.id)
                ids.splice(at, 0, id)
                await actions.reorderLogEntries(todayIso, ids)
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
          dateIso={todayIso}
          onClose={() => setEditingEntryId(null)}
        />
      )}
    </Modal>
  )
}
