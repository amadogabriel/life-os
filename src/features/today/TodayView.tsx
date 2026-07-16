import { useState } from 'react'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import { catStyles, depthClass, DOW, dowMon, fmt, isoDate, resolve, streak, stripeVar, weekDates } from '../../lib/planner'
import { BlockModal, type EditingBlock } from '../week/BlockModal'
import { DayEditor } from '../week/DayEditor'

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
      <div
        className="flex items-center justify-between border-b px-4 py-2.5"
        style={{ borderColor: 'var(--line-soft)' }}
      >
        <span
          className="text-[11px] uppercase tracking-[0.09em]"
          style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}
        >
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  )
}

export function TodayView({ data, actions, today }: ViewProps) {
  const dow = dowMon(today)
  const todayIso = isoDate(today)
  const day = data.days[dow]
  const resolved = resolve(data.blocksByDow[dow])
  const log = data.blockLogs[todayIso] ?? {}
  const hlog = data.habitLogs[todayIso] ?? {}
  const styles = catStyles(data.buckets)

  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editing, setEditing] = useState<EditingBlock | null>(null)
  const [todoText, setTodoText] = useState('')
  const [dumpText, setDumpText] = useState('')

  const doneable = resolved.filter((r) => r.block.cat !== 'life')
  const done = doneable.filter((r) => log[r.block.id]).length
  const pct = doneable.length ? Math.round((done / doneable.length) * 100) : 0

  const todaysHabits = data.habits.filter((h) => h.days.includes(dow))
  // Todos & brain-dump are bullet-journal log entries (shared with the Log tab).
  const openTaskEntries = data.logEntries.filter((e) => e.kind === 'task' && e.state === 'open')
  const todoEntries = data.logEntries.filter(
    (e) => e.kind === 'task' && (e.state === 'open' || (e.state === 'done' && e.onDate === todayIso)),
  )
  const todayNotes = data.logEntries.filter((e) => e.kind === 'note' && e.onDate === todayIso)
  const deepMins = resolved.filter((r) => r.block.deep).reduce((x, r) => x + r.block.durMin, 0)

  const nowMin = today.getHours() * 60 + today.getMinutes()
  const nextUp = resolved.filter((r) => r.start + r.block.durMin > nowMin && !log[r.block.id])[0]

  // Sprint work: open tasks from active sprints, planned into this week.
  const week = weekDates(today)
  const activeSprintIds = new Set(data.sprints.filter((s) => s.status === 'active').map((s) => s.id))
  const sprintById = new Map(data.sprints.map((s) => [s.id, s]))
  const projectById = new Map(data.projects.map((p) => [p.id, p]))
  const sprintTasks = data.logEntries.filter(
    (e) => e.kind === 'task' && e.state === 'open' && e.sprintId && activeSprintIds.has(e.sprintId),
  )

  async function submitTodo() {
    const t = todoText.trim()
    if (!t) return
    setTodoText('')
    await actions.addLogEntry({ onDate: todayIso, kind: 'task', text: t })
  }

  async function submitDump() {
    const t = dumpText.trim()
    if (!t) return
    setDumpText('')
    await actions.addLogEntry({ onDate: todayIso, kind: 'note', text: t })
  }

  return (
    <div>
      {/* header */}
      <div
        className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border px-5 py-3"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
      >
        <div className="ring ring-sm" style={{ ['--p' as string]: pct }}>
          <span>{pct}%</span>
        </div>
        <div className="min-w-[150px] flex-1">
          <div className="text-[19px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
            {day.name} · {day.loc}
          </div>
          <div className="mt-0.5 text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            {today.toDateString()} · {Math.round((deepMins / 60) * 10) / 10}h deep work planned
          </div>
        </div>
        {nextUp && (
          <div className="text-right text-[12.5px]" style={{ color: 'var(--ink-soft)' }}>
            <div className="text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
              next up
            </div>
            {fmt(nextUp.start)} — {nextUp.block.title}
          </div>
        )}
      </div>

      {/* top row: capture — todos + brain dump */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card title={`Todos${openTaskEntries.length ? ` · ${openTaskEntries.length} open` : ''}`}>
          <div className="flex gap-1.5 p-2.5">
            <input
              type="text"
              className="qi flex-1"
              placeholder="Add a todo…"
              maxLength={200}
              value={todoText}
              onChange={(e) => setTodoText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitTodo()}
            />
            <button className="btn ghost sm" onClick={submitTodo}>
              ＋
            </button>
          </div>
          {todoEntries.map((t) => {
            const isDone = t.state === 'done'
            return (
              <div key={t.id} className={'litem' + (isDone ? ' done' : '')}>
                <button
                  className="chk"
                  role="checkbox"
                  aria-checked={isDone}
                  onClick={() => actions.updateLogEntry(t.id, { state: isDone ? 'open' : 'done' })}
                >
                  <Check />
                </button>
                <span className="txt">{t.text}</span>
                <button className="x" title="Delete" onClick={() => actions.deleteLogEntry(t.id)}>
                  ✕
                </button>
              </div>
            )
          })}
          {todoEntries.length === 0 && <div className="hint">Nothing yet — capture the day's musts.</div>}
        </Card>

        <Card title="Brain dump">
          <div className="flex gap-1.5 p-2.5">
            <input
              type="text"
              className="qi flex-1"
              placeholder="Park a thought…"
              maxLength={500}
              value={dumpText}
              onChange={(e) => setDumpText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitDump()}
            />
            <button className="btn ghost sm" onClick={submitDump}>
              ＋
            </button>
          </div>
          {todayNotes.map((d) => (
            <div key={d.id} className="litem">
              <span className="bullet">—</span>
              <span className="txt">{d.text}</span>
              <button className="x" title="Delete" onClick={() => actions.deleteLogEntry(d.id)}>
                ✕
              </button>
            </div>
          ))}
          {todayNotes.length === 0 && (
            <div className="hint">Today's notes land here and in your Log.</div>
          )}
        </Card>
      </div>

      {/* sprint work — plan active-sprint tasks into the week */}
      {sprintTasks.length > 0 && (
        <div className="mb-4">
          <Card title="Sprint work — plan into your week">
            {sprintTasks.map((e) => {
              const wk = week.findIndex((d) => isoDate(d) === e.onDate)
              const sp = e.sprintId ? sprintById.get(e.sprintId) : undefined
              const pr = sp ? projectById.get(sp.projectId) : undefined
              return (
                <div key={e.id} className="litem flex-wrap" style={stripeVar(styles[e.cat])}>
                  <span className="txt">
                    {e.text}
                    {(pr || sp) && (
                      <span style={{ color: 'var(--ink-faint)', fontSize: 11, marginLeft: 6 }}>
                        {pr?.name}
                        {sp ? ` · ${sp.name}` : ''}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-0.5">
                    {DOW.map((d, i) => (
                      <button
                        key={i}
                        className={'btn ghost sm' + (wk === i ? ' deep-on' : '')}
                        style={{ minWidth: 26, padding: '3px 5px' }}
                        title={`Schedule ${d}`}
                        onClick={() => actions.updateLogEntry(e.id, { onDate: isoDate(week[i]) })}
                      >
                        {d[0]}
                      </button>
                    ))}
                  </span>
                  {wk >= 0 && !e.blockId && (
                    <button className="btn ghost sm" title="Drop onto that day's timeline" onClick={() => actions.scheduleBlockFromEntry(e.id, wk)}>
                      ▸ block
                    </button>
                  )}
                  {e.blockId && (
                    <span className="text-[11px]" style={{ color: 'var(--accent)' }}>
                      ▸ blocked
                    </span>
                  )}
                  <button className="chk" role="checkbox" aria-checked={false} title="Mark done" onClick={() => actions.updateLogEntry(e.id, { state: 'done' })}>
                    <Check />
                  </button>
                </div>
              )
            })}
            <div className="hint">Tap a day to schedule; ▸ block drops it onto that day's timeline.</div>
          </Card>
        </div>
      )}

      {/* main: two-column plan + compact sidebar */}
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr] max-lg:grid-cols-1">
        <Card
          title="Today's plan"
          action={
            <button className="bk-edit" title="Design today" onClick={() => setEditingDay(dow)}>
              ✎
            </button>
          }
        >
          <div style={{ columns: 2, columnGap: 0 }}>
            {resolved.map(({ block: b, start }) => {
              const checked = !!log[b.id]
              return (
                <div
                  key={b.id}
                  className={`citem s-${b.cat}${depthClass(b.deep)}${checked ? ' done' : ''}`}
                  style={{ ...stripeVar(styles[b.cat]), breakInside: 'avoid', gridTemplateColumns: '22px 46px 1fr', gap: 8, padding: '9px 12px' }}
                >
                  <button
                    className="chk"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() => actions.toggleBlockLog(b.id, todayIso)}
                  >
                    <Check />
                  </button>
                  <div className="time">{fmt(start)}</div>
                  <button
                    className="cursor-pointer border-0 bg-transparent p-0 text-left"
                    title="Edit block"
                    onClick={() => setEditing({ dow, blockId: b.id })}
                    style={{ color: 'inherit' }}
                  >
                    <div className="title">{b.title}</div>
                    {b.detail && <div className="desc">{b.detail}</div>}
                  </button>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="flex flex-col gap-4">
          {/* habits */}
          <Card title="Habits — tap to log">
            <div className="flex flex-wrap gap-2 p-3">
              {todaysHabits.length === 0 && <span className="hint p-0">No habits target today.</span>}
              {todaysHabits.map((h) => {
                const on = !!hlog[h.id]
                const s = streak(h, data.habitLogs, today)
                return (
                  <button
                    key={h.id}
                    className={`htog s-${h.cat}`}
                    style={stripeVar(styles[h.cat])}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => actions.toggleHabitLog(h.id, todayIso)}
                  >
                    <span className="mini">
                      <Check />
                    </span>
                    {h.name} <span className="flame">{s > 0 ? `🔥${s}` : ''}</span>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* week at a glance */}
          <Card title="Week at a glance">
            <div className="flex flex-col gap-1 p-3">
              {data.days.map((d, di) => {
                const res = resolve(data.blocksByDow[di])
                const total = res.reduce((x, r) => x + r.block.durMin, 0) || 1
                return (
                  <button
                    key={di}
                    className="glance-row"
                    title={`${d.name} — tap to design`}
                    onClick={() => setEditingDay(di)}
                  >
                    <span className={'gd' + (di === dow ? ' today' : '')}>{d.name.slice(0, 3)}</span>
                    <span className="gbar">
                      {res.map((r) => (
                        <span
                          key={r.block.id}
                          className={`gseg s-${r.block.cat}${depthClass(r.block.deep)}`}
                          style={{
                            ...stripeVar(styles[r.block.cat]),
                            width: `${(r.block.durMin / total) * 100}%`,
                          }}
                        />
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
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
