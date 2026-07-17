import { useState } from 'react'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import {
  addDays,
  blockStyle,
  depthClass,
  dowOfIso,
  fmt,
  fromIso,
  frozenPastEntries,
  isoDate,
  longDate,
  materializes,
  onTimelineEntries,
  resolve,
  streak,
  stripeVar,
  type LogEntry,
  type Resolved,
} from '../../lib/planner'
import { BlockModal, type EditingBlock } from '../planner/BlockModal'
import { DayEditor } from '../planner/DayEditor'
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

/** One day back/forward from an ISO date, in local calendar terms. */
const shiftIso = (iso: string, delta: number) => isoDate(addDays(fromIso(iso), delta))

export function TodayView({ data, actions, today }: ViewProps) {
  const todayIso = isoDate(today)
  // The Today tab's pageable past-day view (#25): `viewedIso` drives every
  // card on this tab. Defaults to the actual current day and resets on
  // remount — no persistence, so reopening the app always lands on today.
  const [viewedIso, setViewedIso] = useState(todayIso)
  const isViewingToday = viewedIso === todayIso
  const yesterdayIso = shiftIso(todayIso, -1)
  const dow = dowOfIso(viewedIso)
  const day = data.days[dow]

  // Live today: the editable on-timeline lens. Any other (always past) day:
  // the frozen-past lens with full record state — dropped/migrated included,
  // never re-flowed (mirrors the ADR-0002 amendment; see `frozenPastEntries`).
  const resolved: Resolved<LogEntry & { durMin: number }>[] = isViewingToday
    ? resolve(
        onTimelineEntries(data.logEntries, todayIso).map((e) => ({ ...e, startMin: e.startMin ?? 0, durMin: e.durMin ?? 30 })),
      )
    : frozenPastEntries(data.logEntries, viewedIso)

  const hlog = data.habitLogs[viewedIso] ?? {}
  const blockById = new Map(data.blocksByDow.flat().map((b) => [b.id, b]))

  const [editingDay, setEditingDay] = useState<number | null>(null)
  const [editing, setEditing] = useState<EditingBlock | null>(null)
  const [editingToday, setEditingToday] = useState(false)
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null)
  const [todoText, setTodoText] = useState('')
  const [dumpText, setDumpText] = useState('')

  const doneable = resolved.filter((r) => materializes(r.block, data.buckets))
  const done = doneable.filter((r) => r.block.state === 'done').length
  const pct = doneable.length ? Math.round((done / doneable.length) * 100) : 0

  const todaysHabits = data.habits.filter((h) => h.days.includes(dow))
  // Todos & brain-dump are bullet-journal log entries (shared with the Log
  // tab). `startMin == null` excludes on-timeline items (Today's plan) —
  // otherwise a hand-added timeline entry would double-list here too. Open
  // todos are an undated backlog (visible regardless of the day paged to);
  // "done" and notes are scoped to the viewed day (#25's #11).
  const openTaskEntries = data.logEntries.filter(
    (e) => e.kind === 'task' && e.state === 'open' && e.blockId === null && e.startMin == null,
  )
  const todoEntries = data.logEntries.filter(
    (e) =>
      e.kind === 'task' &&
      e.blockId === null &&
      e.startMin == null &&
      (e.state === 'open' || (e.state === 'done' && e.onDate === viewedIso)),
  )
  const viewedNotes = data.logEntries.filter((e) => e.kind === 'note' && e.onDate === viewedIso)
  const deepMins = resolved.filter((r) => r.block.deep).reduce((x, r) => x + r.block.durMin, 0)

  const nowMin = today.getHours() * 60 + today.getMinutes()
  // "Next up" only means something for the actual live day.
  const nextUp = isViewingToday ? resolved.filter((r) => r.start + r.block.durMin > nowMin && r.block.state !== 'done')[0] : undefined

  async function submitTodo() {
    const t = todoText.trim()
    if (!t) return
    setTodoText('')
    await actions.addLogEntry({ onDate: viewedIso, kind: 'task', text: t })
  }

  async function submitDump() {
    const t = dumpText.trim()
    if (!t) return
    setDumpText('')
    await actions.addLogEntry({ onDate: viewedIso, kind: 'note', text: t })
  }

  const cardTitle = isViewingToday ? 'Today' : longDate(fromIso(viewedIso)) + (viewedIso === yesterdayIso ? ' · yesterday' : '')

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
            {longDate(fromIso(viewedIso))}
            {isViewingToday ? ' · today' : ''} · {Math.round((deepMins / 60) * 10) / 10}h deep work planned
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
          {viewedNotes.map((d) => (
            <div key={d.id} className="litem">
              <span className="bullet">—</span>
              <span className="txt">{d.text}</span>
              <button className="x" title="Delete" onClick={() => actions.deleteLogEntry(d.id)}>
                ✕
              </button>
            </div>
          ))}
          {viewedNotes.length === 0 && (
            <div className="hint">{isViewingToday ? "Today's notes land here and in your Log." : 'No notes this day.'}</div>
          )}
        </Card>
      </div>

      {/* main: two-column plan + compact sidebar */}
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr] max-lg:grid-cols-1">
        <Card
          title={cardTitle}
          action={
            <div className="flex items-center gap-1">
              <button className="btn ghost sm" onClick={() => setViewedIso(shiftIso(viewedIso, -1))}>
                ‹ Earlier
              </button>
              {!isViewingToday && (
                <button className="btn ghost sm" onClick={() => setViewedIso(todayIso)}>
                  Today
                </button>
              )}
              {!isViewingToday && (
                <button className="btn ghost sm" onClick={() => setViewedIso(shiftIso(viewedIso, 1))}>
                  Later ›
                </button>
              )}
              <span className="mx-1" style={{ color: 'var(--line)' }}>
                |
              </span>
              <button className="bk-edit" title="Pull this day's plan into the log again" onClick={() => actions.materializeDay(viewedIso)}>
                ↻
              </button>
              <button className="bk-edit" title={isViewingToday ? 'Edit today' : 'Edit this day'} onClick={() => setEditingToday(true)}>
                ✎
              </button>
            </div>
          }
        >
          <div style={{ columns: 2, columnGap: 0 }}>
            {resolved.map(({ block: e, start }) => {
              const checked = e.state === 'done'
              const struck = checked || e.state === 'dropped' || e.state === 'migrated'
              // A Block-placed chip carries its habit on the Block; a chip placed
              // via the Today editor carries it on the entry itself (#24).
              const habitId = e.blockId ? blockById.get(e.blockId)?.habitId : e.habitId
              return (
                <div
                  key={e.id}
                  className={`citem s-${e.cat}${depthClass(e.deep)}${struck ? ' done' : ''}`}
                  style={{ ...stripeVar(blockStyle({ bucketId: e.bucketId, cat: e.cat }, data.buckets)), breakInside: 'avoid', gridTemplateColumns: '22px 46px 1fr', gap: 8, padding: '9px 12px' }}
                >
                  <button
                    className="chk"
                    role="checkbox"
                    aria-checked={checked}
                    onClick={() =>
                      e.blockId
                        ? actions.toggleBlockLog(e.blockId, viewedIso)
                        : actions.updateLogEntry(e.id, { state: checked ? 'open' : 'done' })
                    }
                  >
                    <Check />
                  </button>
                  <div className="time">{fmt(start)}</div>
                  <button
                    className="cursor-pointer border-0 bg-transparent p-0 text-left"
                    title="Edit this entry"
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
                      {e.state === 'dropped' && (
                        <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--ink-faint)' }}>⊘ dropped</span>
                      )}
                      {e.state === 'migrated' && (
                        <span style={{ marginLeft: 5, fontSize: 11, color: 'var(--ink-faint)' }}>› migrated</span>
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
                    style={stripeVar(blockStyle(h, data.buckets))}
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => actions.toggleHabitLog(h.id, viewedIso)}
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
                            ...stripeVar(blockStyle({ bucketId: r.block.bucketId, cat: r.block.cat }, data.buckets)),
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
      {editingToday && (
        <TodayEditor
          data={data}
          actions={actions}
          dateIso={viewedIso}
          past={!isViewingToday}
          todayIso={todayIso}
          onClose={() => setEditingToday(false)}
        />
      )}
      {editingEntryId && (
        <TodayEntryModal
          data={data}
          actions={actions}
          entryId={editingEntryId}
          dateIso={viewedIso}
          past={!isViewingToday}
          todayIso={todayIso}
          onClose={() => setEditingEntryId(null)}
        />
      )}
    </div>
  )
}
