import { useState } from 'react'
import type { PlannerActions, PlannerData } from '../../lib/queries/planner'
import { CATS, fmt, onTimelineEntries, parseTime, resolve, type Cat } from '../../lib/planner'
import { Modal } from '../../components/Modal'

/** Edits one entry on a day's plan timeline — today's live plan, or a dated
 *  one-off riding on a future day (then `onUnschedule` offers to clear its
 *  start and send it back to the Sprint work card). Title, category, duration,
 *  anchor/start. Writes the Log Entry only; never touches the Template. */
export function TodayEntryModal({
  data,
  actions,
  entryId,
  dateIso,
  onUnschedule,
  onClose,
}: {
  data: PlannerData
  actions: PlannerActions
  entryId: string
  dateIso: string
  onUnschedule?: () => void
  onClose: () => void
}) {
  const items = onTimelineEntries(data.logEntries, dateIso)
  const index = items.findIndex((e) => e.id === entryId)
  const entry = items[index]

  const [title, setTitle] = useState(entry?.text ?? '')
  const [cat, setCat] = useState<Cat>(entry?.cat ?? 'open')
  const [dur, setDur] = useState(entry?.durMin ?? 30)
  const [anchored, setAnchored] = useState(entry?.anchored ?? false)
  const resolvedStart =
    index >= 0 ? resolve(items.map((e) => ({ ...e, startMin: e.startMin ?? 0, durMin: e.durMin ?? 30 })))[index].start : 0
  const [start, setStart] = useState(fmt(entry?.anchored ? (entry.startMin ?? 0) : resolvedStart))

  if (!entry) return null

  async function save() {
    await actions.updateLogEntry(entry.id, {
      cat,
      text: title.trim() || '(untitled)',
      durMin: Math.max(5, dur || 30),
      anchored,
      ...(anchored && { startMin: parseTime(start) }),
    })
    onClose()
  }

  async function remove() {
    await actions.deleteLogEntry(entry.id)
    onClose()
  }

  return (
    <Modal title={onUnschedule ? 'Dated one-off · edit item' : "Today's plan · edit item"} onClose={onClose}>
      <div className="field">
        <label>Title</label>
        <input type="text" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label>Category</label>
          <select value={cat} onChange={(e) => setCat(e.target.value as Cat)}>
            {(Object.keys(CATS) as Cat[]).map((c) => (
              <option key={c} value={c}>
                {CATS[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Duration (min)</label>
          <input
            type="number"
            min={5}
            max={720}
            step={5}
            value={dur}
            onChange={(e) => setDur(parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>
      <div className="field">
        <label>Fixed start</label>
        <input type="time" step={300} value={start} disabled={!anchored} onChange={(e) => setStart(e.target.value)} />
      </div>
      <label className="check">
        <input type="checkbox" checked={anchored} onChange={(e) => setAnchored(e.target.checked)} /> 📌
        Fixed start time (anchor — won't shift)
      </label>
      <div className="mt-[18px] flex items-center gap-2">
        <button className="btn danger ghost" onClick={remove}>
          Delete
        </button>
        {onUnschedule && (
          <button className="btn ghost" title="Clear the start time — the task returns to the Sprint work card" onClick={onUnschedule}>
            ↩ Unschedule
          </button>
        )}
        <div className="flex-1" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  )
}
