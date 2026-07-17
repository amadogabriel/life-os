import { useState } from 'react'
import type { PlannerActions, PlannerData } from '../../lib/queries/planner'
import { catStyles, onTimelineEntries, resolve } from '../../lib/planner'
import { Modal } from '../../components/Modal'
import { TimelineEditor } from '../../components/TimelineEditor'
import { TodayEntryModal } from './TodayEntryModal'

/** The single "today" editing affordance: drag to reorder, drag the bottom
 *  edge to resize (mirrors DayEditor's feel for the weekday Template), tap a
 *  title to open its detail modal. Edits today's Log Entries only — never the
 *  Template. */
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

  async function addItem() {
    const resolved = resolve(items.map((e) => ({ ...e, startMin: e.startMin ?? 0, durMin: e.durMin ?? 30 })))
    const last = resolved[resolved.length - 1]
    const startMin = last ? last.start + last.block.durMin : 480
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
      startMin,
      anchored: true,
    })
  }

  return (
    <Modal title="Today's plan · edit" onClose={onClose} wide>
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
          emptyHint="Nothing on today's plan yet — add an item below."
        />
      </div>
      <div className="mt-[14px] flex items-center justify-between">
        <button className="addbucket shrink-0" onClick={addItem}>
          + Add item
        </button>
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
      {editingEntryId && (
        <TodayEntryModal
          data={data}
          actions={actions}
          entryId={editingEntryId}
          todayIso={todayIso}
          onClose={() => setEditingEntryId(null)}
        />
      )}
    </Modal>
  )
}
