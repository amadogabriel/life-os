import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { CATS, type Cat, type Habit, type Project, type Sprint } from '../../lib/planner'
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

/** A task row's editable shape — name + deep + its Traces (#20/#21). */
interface TaskDraft {
  name: string
  deep: boolean
  habitId: string | null
  projectId: string | null
  sprintId: string | null
}

export function BucketModal({
  bucket,
  habits,
  projects,
  sprints,
  onSave,
  onDelete,
  onClose,
}: {
  bucket: Bucket | null
  habits: Habit[]
  projects: Project[]
  sprints: Sprint[]
  onSave: (b: {
    id?: string
    name: string
    cat: Cat
    tasks: TaskDraft[]
    color: string
  }) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [name, setName] = useState(bucket?.name ?? '')
  const [cat, setCat] = useState<Cat>(bucket?.cat ?? 'work')
  const [color, setColor] = useState(bucket?.color ?? '')
  const [tasks, setTasks] = useState<TaskDraft[]>(
    bucket
      ? bucket.tasks.map((t) => ({
          name: t.name,
          deep: t.deep,
          habitId: t.habitId,
          projectId: t.projectId,
          sprintId: t.sprintId,
        }))
      : [{ name: 'New task', deep: false, habitId: null, projectId: null, sprintId: null }],
  )

  const setTask = (i: number, patch: Partial<TaskDraft>) =>
    setTasks(tasks.map((x, j) => (j === i ? { ...x, ...patch } : x)))

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
        <label>Tasks (default 1h · ▲ = deep work · trace to a habit / project)</label>
        {tasks.map((t, i) => {
          const projectSprints = sprints.filter((s) => s.projectId === t.projectId)
          return (
            <div key={i} className="mb-2 rounded-md border p-1.5" style={{ borderColor: 'var(--line-soft)' }}>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  maxLength={40}
                  className="flex-1"
                  value={t.name}
                  onChange={(e) => setTask(i, { name: e.target.value })}
                />
                <button
                  type="button"
                  className={'btn ghost sm' + (t.deep ? ' deep-on' : '')}
                  title={t.deep ? 'Deep work — click to mark shallow' : 'Shallow — click to mark deep work'}
                  onClick={() => setTask(i, { deep: !t.deep })}
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
              <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                <select
                  className="qi"
                  style={{ fontSize: 11, padding: '3px 4px' }}
                  title="Trace to a habit — placing the chip pre-links the habit"
                  value={t.habitId ?? ''}
                  onChange={(e) => setTask(i, { habitId: e.target.value || null })}
                >
                  <option value="">↻ no habit</option>
                  {habits.map((h) => (
                    <option key={h.id} value={h.id}>
                      ↻ {h.name}
                    </option>
                  ))}
                </select>
                <select
                  className="qi"
                  style={{ fontSize: 11, padding: '3px 4px' }}
                  title="Trace to a project — check-offs accrue to it"
                  value={t.projectId ?? ''}
                  onChange={(e) => setTask(i, { projectId: e.target.value || null, sprintId: null })}
                >
                  <option value="">◇ no project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      ◇ {p.name}
                    </option>
                  ))}
                </select>
                <select
                  className="qi"
                  style={{ fontSize: 11, padding: '3px 4px' }}
                  title="Optionally narrow to a sprint within the project"
                  value={t.sprintId ?? ''}
                  disabled={!t.projectId}
                  onChange={(e) => setTask(i, { sprintId: e.target.value || null })}
                >
                  <option value="">whole project</option>
                  {projectSprints.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )
        })}
        <button
          type="button"
          className="btn ghost sm mt-1"
          onClick={() => setTasks([...tasks, { name: '', deep: false, habitId: null, projectId: null, sprintId: null }])}
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
