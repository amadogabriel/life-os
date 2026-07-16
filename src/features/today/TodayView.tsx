import { useState } from 'react'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import {
  catStyles,
  depthClass,
  dowMon,
  fmt,
  isoDate,
  resolve,
  streak,
  stripeVar,
} from '../../lib/planner'
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
  // Todos & brain-dump are now bullet-journal log entries (shared with the Log tab).
  const openTaskEntries = data.logEntries.filter((e) => e.kind === 'task' && e.state === 'open')
  const todoEntries = data.logEntries.filter(
    (e) => e.kind === 'task' && (e.state === 'open' || (e.state === 'done' && e.onDate === todayIso)),
  )
  const todayNotes = data.logEntries.filter((e) => e.kind === 'note' && e.onDate === todayIso)
  const deepMins = resolved.filter((r) => r.block.deep).reduce((x, r) => x + r.block.durMin, 0)
  const topStreaks = data.habits
    .map((h) => ({ h, s: streak(h, data.habitLogs, today) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 3)
  const nowMin = today.getHours() * 60 + today.getMinutes()
  const upcomingToday = resolved.filter((r) => r.start + r.block.durMin > nowMin && !log[r.block.id])
  const nextUp = upcomingToday[0]
  const tomorrowDow = (dow + 1) % 7
  const upcoming: { key: string; when: string; title: string; deep: boolean; cat: string }[] = [
    ...upcomingToday.map((r) => ({
      key: r.block.id,
      when: fmt(r.start),
      title: r.block.title,
      deep: r.block.deep,
      cat: r.block.cat,
    })),
    ...resolve(data.blocksByDow[tomorrowDow])
      .slice(0, Math.max(0, 6 - upcomingToday.length))
      .map((r) => ({
        key: 'tm-' + r.block.id,
        when: `${data.days[tomorrowDow].name.slice(0, 3)} ${fmt(r.start)}`,
        title: r.block.title,
        deep: r.block.deep,
        cat: r.block.cat,
      })),
  ].slice(0, 6)

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

      <div className="grid items-start gap-4 lg:grid-cols-[1.25fr_1fr_1fr] max-lg:grid-cols-1">
        {/* schedule */}
        <Card
          title="Today's plan"
          action={
            <button className="bk-edit" title="Design today" onClick={() => setEditingDay(dow)}>
              ✎
            </button>
          }
        >
          {resolved.map(({ block: b, start }) => {
            const checked = !!log[b.id]
            return (
              <div
                key={b.id}
                className={`citem s-${b.cat}${depthClass(b.deep)}${checked ? ' done' : ''}`}
                style={stripeVar(styles[b.cat])}
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
        </Card>

        <div className="flex flex-col gap-4">
          {/* todos */}
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
              const done = t.state === 'done'
              return (
                <div key={t.id} className={'litem' + (done ? ' done' : '')}>
                  <button
                    className="chk"
                    role="checkbox"
                    aria-checked={done}
                    onClick={() => actions.updateLogEntry(t.id, { state: done ? 'open' : 'done' })}
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
        </div>

        <div className="flex flex-col gap-4">
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

          {/* coming up */}
          <Card title="Coming up">
            {upcoming.length === 0 && <div className="hint">Nothing left — the day is done.</div>}
            {upcoming.map((u) => (
              <div key={u.key} className={`litem s-${u.cat}${depthClass(u.deep)} upitem`} style={stripeVar(styles[u.cat as never])}>
                <span className="bullet t">{u.when}</span>
                <span className="txt">
                  {u.deep ? '▲ ' : ''}
                  {u.title}
                </span>
              </div>
            ))}
          </Card>

          {/* highlights */}
          <Card title="Highlights">
            <div className="flex flex-col gap-1.5 p-3 text-[13px]" style={{ color: 'var(--ink-soft)' }}>
              <div>
                ▲ Deep work today: <b>{Math.round((deepMins / 60) * 10) / 10}h</b>
              </div>
              <div>
                ✓ Plan done: <b>{pct}%</b> · Todos open: <b>{openTaskEntries.length}</b>
              </div>
              {topStreaks.map(({ h, s }) => (
                <div key={h.id}>
                  🔥 {h.name}: <b>{s}-day streak</b>
                </div>
              ))}
              {topStreaks.length === 0 && <div>No active streaks — log a habit to start one.</div>}
            </div>
          </Card>

          {/* brain dump */}
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
            <div className="hint">
              Today's notes — captured to your Log. Ask Claude Code to organize these into tasks or memos later.
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
