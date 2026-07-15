import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { CATS, type Cat } from '../../lib/planner'
import type { Bucket } from '../../lib/queries/planner'

/** Fallback hex per category, mirroring the CSS dark-theme palette, so the
 *  color input shows the effective color even before a custom pick. */
const CAT_HEX: Record<Cat, string> = {
  work: '#4fb3ac',
  devops: '#d1a24e',
  thesis: '#8593e0',
  math: '#c188c6',
  chin: '#e08579',
  exercise: '#6cc48a',
  wqu: '#8a969d',
  life: '#6f797d',
  open: '#4fb3ac',
}

export function BucketModal({
  bucket,
  onSave,
  onDelete,
  onClose,
}: {
  bucket: Bucket | null
  onSave: (b: { id?: string; name: string; cat: Cat; tasks: { name: string; deep: boolean }[]; color: string }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(bucket?.name ?? '')
  const [cat, setCat] = useState<Cat>(bucket?.cat ?? 'work')
  const [color, setColor] = useState(bucket?.color ?? '')
  const [tasks, setTasks] = useState<{ name: string; deep: boolean }[]>(
    bucket ? bucket.tasks.map((t) => ({ name: t.name, deep: t.deep })) : [{ name: 'New task', deep: false }],
  )

  return (
    <Modal title={bucket ? 'Edit bucket' : 'New bucket'} onClose={onClose}>
      <div className="field">
        <label>Name</label>
        <input type="text" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label>Category</label>
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
          <label>Color</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color || CAT_HEX[cat]}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: 44, height: 32, padding: 2, cursor: 'pointer' }}
            />
            {color && (
              <button type="button" className="btn ghost sm" onClick={() => setColor('')}>
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="field">
        <label>Tasks (default 1h · ▲ = deep work, rendered saturated)</label>
        {tasks.map((t, i) => (
          <div key={i} className="mb-1.5 flex items-center gap-1.5">
            <input
              type="text"
              maxLength={40}
              className="flex-1"
              value={t.name}
              onChange={(e) => setTasks(tasks.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <button
              type="button"
              className={'btn ghost sm' + (t.deep ? ' deep-on' : '')}
              title={t.deep ? 'Deep work — click to mark shallow' : 'Shallow — click to mark deep work'}
              onClick={() => setTasks(tasks.map((x, j) => (j === i ? { ...x, deep: !x.deep } : x)))}
            >
              ▲
            </button>
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
        <button
          type="button"
          className="btn ghost sm mt-1"
          onClick={() => setTasks([...tasks, { name: '', deep: false }])}
        >
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
              color,
              tasks: tasks.map((t) => ({ ...t, name: t.name.trim() })).filter((t) => t.name),
            })
          }
        >
          Save
        </button>
      </div>
    </Modal>
  )
}
