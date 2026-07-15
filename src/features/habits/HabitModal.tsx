import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { CATS, DOW, type Cat, type Habit } from '../../lib/planner'

export function HabitModal({
  habit,
  onSave,
  onDelete,
  onClose,
}: {
  habit: Habit | null
  onSave: (h: { id?: string; name: string; cat: Cat; days: number[] }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(habit?.name ?? '')
  const [cat, setCat] = useState<Cat>(habit?.cat ?? 'exercise')
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
        <label>Category</label>
        <select value={cat} onChange={(e) => setCat(e.target.value as Cat)}>
          {(Object.keys(CATS) as Cat[])
            .filter((k) => k !== 'life' && k !== 'open')
            .map((k) => (
              <option key={k} value={k}>
                {CATS[k]}
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
          onClick={() => onSave({ id: habit?.id, name: name.trim() || 'Habit', cat, days })}
        >
          Save
        </button>
      </div>
    </Modal>
  )
}
