import { useState } from 'react'
import type { ViewProps } from '../../App'
import { CATS, dowMon, fmt, fmtDur, resolve, type Cat } from '../../lib/planner'
import { BlockModal, type EditingBlock } from './BlockModal'
import { DayEditor } from './DayEditor'

const PXMIN = 38 / 30 // 30 min = 38px, shared across all days

export function WeekView({ data, actions, today }: ViewProps) {
  const [editing, setEditing] = useState<EditingBlock | null>(null)
  const [editingDay, setEditingDay] = useState<number | null>(null)
  const todayDow = dowMon(today)

  const resolved = data.blocksByDow.map((blocks) => resolve(blocks))
  let axisStart: number | null = null
  let axisEnd: number | null = null
  for (const res of resolved) {
    if (!res.length) continue
    const s = res[0].start
    const e = res[res.length - 1].start + res[res.length - 1].block.durMin
    if (axisStart === null || s < axisStart) axisStart = s
    if (axisEnd === null || e > axisEnd) axisEnd = e
  }
  if (axisStart === null || axisEnd === null) {
    axisStart = 300
    axisEnd = 1320
  }
  const spanPx = Math.round((axisEnd - axisStart) * PXMIN)
  const hourPx = Math.round(60 * PXMIN)
  const gridBg = `repeating-linear-gradient(to bottom, var(--line-soft) 0, var(--line-soft) 1px, transparent 1px, transparent ${hourPx}px)`

  const hourLabels: number[] = []
  for (let mm = Math.ceil(axisStart / 60) * 60; mm <= axisEnd; mm += 60) hourLabels.push(mm)

  async function addBlock(dow: number) {
    const id = await actions.addBlock(dow, data.blocksByDow[dow].length)
    setEditing({ dow, blockId: id })
  }

  return (
    <div>
      <div className="view-head mb-[18px]">
        <h2>The week</h2>
        <p>
          Your standing rhythm and this week's plan in one place. Click a block to edit; 📌 anchors hold
          their time, everything between re-flows.
        </p>
      </div>
      <div className="mb-5 flex flex-wrap gap-x-[15px] gap-y-[7px]">
        {(Object.keys(CATS) as Cat[])
          .filter((k) => k !== 'life' && k !== 'open')
          .map((k) => (
            <span key={k} className={`legend-chip s-${k}`}>
              <span className="dot" />
              {CATS[k]}
            </span>
          ))}
      </div>
      <div className="week">
        <div>
          <div className="day-head" style={{ borderBottomColor: 'transparent', background: 'transparent' }}>
            <span className="gname">Time</span>
          </div>
          <div className="blocks" style={{ height: spanPx }}>
            {hourLabels.map((mm) => (
              <div key={mm} className="hourlab" style={{ top: Math.round((mm - axisStart!) * PXMIN) }}>
                {fmt(mm)}
              </div>
            ))}
          </div>
        </div>
        {data.days.map((day, di) => (
          <div key={di} className={'day' + (di === todayDow ? ' today' : '')}>
            <div className="day-head">
              <span className="dname">{day.name}</span>
              <span className="flex items-center gap-1">
                <span className="dtag">{day.loc}</span>
                <button className="bk-edit" title="Edit day" onClick={() => setEditingDay(di)}>
                  ✎
                </button>
              </span>
            </div>
            <div className="blocks" style={{ height: spanPx, background: gridBg }}>
              {resolved[di].map(({ block: b, start, conflict }) => {
                const top = Math.round((start - axisStart!) * PXMIN)
                const hpx = Math.round(b.durMin * PXMIN)
                const lines = Math.max(1, Math.floor((hpx - 4) / 14))
                const tip = `${fmt(start)} · ${fmtDur(b.durMin)} — ${b.title}${b.detail ? '\n' + b.detail : ''}`
                return (
                  <div
                    key={b.id}
                    className={`block s-${b.cat}${b.cat === 'open' ? ' is-open' : ''}${conflict ? ' conflict' : ''}`}
                    style={{ top, height: hpx }}
                    tabIndex={0}
                    title={tip}
                    onClick={() => setEditing({ dow: di, blockId: b.id })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setEditing({ dow: di, blockId: b.id })
                      }
                    }}
                  >
                    <div className="title" style={{ WebkitLineClamp: lines }}>
                      {b.title}
                      {b.anchored ? <span className="text-[8px]"> 📌</span> : null}
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="p-[6px_8px]">
              <button className="add-block" onClick={() => addBlock(di)}>
                + Add block
              </button>
            </div>
          </div>
        ))}
      </div>
      {editingDay !== null && (
        <DayEditor
          data={data}
          actions={actions}
          dow={editingDay}
          onClose={() => setEditingDay(null)}
          onEditBlock={(blockId) => setEditing({ dow: editingDay, blockId })}
        />
      )}
      {editing && (
        <BlockModal data={data} actions={actions} editing={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}
