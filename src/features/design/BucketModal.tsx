import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { CATS, type Cat } from '../../lib/planner'
import type { Bucket } from '../../lib/queries/planner'

export function BucketModal({
  bucket,
  onSave,
  onDelete,
  onClose,
}: {
  bucket: Bucket | null
  onSave: (b: { id?: string; name: string; cat: Cat; tasks: string[] }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(bucket?.name ?? '')
  const [cat, setCat] = useState<Cat>(bucket?.cat ?? 'work')
  const [tasks, setTasks] = useState<string[]>(bucket ? bucket.tasks.map((t) => t.name) : ['New task'])

  return (
    <Modal title={bucket ? 'Edit bucket' : 'New bucket'} onClose={onClose}>
      <div className="field">
        <label>Name</label>
        <input type="text" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Color</label>
        <select value={cat} onChange={(e) => setCat(e.target.value as Cat)}>
          {(Object.keys(CATS) as Cat[])
            .filter((k) => k !== 'open')
            .map((k) => (
              <option key={k} value={k}>
                {CATS[k]}
              </option>
            ))}
        </select>
      </div>
      <div className="field">
        <label>Tasks (default 1h · adjust by 30m in the day)</label>
        {tasks.map((t, i) => (
          <div key={i} className="mb-1.5 flex gap-1.5">
            <input
              type="text"
              maxLength={40}
              className="flex-1"
              value={t}
              onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              type="button"
              className="btn ghost sm"
              title="Remove task"
              onClick={() => setTasks(tasks.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn ghost sm mt-1" onClick={() => setTasks([...tasks, ''])}>
          + Add task
        </button>
      </div>
      <div className="mt-[18px] flex items-center gap-2">
        {bucket && (
          <button className="btn danger ghost" onClick={() => onDelete(bucket.id)}>
            Delete bucket
          </button>
        )}
        <div className="flex-1" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          onClick={() =>
            onSave({
              id: bucket?.id,
              name: name.trim() || 'Bucket',
              cat,
              tasks: tasks.map((t) => t.trim()).filter(Boolean),
            })
          }
        >
          Save
        </button>
      </div>
    </Modal>
  )
}
