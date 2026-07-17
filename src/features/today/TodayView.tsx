import { useState } from 'react'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import { catStyles, depthClass, dowMon, fmt, isoDate, onTimelineEntries, resolve, streak, stripeVar } from '../../lib/planner'
import { BlockModal, type EditingBlock } from '../week/BlockModal'
import { DayEditor } from '../week/DayEditor'
import { TodayEditor } from './TodayEditor'
import { TodayEntryModal } from './TodayEntryModal'

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
  const timelineEntries = onTimelineEntries(data.logEntries, todayIso)
  const resolved = resolve(timelineEntries.map((e) => ({ ...e, startMin: e.startMin ?? 0, durMin: e.durMin ?? 30 })))
  const hlog = data.habitLogs[todayIso] ?? {}
  const styles = catStyles(data.buckets)
  const blockById = new Map(data.blocksByDow.flat().map((b) => [b.id, b]))

  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editing, setEditing] = useState<EditingBlock | null>(null)
  const [editingToday, setEditingToday] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [todoText, setTodoText] = useState('')
  const [dumpText, setDumpText] = useState('')

  const doneable = resolved.filter((r) => r.block.cat !== 'life')
  const done = doneable.filter((r) => r.block.state === 'done').length
  const pct = doneable.length ? Math.round((done / doneable.length) * 100) : 0

  const todaysHabits = data.habits.filter((h) => h.days.includes(dow))
  // Todos & brain-dump are bullet-journal log entries (shared with the Log
  // tab). `startMin == null` excludes on-timeline items (Today's plan) —
  // otherwise a hand-added timeline entry would double-list here too.
  const openTaskEntries = data.logEntries.filter(
    (e) => e.kind === 'task' && e.state === 'open' && e.blockId === null && e.startMin == null,
  )
  const todoEntries = data.logEntries.filter(
    (e) =>
      e.kind === 'task' &&
      e.blockId === null &&
      e.startMin == null &&
      (e.state === 'open' || (e.state === 'done' && e.onDate === todayIso)),
  )
  const todayNotes = data.logEntries.filter((e) => e.kind === 'note' && e.onDate === todayIso)
  const deepMins = resolved.filter((r) => r.block.deep).reduce((x, r) => x + r.block.durMin, 0)

  const nowMin = today.getHours() * 60 + today.getMinutes()
  const nextUp = resolved.filter((r) => r.start + r.block.durMin > nowMin && r.block.state !== 'done')[0]

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
            {fmt(nextUp.start)} — {nextUp.block.text}
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

      {/* main: two-column plan + compact sidebar */}
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr] max-lg:grid-cols-1">
        <Card
          title="Today's plan"
          action={
            <div className="flex gap-1">
              <button className="bk-edit" title="Pull today's plan into the log again" onClick={() => actions.materializeDay(todayIso)}>
                ↻
              </button>
              <button className="bk-edit" title="Edit today" onClick={() => setEditingToday(true)}>
                ✎
              </button>
            </div>
          }
        >
          <div style={{ columns: 2, columnGap: 0 }}>
            {resolved.map(({ block: e, start }) => {
              const checked = e.state === 'done'
              const habitId = e.blockId ? blockById.get(e.blockId)?.habitId : null
              return (
                <div
                  key={e.id}
                  className={`citem s-${e.cat}${depthClass(e.deep)}${checked ? ' done' : ''}`}
                  style={{ ...stripeVar(styles[e.cat]), breakInside: 'avoid', gridTemplateColumns: '22px 46px 1fr', gap: 8, padding: '9px 12px' }}
                >
                  <button
                    className="chk"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() =>
                      e.blockId
                        ? actions.toggleBlockLog(e.blockId, todayIso)
                        : actions.updateLogEntry(e.id, { state: checked ? 'open' : 'done' })
                    }
                  >
                    <Check />
                  </button>
                  <div className="time">{fmt(start)}</div>
                  <button
                    className="cursor-pointer border-0 bg-transparent p-0 text-left"
                    title="Edit today's entry"
                    onClick={() => setEditingEntryId(e.id)}
                    style={{ color: 'inherit' }}
                  >
                    <div className="title">
                      {e.text}
                      {habitId && (
                        <span title={`Logs habit: ${data.habits.find((h) => h.id === habitId)?.name ?? ''}`} style={{ marginLeft: 5, fontSize: 11 }}>
                          🔥
                        </span>
                      )}
                    </div>
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
      {editingToday && <TodayEditor data={data} actions={actions} todayIso={todayIso} onClose={() => setEditingToday(false)} />}
      {editingEntryId && (
        <TodayEntryModal
          data={data}
          actions={actions}
          entryId={editingEntryId}
          dateIso={todayIso}
          onClose={() => setEditingEntryId(null)}
        />
      )}
    </div>
  )
}
