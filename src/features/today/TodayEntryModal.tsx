import { useState } from 'react'
import type { PlannerActions, PlannerData } from '../../lib/queries/planner'
import { fmt, parseTime, viewedEntries } from '../../lib/planner'
import { Modal } from '../../components/Modal'

/** Edits one entry on a day's plan timeline — today's live plan, a dated
 *  one-off riding on a future day (then `onUnschedule` offers to clear its
 *  start and send it back to the Sprint work card), or — with `past` — a
 *  past day paged to from the Today tab (#25), where dropped/migrated
 *  entries are reachable too. Title, bucket, duration, anchor/start. Writes
 *  the Log Entry only; never touches the Template. */
export function TodayEntryModal({
  data,
  actions,
  entryId,
  dateIso,
  past = false,
  todayIso,
  onUnschedule,
  onSaved,
  onClose,
}: {
  data: PlannerData
  actions: PlannerActions
  entryId: string
  dateIso: string
  /** True when `dateIso` is a day other than the actual current day (the
   *  Today tab's past-day pager, #25). Looks the entry up through the
   *  frozen-past-with-state lens (dropped/migrated included) instead of the
   *  live on-timeline lens, and offers reopen / migrate-forward actions. */
  past?: boolean
  /** The actual current day — only read in `past` mode, as the
   *  migrate-forward target. */
  todayIso?: string
  onUnschedule?: () => void
  /** Called after a save that writes this entry's anchor/start, so a past-day
   *  TodayEditor can stop force-pinning it (#25's opt-into-reflow safety net). */
  onSaved?: (id: string) => void
  onClose: () => void
}) {
  const items = viewedEntries(data.logEntries, dateIso, past)
  const index = items.findIndex((e) => e.id === entryId)
  const entry = items[index]
  // Block-sourced entries (materialized from the Template) carry their habit
  // trace on the source Block, not the entry — checking them off mirrors via
  // `toggleBlockLog`, which reads the Block's `habitId`, not this entry's own.
  // Editing it here would be a no-op, so it's shown read-only; only entries
  // with no source Block (blockId === null) own an editable trace (#24).
  const blockHabit = entry?.blockId
    ? (data.dayForks[dateIso] ?? []).find((b) => b.id === entry.blockId) ??
      data.blocksByDow.flat().find((b) => b.id === entry.blockId)
    : null
  const blockHabitName = blockHabit?.habitId ? data.habits.find((h) => h.id === blockHabit.habitId)?.name : null

  const [title, setTitle] = useState(entry?.text ?? '')
  // The Bucket is the taxonomy (ADR-0003); `cat` is stamped from it on save.
  const [bucketId, setBucketId] = useState(entry?.bucketId ?? '')
  const [habitId, setHabitId] = useState(entry?.habitId ?? '')
  const [dur, setDur] = useState(entry?.durMin ?? 30)
  // Every entry carries its own concrete start (ADR-0007) — the stored start IS
  // the rendered start, live or past, so it's directly editable.
  const [start, setStart] = useState(fmt(entry?.startMin ?? 0))

  if (!entry) return null

  async function save() {
    // The Bucket is authoritative; `cat` is stamped from it as derived plumbing
    // (ADR-0003). No bucket → Unassigned (null, open cat).
    const bucket = data.buckets.find((bk) => bk.id === bucketId)
    await actions.updateLogEntry(entry.id, {
      bucketId: bucket?.id ?? null,
      cat: bucket?.cat ?? 'open',
      text: title.trim() || '(untitled)',
      durMin: Math.max(5, dur || 30),
      ...(!entry.blockId && { habitId: habitId || null }),
      startMin: parseTime(start),
    })
    onSaved?.(entry.id)
    onClose()
  }

  async function remove() {
    await actions.deleteLogEntry(entry.id)
    onClose()
  }

  /** Re-open a dropped/migrated past entry (#25's #18) — clears the stale
   *  `migratedTo` pointer too, since it's no longer true this row moved on. */
  async function reopen() {
    await actions.updateLogEntry(entry.id, { state: 'open', migratedTo: null })
    onClose()
  }

  /** Carry a still-open past entry forward to the actual current day. */
  async function migrateForward() {
    if (!todayIso) return
    await actions.migrateLogEntry(entry.id, todayIso, false)
    onClose()
  }

  return (
    <Modal
      title={onUnschedule ? 'Dated one-off · edit item' : past ? 'Past day · edit item' : "Today's plan · edit item"}
      onClose={onClose}
    >
      <div className="field">
        <label>Title</label>
        <input type="text" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label>Bucket</label>
          <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
            <option value="">Unassigned</option>
            {data.buckets.map((bk) => (
              <option key={bk.id} value={bk.id}>
                {bk.name}
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
        <label>Habit</label>
        {entry.blockId ? (
          <div className="hint" style={{ padding: 0, margin: 0 }}>
            {blockHabitName
              ? `🔥 Logs "${blockHabitName}" — set on the Template block, edit it there to change.`
              : 'Not linked — set a habit on the Template block (Planner → edit day) to track this as a habit.'}
          </div>
        ) : (
          <select value={habitId} onChange={(e) => setHabitId(e.target.value)}>
            <option value="">None</option>
            {data.habits.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="field">
        <label>Start</label>
        <input type="time" step={300} value={start} onChange={(e) => setStart(e.target.value)} />
      </div>
      {past && (entry.state === 'dropped' || entry.state === 'migrated') && (
        <div className="hint" style={{ padding: 0, margin: '10px 0 0' }}>
          {entry.state === 'dropped' ? 'Dropped that day.' : 'Migrated forward that day.'}
        </div>
      )}
      <div className="mt-[18px] flex items-center gap-2">
        <button className="btn danger ghost" onClick={remove}>
          Delete
        </button>
        {onUnschedule && (
          <button className="btn ghost" title="Clear the start time — the task returns to the Sprint work card" onClick={onUnschedule}>
            ↩ Unschedule
          </button>
        )}
        {past && (entry.state === 'dropped' || entry.state === 'migrated') && (
          <button className="btn ghost" title="Bring this entry back to open" onClick={reopen}>
            ↺ Reopen
          </button>
        )}
        {past && entry.state === 'open' && todayIso && (
          <button className="btn ghost" title="Carry this task forward to today" onClick={migrateForward}>
            › Migrate to today
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
