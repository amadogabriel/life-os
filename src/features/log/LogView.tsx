import { useState } from 'react'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import {
  addDays,
  bullet,
  CATS,
  catStyles,
  depthClass,
  fmtDur,
  isoDate,
  nextState,
  SIGNIFIER_GLYPH,
  stripeVar,
  type Cat,
  type LogKind,
} from '../../lib/planner'

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
      <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: 'var(--line-soft)' }}>
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

const KINDS: { kind: LogKind; glyph: string; label: string }[] = [
  { kind: 'task', glyph: '•', label: 'Task' },
  { kind: 'event', glyph: '○', label: 'Event' },
  { kind: 'note', glyph: '—', label: 'Note' },
]

const longDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })

export function LogView({ data, actions, today }: ViewProps) {
  const [offset, setOffset] = useState(0)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<LogKind>('task')

  const sel = addDays(today, offset)
  const selIso = isoDate(sel)
  const isToday = offset === 0
  const isFuture = offset > 0
  const styles = catStyles(data.buckets)

  const entries = data.logEntries
    .filter((e) => e.onDate === selIso)
    .sort((a, b) => a.position - b.position)
  const tasks = entries.filter((e) => e.kind === 'task')
  const openTasks = tasks.filter((e) => e.state === 'open').length
  const doneTasks = tasks.filter((e) => e.state === 'done').length

  const completedBlocks = data.blockLogRows
    .filter((r) => r.dateIso === selIso)
    .filter((r) => r.cat !== 'life')
    .sort((a, b) => Number(b.deep) - Number(a.deep))
  const deepBlocks = completedBlocks.filter((r) => r.deep)
  const completedHabits = Object.keys(data.habitLogs[selIso] ?? {})
    .map((id) => data.habits.find((h) => h.id === id))
    .filter((h): h is NonNullable<typeof h> => !!h)

  async function submit() {
    const t = text.trim()
    if (!t) return
    setText('')
    await actions.addLogEntry({ onDate: selIso, kind, text: t })
  }

  return (
    <div>
      <div className="view-head mb-[18px] flex flex-wrap items-baseline gap-[14px]">
        <div className="flex-1">
          <h2>Log</h2>
          <p>
            {longDate(sel)}
            {isToday ? ' · today' : ''}
            {tasks.length > 0 ? ` · ${doneTasks}/${tasks.length} tasks done` : ''}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button className="btn ghost sm" onClick={() => setOffset(offset - 1)}>
            ← Earlier
          </button>
          {!isToday && (
            <button className="btn ghost sm" onClick={() => setOffset(0)}>
              Today
            </button>
          )}
          <button className="btn ghost sm" onClick={() => setOffset(offset + 1)}>
            Later →
          </button>
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr] max-lg:grid-cols-1">
        {/* the day's rapid log */}
        <Card title={isToday ? 'Rapid log — today' : 'Log'}>
          <div className="flex gap-1.5 p-2.5">
            <div className="flex gap-0.5">
              {KINDS.map((k) => (
                <button
                  key={k.kind}
                  className={'btn ghost sm' + (kind === k.kind ? ' deep-on' : '')}
                  title={k.label}
                  style={{ minWidth: 32 }}
                  onClick={() => setKind(k.kind)}
                >
                  {k.glyph}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="qi flex-1"
              placeholder={isFuture ? 'Log ahead (future)…' : 'Rapid-log a task, event, or note…'}
              maxLength={500}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
            <button className="btn ghost sm" onClick={submit}>
              ＋
            </button>
          </div>

          {entries.length === 0 && (
            <div className="hint">
              {isToday ? "Nothing logged yet — capture what's happening." : 'No entries on this day.'}
            </div>
          )}
          {entries.map((e) => {
            const done = e.state === 'done'
            const dropped = e.state === 'dropped'
            const canCycle = e.kind === 'task'
            return (
              <div key={e.id} className={'litem' + (done ? ' done' : '')} style={stripeVar(styles[e.cat])}>
                <button
                  className="bullet"
                  title={canCycle ? 'Tap to cycle: open → done → dropped' : e.kind}
                  onClick={() => canCycle && actions.updateLogEntry(e.id, { state: nextState(e.kind, e.state) })}
                  style={{
                    border: 0,
                    background: 'transparent',
                    cursor: canCycle ? 'pointer' : 'default',
                    fontFamily: 'var(--mono)',
                    width: 18,
                    color: e.cat !== 'open' ? 'var(--stripe)' : 'var(--ink-faint)',
                  }}
                >
                  {bullet(e.kind, e.state)}
                </button>
                <span
                  className="txt"
                  style={dropped ? { textDecoration: 'line-through', color: 'var(--ink-faint)' } : undefined}
                >
                  {e.signifier && (
                    <span style={{ color: 'var(--accent)', marginRight: 5 }}>{SIGNIFIER_GLYPH[e.signifier]}</span>
                  )}
                  {e.text}
                </span>
                <button
                  className="x"
                  title={e.signifier === 'priority' ? 'Unmark priority' : 'Mark priority'}
                  onClick={() =>
                    actions.updateLogEntry(e.id, { signifier: e.signifier === 'priority' ? '' : 'priority' })
                  }
                  style={{ color: e.signifier === 'priority' ? 'var(--accent)' : undefined }}
                >
                  ✷
                </button>
                <button className="x" title="Delete" onClick={() => actions.deleteLogEntry(e.id)}>
                  ✕
                </button>
              </div>
            )
          })}
          {tasks.length > 0 && (
            <div className="hint">
              {openTasks} open · {doneTasks} done
            </div>
          )}
        </Card>

        {/* the frozen record: what was actually completed that day */}
        <Card title="Accomplished that day">
          {completedBlocks.length === 0 && completedHabits.length === 0 && (
            <div className="hint">Nothing checked off {isToday ? 'yet' : 'this day'}.</div>
          )}
          {completedBlocks.map((r, i) => (
            <div
              key={r.blockId + i}
              className={`citem s-${r.cat}${depthClass(r.deep)} done`}
              style={{ ...stripeVar(styles[r.cat]), gridTemplateColumns: '18px 1fr auto' }}
            >
              <span className="chk" style={{ color: 'var(--accent)' }}>
                <Check />
              </span>
              <div className="title">
                {r.deep ? '▲ ' : ''}
                {r.title}
              </div>
              <div className="time">{fmtDur(r.durMin)}</div>
            </div>
          ))}
          {completedHabits.length > 0 && (
            <div className="flex flex-wrap gap-2 p-3">
              {completedHabits.map((h) => (
                <span key={h.id} className={`htog s-${h.cat}`} style={stripeVar(styles[h.cat])}>
                  <span className="mini" style={{ color: 'var(--accent)' }}>
                    <Check />
                  </span>
                  {h.name}
                </span>
              ))}
            </div>
          )}
          {(completedBlocks.length > 0 || deepBlocks.length > 0) && (
            <div className="hint">
              {completedBlocks.length} block{completedBlocks.length === 1 ? '' : 's'} · {deepBlocks.length} deep ·{' '}
              {completedHabits.length} habit{completedHabits.length === 1 ? '' : 's'}
            </div>
          )}
        </Card>
      </div>

      {/* commitment legend for the day's completed work */}
      {completedBlocks.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {[...new Set(completedBlocks.map((r) => r.cat))].map((cat: Cat) => (
            <span key={cat} className={`qname s-${cat}`} style={stripeVar(styles[cat])}>
              <span className="dot" />
              {CATS[cat]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
