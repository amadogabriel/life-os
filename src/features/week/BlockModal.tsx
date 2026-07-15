import { useMemo, useState } from 'react'
import type { PlannerActions, PlannerData } from '../../lib/queries/planner'
import { Modal } from '../../components/Modal'
import { fmt, parseTime, resolve, type Cat } from '../../lib/planner'

export interface EditingBlock {
  dow: number
  blockId: string
}

const CUSTOM = '__custom'

export function BlockModal({
  data,
  actions,
  editing,
  onClose,
}: {
  data: PlannerData
  actions: PlannerActions
  editing: EditingBlock
  onClose: () => void
}) {
  const blocks = data.blocksByDow[editing.dow]
  const index = blocks.findIndex((b) => b.id === editing.blockId)
  const block = blocks[index]

  const initialBucket = useMemo(
    () => data.buckets.find((bk) => bk.cat === block?.cat) ?? data.buckets[0],
    [data.buckets, block],
  )
  const [bucketId, setBucketId] = useState(initialBucket?.id ?? '')
  const [title, setTitle] = useState(block?.title ?? '')
  const [detail, setDetail] = useState(block?.detail ?? '')
  const [dur, setDur] = useState(block?.durMin ?? 30)
  const [anchored, setAnchored] = useState(block?.anchored ?? false)
  const [deep, setDeep] = useState(block?.deep ?? false)
  const resolvedStart = index >= 0 ? resolve(blocks)[index].start : 0
  const [start, setStart] = useState(fmt(block?.anchored ? block.startMin : resolvedStart))

  if (!block) return null
  const bucket = data.buckets.find((bk) => bk.id === bucketId)
  const taskNames = bucket?.tasks.map((t) => t.name) ?? []
  const taskValue = taskNames.includes(title) ? title : CUSTOM

  async function save() {
    await actions.updateBlock(block.id, {
      cat: (bucket?.cat ?? block.cat) as Cat,
      title: title.trim() || '(untitled)',
      detail: detail.trim(),
      durMin: Math.max(5, dur || 30),
      anchored,
      deep,
      ...(anchored && { startMin: parseTime(start) }),
    })
    onClose()
  }

  async function remove() {
    await actions.deleteBlock(block.id)
    onClose()
  }

  async function move(dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= blocks.length) return
    await actions.swapBlocks(blocks[index], blocks[j])
  }

  return (
    <Modal title={`${data.days[editing.dow].name} · edit block`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label>Bucket</label>
          <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
            {data.buckets.map((bk) => (
              <option key={bk.id} value={bk.id}>
                {bk.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Task</label>
          <select
            value={taskValue}
            onChange={(e) => {
              if (e.target.value !== CUSTOM) setTitle(e.target.value)
            }}
          >
            {taskNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={CUSTOM}>(custom…)</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>Label (from task, editable)</label>
        <input type="text" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label>Detail</label>
        <textarea maxLength={240} value={detail} onChange={(e) => setDetail(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
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
        <div className="field">
          <label>Fixed start</label>
          <input
            type="time"
            step={300}
            value={start}
            disabled={!anchored}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={anchored} onChange={(e) => setAnchored(e.target.checked)} /> 📌
        Fixed start time (anchor — won't shift)
      </label>
      <label className="check">
        <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /> ▲ Deep work
        (rendered saturated; shallow is muted)
      </label>
      <div className="mt-[18px] flex items-center gap-2">
        <button className="btn danger ghost" onClick={remove}>
          Delete
        </button>
        <div className="flex gap-1.5">
          <button className="btn ghost" title="Move earlier" onClick={() => move(-1)}>
            ↑
          </button>
          <button className="btn ghost" title="Move later" onClick={() => move(1)}>
            ↓
          </button>
        </div>
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
