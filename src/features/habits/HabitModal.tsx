import { useMemo, useState } from 'react'
import { Modal } from '../../components/Modal'
import { DOW, type Cat, type Habit } from '../../lib/planner'
import type { Bucket } from '../../lib/queries/planner'

export function HabitModal({
  habit,
  buckets,
  onSave,
  onDelete,
  onClose,
}: {
  habit: Habit | null
  buckets: Bucket[]
  onSave: (h: { id?: string; name: string; bucketId: string | null; cat: Cat; days: number[] }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(habit?.name ?? '')
  // Prefer the habit's own Bucket reference; fall back to the first bucket with
  // its stamped cat (legacy habits with no reference), then the first bucket.
  const initialBucket = useMemo(
    () =>
      buckets.find((bk) => bk.id === habit?.bucketId) ??
      buckets.find((bk) => bk.cat === habit?.cat) ??
      buckets[0],
    [buckets, habit],
  )
  const [bucketId, setBucketId] = useState(initialBucket?.id ?? '')
  const [days, setDays] = useState<number[]>(habit?.days ?? [0, 1, 2, 3, 4])

  const toggleDay = (i: number) =>
    setDays((ds) => (ds.includes(i) ? ds.filter((d) => d !== i) : [...ds, i].sort()))

  return (
    <Modal title={habit ? 'Edit habit' : 'New habit'} onClose={onClose}>
      <div className="field">
        <label>Name</label>
        <input type="text" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Bucket</label>
        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
          {buckets.map((bk) => (
            <option key={bk.id} value={bk.id}>
              {bk.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Target days</label>
        <div className="daytoggles flex flex-wrap gap-1.5">
          {DOW.map((d, i) => (
            <button key={d} className={days.includes(i) ? 'on' : ''} onClick={() => toggleDay(i)}>
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-[18px] flex items-center gap-2">
        {habit && (
          <button className="btn danger ghost" onClick={() => onDelete(habit.id)}>
            Delete
          </button>
        )}
        <div className="flex-1" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() => {
            // The Bucket is authoritative; `cat` is stamped from it as derived
            // plumbing (ADR-0003). No bucket → Unassigned (null, open cat).
            const bucket = buckets.find((bk) => bk.id === bucketId)
            onSave({
              id: habit?.id,
              name: name.trim() || 'Habit',
              bucketId: bucket?.id ?? null,
              cat: bucket?.cat ?? 'open',
              days,
            })
          }}
        >
          Save
        </button>
      </div>
    </Modal>
  )
}
