import { useState, type DragEvent } from 'react'
import type { ViewProps } from '../../App'
import { CATS, dowMon, fmt, fmtDur, parseTime, type Cat } from '../../lib/planner'
import { BucketModal } from './BucketModal'
import type { Bucket } from '../../lib/queries/planner'

export function DesignView({ data, actions, today }: ViewProps) {
  const [editingBucket, setEditingBucket] = useState<Bucket | 'new' | null>(null)
  const [applyDow, setApplyDow] = useState(dowMon(today))
  const [dragOver, setDragOver] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [applied, setApplied] = useState('')

  const items = data.designItems
  const total = items.reduce((x, it) => x + it.mins, 0)
  const free = 1440 - total
  const byCat: Partial<Record<Cat, number>> = {}
  for (const it of items) byCat[it.cat] = (byCat[it.cat] ?? 0) + it.mins
  const labelForCat = (c: Cat) => data.buckets.find((bk) => bk.cat === c)?.name ?? CATS[c] ?? c
  const h1 = (m: number) => Math.round((m / 60) * 10) / 10

  function addFromChip(bucketId: string, taskId: string) {
    const bucket = data.buckets.find((bk) => bk.id === bucketId)
    const task = bucket?.tasks.find((t) => t.id === taskId)
    if (!bucket || !task) return
    actions.addDesignItem({ name: task.name, cat: bucket.cat }, items.length)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const s = e.dataTransfer.getData('text/plain')
    if (s) {
      const [bk, task] = s.split('|')
      addFromChip(bk, task)
    }
  }

  let cursor = data.designWakeMin

  return (
    <div>
      <div className="view-head mb-[18px]">
        <h2>Design a day</h2>
        <p>
          Compose a day from hour-sized tasks. <b>Drag a task into the day</b> (or tap it), set a multiplier
          for longer blocks, reorder to re-time from your wake time. Then apply the finished day to any day
          in your Week.
        </p>
      </div>
      <div className="grid items-start gap-4 max-md:grid-cols-1 md:grid-cols-[1fr_290px]">
        <div className="sticky top-2.5">
          <div className="daycard">
            <div className="flex flex-wrap items-center gap-3 border-b p-[12px_16px]" style={{ borderColor: 'var(--line)' }}>
              <h3 className="m-0 text-[17px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
                The day
              </h3>
              <span className="wakebox">
                wake{' '}
                <input
                  type="time"
                  step={300}
                  value={fmt(data.designWakeMin)}
                  onChange={(e) => actions.setWake(parseTime(e.target.value))}
                />
              </span>
              <div className="flex-1" />
              <button
                className="btn ghost sm"
                onClick={() => {
                  if (!items.length) return
                  if (!confirmClear) {
                    setConfirmClear(true)
                    setTimeout(() => setConfirmClear(false), 1800)
                    return
                  }
                  setConfirmClear(false)
                  actions.resetDesign()
                }}
              >
                {confirmClear ? 'Tap again to clear' : 'Clear'}
              </button>
            </div>
            <div
              className={'day-items flex min-h-[90px] flex-col' + (dragOver ? ' dragover' : '')}
              onDragOver={(e) => {
                e.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={(e) => {
                if (e.target === e.currentTarget) setDragOver(false)
              }}
              onDrop={onDrop}
            >
              {items.length === 0 && (
                <div className="p-[28px_16px] text-center text-[13px]" style={{ color: 'var(--ink-faint)' }}>
                  Drag a task here, or tap a task chip to add. Then use − / ＋ for 30-min steps.
                </div>
              )}
              {items.map((it, i) => {
                const start = cursor
                cursor += it.mins
                return (
                  <div key={it.id} className={`ditem s-${it.cat}`}>
                    <div className="time">{fmt(start)}</div>
                    <div className="nm">{it.name}</div>
                    <div className="stp">
                      <button
                        title="30 min less"
                        onClick={() => actions.updateDesignItem(it.id, { mins: Math.max(30, it.mins - 30) })}
                      >
                        −
                      </button>
                      <span className="hrs">{fmtDur(it.mins)}</span>
                      <button
                        title="30 min more"
                        onClick={() => actions.updateDesignItem(it.id, { mins: Math.min(960, it.mins + 30) })}
                      >
                        ＋
                      </button>
                      <button title="Earlier" onClick={() => i > 0 && actions.swapDesignItems(it, items[i - 1])}>
                        ↑
                      </button>
                      <button
                        title="Later"
                        onClick={() => i < items.length - 1 && actions.swapDesignItems(it, items[i + 1])}
                      >
                        ↓
                      </button>
                      <button className="x" title="Remove" onClick={() => actions.deleteDesignItem(it.id)}>
                        ✕
                      </button>
                    </div>
                  </div>
                )
              })}
              {items.length > 0 && (
                <div className="dayend">
                  <div className="time">{fmt(cursor)}</div>
                  <div className="nm">end of day</div>
                </div>
              )}
            </div>
            <div className="border-t p-[14px_16px]" style={{ borderColor: 'var(--line)' }}>
              <div className="budgetlabel">
                {h1(total)} / 24 h planned ·{' '}
                {free >= 0 ? (
                  <span style={{ color: 'var(--ink-faint)' }}>{h1(free)}h free</span>
                ) : (
                  <span style={{ color: 'var(--danger)' }}>{h1(-free)}h over</span>
                )}
              </div>
              <div className="budgetbar">
                {(Object.keys(byCat) as Cat[]).map((c) => (
                  <div
                    key={c}
                    style={{
                      height: '100%',
                      width: `${(Math.min(byCat[c]!, 1440) / 1440) * 100}%`,
                      background: `var(--b-${c === 'exercise' ? 'exer' : c})`,
                    }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-[13px] gap-y-1.5">
                {(Object.keys(byCat) as Cat[]).map((c) => (
                  <span key={c} className={`bchip s-${c}`}>
                    <span className="dot" />
                    {labelForCat(c)} {fmtDur(byCat[c]!)}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t p-[12px_16px]" style={{ borderColor: 'var(--line)' }}>
              <span className="text-[13px]" style={{ color: 'var(--ink-soft)' }}>
                Apply this day to:
              </span>
              <select
                className="rounded-[7px] border p-[6px_9px] text-[13px]"
                style={{ background: 'var(--paper)', borderColor: 'var(--line)', color: 'var(--ink)' }}
                value={applyDow}
                onChange={(e) => setApplyDow(+e.target.value)}
              >
                {data.days.map((d, i) => (
                  <option key={i} value={i}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                className="btn primary sm"
                onClick={async () => {
                  if (!items.length) {
                    setApplied('Add tasks first')
                  } else {
                    await actions.applyDesignToDay(applyDow, items, data.designWakeMin)
                    setApplied('✓ Saved to ' + data.days[applyDow].name)
                  }
                  setTimeout(() => setApplied(''), 1700)
                }}
              >
                {applied || '→ Save to Week'}
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-col">
          <div className="flex flex-col gap-3">
            {data.buckets.map((bk) => (
              <div key={bk.id} className="bucket">
                <div className="bucket-head">
                  <span className={`hname s-${bk.cat}`}>
                    <span className="dot" />
                    {bk.name}
                  </span>
                  <button className="bk-edit" title="Edit bucket" onClick={() => setEditingBucket(bk)}>
                    ⋯
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-[11px_13px]">
                  {bk.tasks.map((tk) => (
                    <button
                      key={tk.id}
                      className={`chip s-${bk.cat}`}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', bk.id + '|' + tk.id)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => addFromChip(bk.id, tk.id)}
                    >
                      {tk.name}
                      <span className="add">＋</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button className="addbucket mt-3 w-full" onClick={() => setEditingBucket('new')}>
            + New bucket
          </button>
        </div>
      </div>
      {editingBucket && (
        <BucketModal
          bucket={editingBucket === 'new' ? null : editingBucket}
          onSave={async (b) => {
            await actions.saveBucket(b, data.buckets.length)
            setEditingBucket(null)
          }}
          onDelete={async (id) => {
            await actions.deleteBucket(id)
            setEditingBucket(null)
          }}
          onClose={() => setEditingBucket(null)}
        />
      )}
    </div>
  )
}
