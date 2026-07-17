import { useState } from 'react'
import type { ViewProps } from '../../App'
import { BujoLegend } from '../../components/BujoLegend'
import { Check } from '../../components/Check'
import {
  addDays,
  blockStyle,
  bullet,
  depthClass,
  fmtDur,
  fromIso,
  isoDate,
  longDate,
  materializes,
  SIGNIFIER_GLYPH,
  stripeVar,
  type BlockLogRow,
  type LogEntry,
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mdShort = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}`
}

export function LogView({ data, actions, today }: ViewProps) {
  const [mode, setMode] = useState<'day' | 'journal'>('day')
  const [offset, setOffset] = useState(0)
  const [text, setText] = useState('')
  const [kind, setKind] = useState<LogKind>('task')
  const [bucketId, setBucketId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const realTodayIso = isoDate(today)
  const sel = addDays(today, offset)
  const selIso = isoDate(sel)
  const isToday = offset === 0
  const isFuture = offset > 0
  const bucketById = new Map(data.buckets.map((bk) => [bk.id, bk]))
  // Log Entries / frozen block rows recolor LIVE through their Bucket (#18).
  const entryStyle = (e: { bucketId: string | null; cat: LogEntry['cat'] }) =>
    stripeVar(blockStyle({ bucketId: e.bucketId, cat: e.cat }, data.buckets))

  // rapid entry targets the selected day (day mode) or today (journal mode)
  const entryDate = mode === 'journal' ? realTodayIso : selIso
  async function submit() {
    const t = text.trim()
    if (!t) return
    setText('')
    // The picked Bucket rides along; `cat` is stamped from it on write (#18).
    await actions.addLogEntry({ onDate: entryDate, kind, text: t, bucketId })
  }

  // migration ritual — open tasks stranded before today. Life-category
  // entries (sleep/meals) are materialized housekeeping, not commitments to
  // decide the fate of — excluded here exactly as they're excluded from
  // completion % (they simply never existed as entries before this filter
  // was needed).
  const staleOpen = data.logEntries
    .filter((e) => e.kind === 'task' && e.state === 'open' && materializes(e, data.buckets) && e.onDate < realTodayIso)
    .sort((a, b) => a.onDate.localeCompare(b.onDate))
  async function carryAll() {
    for (const e of staleOpen) await actions.migrateLogEntry(e.id, realTodayIso, false)
  }

  function saveEdit(id: string) {
    const t = editText.trim()
    setEditId(null)
    const cur = data.logEntries.find((e) => e.id === id)
    if (t && cur && t !== cur.text) actions.updateLogEntry(id, { text: t })
  }

  /** One rapid-log entry row: click text to edit; explicit state buttons. */
  function entryRow(e: LogEntry) {
    const done = e.state === 'done'
    const dropped = e.state === 'dropped'
    const editing = editId === e.id
    const iconBtn = (glyph: string, title: string, on: boolean, onClick: () => void, activeColor = 'var(--accent)') => (
      <button className="x" title={title} onClick={onClick} style={{ color: on ? activeColor : undefined, fontFamily: 'var(--mono)' }}>
        {glyph}
      </button>
    )
    return (
      <div key={e.id} className={'litem flex-wrap' + (done ? ' done' : '')} style={entryStyle(e)}>
        <span
          className="bullet"
          style={{ fontFamily: 'var(--mono)', width: 16, color: e.bucketId ? 'var(--stripe)' : 'var(--ink-faint)' }}
        >
          {bullet(e.kind, e.state)}
        </span>
        {editing ? (
          <input
            autoFocus
            className="qi flex-1"
            value={editText}
            onChange={(ev) => setEditText(ev.target.value)}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') saveEdit(e.id)
              if (ev.key === 'Escape') setEditId(null)
            }}
            onBlur={() => saveEdit(e.id)}
          />
        ) : (
          <span
            className="txt"
            title="Click to edit"
            onClick={() => {
              setEditId(e.id)
              setEditText(e.text)
            }}
            style={{ cursor: 'text', ...(dropped ? { textDecoration: 'line-through', color: 'var(--ink-faint)' } : {}) }}
          >
            {e.signifier && <span style={{ color: 'var(--accent)', marginRight: 5 }}>{SIGNIFIER_GLYPH[e.signifier]}</span>}
            {e.text}
          </span>
        )}
        {!editing && (
          <>
            {e.kind === 'task' &&
              iconBtn('✓', done ? 'Mark open' : 'Mark done', done, () =>
                actions.updateLogEntry(e.id, { state: done ? 'open' : 'done' }),
              )}
            {e.kind === 'task' &&
              e.state === 'open' &&
              iconBtn('›', 'Carry forward to today', false, () => actions.migrateLogEntry(e.id, realTodayIso, false))}
            {iconBtn('⊘', dropped ? 'Undrop' : 'Drop', dropped, () =>
              actions.updateLogEntry(e.id, { state: dropped ? 'open' : 'dropped' }), 'var(--danger)',
            )}
            {iconBtn('✷', e.signifier === 'priority' ? 'Unmark priority' : 'Mark priority', e.signifier === 'priority', () =>
              actions.updateLogEntry(e.id, { signifier: e.signifier === 'priority' ? '' : 'priority' }),
            )}
            <button className="x" title="Delete" onClick={() => actions.deleteLogEntry(e.id)}>
              ✕
            </button>
          </>
        )}
      </div>
    )
  }

  const rapidEntry = (
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
        placeholder={
          mode === 'journal'
            ? 'Rapid-log to today…'
            : isFuture
              ? 'Log ahead (future)…'
              : 'Rapid-log a task, event, or note…'
        }
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <select
        className="qi"
        title="Bucket — leave Unassigned to pick later"
        value={bucketId ?? ''}
        onChange={(e) => setBucketId(e.target.value || null)}
        style={{ maxWidth: 130 }}
      >
        <option value="">Unassigned</option>
        {data.buckets.map((bk) => (
          <option key={bk.id} value={bk.id}>
            {bk.name}
          </option>
        ))}
      </select>
      <button className="btn ghost sm" onClick={submit}>
        ＋
      </button>
    </div>
  )

  // ---------- header (shared) ----------
  const header = (
    <div className="view-head mb-[18px] flex flex-wrap items-baseline gap-[14px]">
      <div className="flex-1">
        <h2>Log</h2>
        <p>
          {mode === 'journal'
            ? 'Your whole journal — newest first.'
            : `${longDate(sel)}${isToday ? ' · today' : ''}`}
        </p>
      </div>
      <div className="flex gap-1.5">
        <button className={'btn ghost sm' + (mode === 'day' ? ' deep-on' : '')} onClick={() => setMode('day')}>
          Day
        </button>
        <button className={'btn ghost sm' + (mode === 'journal' ? ' deep-on' : '')} onClick={() => setMode('journal')}>
          Journal
        </button>
        {mode === 'day' && (
          <>
            <span className="mx-1 self-center" style={{ color: 'var(--line)' }}>
              |
            </span>
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
          </>
        )}
      </div>
    </div>
  )

  if (mode === 'journal')
    return (
      <div>
        {header}
        {journalView()}
        <BujoLegend />
      </div>
    )
  return (
    <div>
      {header}
      {dayView()}
      <BujoLegend />
    </div>
  )

  // ---------- journal (whole record, continuous) ----------
  function journalView() {
    const dayset = new Set<string>()
    data.logEntries.forEach((e) => dayset.add(e.onDate))
    data.blockLogRows.forEach((r) => dayset.add(r.dateIso))
    Object.keys(data.habitLogs).forEach((iso) => {
      if (Object.keys(data.habitLogs[iso]).length) dayset.add(iso)
    })
    const days = [...dayset].sort((a, b) => b.localeCompare(a))

    return (
      <div>
        <div className="mb-4">
          <Card title="Rapid log — today">{rapidEntry}</Card>
        </div>
        {days.length === 0 && <div className="hint px-0">Nothing logged yet — start on the Day tab or up top.</div>}
        <div className="flex flex-col gap-4">
          {days.map((iso) => {
            const entries = data.logEntries
              .filter((e) => e.onDate === iso && materializes(e, data.buckets))
              .sort((a, b) => a.position - b.position)
            const blocks = data.blockLogRows.filter((r) => r.dateIso === iso && materializes(r, data.buckets))
            const deep = blocks.filter((r) => r.deep).length
            const habits = Object.keys(data.habitLogs[iso] ?? {}).length
            return (
              <div key={iso} className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
                <div
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-2.5"
                  style={{ borderColor: 'var(--line-soft)' }}
                >
                  <span className="text-[14px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
                    {longDate(fromIso(iso))}
                    {iso === realTodayIso && (
                      <span className="ml-2 text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                        today
                      </span>
                    )}
                  </span>
                  {(blocks.length > 0 || habits > 0) && (
                    <span className="text-[11.5px]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
                      ✓ {blocks.length} blocks{deep > 0 ? ` · ${deep} deep` : ''}{habits > 0 ? ` · ${habits} habits` : ''}
                    </span>
                  )}
                </div>
                {entries.map(entryRow)}
                {entries.length === 0 && <div className="hint">No journal entries — only check-offs this day.</div>}
                {blocks.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2.5" style={{ borderTop: '1px solid var(--line-soft)' }}>
                    {blocks.map((r, i) => (
                      <span key={r.blockId + i} className="text-[12px]" style={{ color: 'var(--ink-soft)' }}>
                        <span style={{ color: r.deep ? 'var(--accent)' : 'var(--ink-faint)' }}>{r.deep ? '▲' : '✓'}</span>{' '}
                        {r.title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ---------- single day (focus + capture) ----------
  function dayView() {
    const entries = data.logEntries
      .filter((e) => e.onDate === selIso && materializes(e, data.buckets))
      .sort((a, b) => a.position - b.position)
    const tasks = entries.filter((e) => e.kind === 'task')
    const openTasks = tasks.filter((e) => e.state === 'open').length
    const doneTasks = tasks.filter((e) => e.state === 'done').length

    const completedBlocks = data.blockLogRows
      .filter((r) => r.dateIso === selIso && materializes(r, data.buckets))
      .sort((a, b) => Number(b.deep) - Number(a.deep))
    const deepBlocks = completedBlocks.filter((r) => r.deep)
    const completedHabits = Object.keys(data.habitLogs[selIso] ?? {})
      .map((id) => data.habits.find((h) => h.id === id))
      .filter((h): h is NonNullable<typeof h> => !!h)
    // Bucket-lane dedup/group key: the row's bucket, else a synthetic cat lane.
    const laneKey = (r: BlockLogRow) => r.bucketId ?? `cat:${r.cat}`

    return (
      <div>
        {isToday && staleOpen.length > 0 && (
          <div className="mb-4">
            <Card
              title={`Migrate · ${staleOpen.length} open from earlier`}
              action={
                <button className="btn ghost sm" onClick={carryAll}>
                  Carry all → today
                </button>
              }
            >
              {staleOpen.map((e) => (
                <div key={e.id} className="litem" style={entryStyle(e)}>
                  <span className="bullet" style={{ fontFamily: 'var(--mono)', fontSize: 10, minWidth: 52, color: 'var(--ink-faint)' }}>
                    {mdShort(e.onDate)}
                  </span>
                  <span className="txt">
                    {e.signifier === 'priority' && <span style={{ color: 'var(--accent)', marginRight: 5 }}>✷</span>}
                    {e.text}
                  </span>
                  <button className="btn ghost sm" title="Carry forward to today" onClick={() => actions.migrateLogEntry(e.id, realTodayIso, false)}>
                    › today
                  </button>
                  <button className="x" title="Drop — no longer relevant" onClick={() => actions.updateLogEntry(e.id, { state: 'dropped' })}>
                    ✕
                  </button>
                </div>
              ))}
              <div className="hint">Carry what still matters, drop what doesn't. Migrated tasks stay as a record on their original day.</div>
            </Card>
          </div>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[1.4fr_1fr] max-lg:grid-cols-1">
          <Card title={isToday ? 'Rapid log — today' : 'Log'}>
            {rapidEntry}
            {entries.length === 0 && (
              <div className="hint">{isToday ? "Nothing logged yet — capture what's happening." : 'No entries on this day.'}</div>
            )}
            {entries.map(entryRow)}
            {tasks.length > 0 && (
              <div className="hint">
                {openTasks} open · {doneTasks} done
              </div>
            )}
          </Card>

          <Card title="Accomplished that day">
            {completedBlocks.length === 0 && completedHabits.length === 0 && (
              <div className="hint">Nothing checked off {isToday ? 'yet' : 'this day'}.</div>
            )}
            {completedBlocks.map((r, i) => (
              <div
                key={r.blockId + i}
                className={`citem s-${r.cat}${depthClass(r.deep)} done`}
                style={{ ...entryStyle(r), gridTemplateColumns: '18px 1fr auto' }}
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
                  <span key={h.id} className={`htog s-${h.cat}`} style={stripeVar(blockStyle(h, data.buckets))}>
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

        {completedBlocks.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {[...new Map(completedBlocks.map((r) => [laneKey(r), r])).values()].map((r: BlockLogRow) => (
              <span
                key={laneKey(r)}
                className={`qname s-${r.cat}`}
                style={entryStyle(r)}
              >
                <span className="dot" />
                {(r.bucketId && bucketById.get(r.bucketId)?.name) || 'Unassigned'}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
}
