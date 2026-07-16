import { useState } from 'react'
import type { ViewProps } from '../../App'
import {
  CATS,
  catStyles,
  fmtDur,
  fortnightReport,
  isoDate,
  stripeVar,
  windowAccomplishments,
} from '../../lib/planner'

const shortDate = (d: Date) =>
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] +
  ' ' +
  d.getDate()

const mdShort = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] + ' ' + d
}

export function ReportView({ data, today }: ViewProps) {
  const [offset, setOffset] = useState(0)
  const rep = fortnightReport(data.blocksByDow, data.blockLogs, data.habits, data.habitLogs, today, offset)
  const winStart = isoDate(rep.start)
  const winEnd = isoDate(rep.end)
  const acc = windowAccomplishments(data.blockLogRows, data.logEntries, winStart, winEnd)
  const styles = catStyles(data.buckets)

  // Completed tasks + events rapid-logged in this window — the "wins" list.
  const wins = data.logEntries
    .filter((e) => e.onDate >= winStart && e.onDate <= winEnd)
    .filter((e) => (e.kind === 'task' && e.state === 'done') || e.kind === 'event')
    .sort((a, b) => b.onDate.localeCompare(a.onDate))

  const cards = [
    { n: `${acc.tasksDone}`, l: 'Tasks completed' },
    { n: `${acc.deepSessions}`, l: 'Deep sessions' },
    { n: rep.bestStreak > 0 ? `🔥 ${rep.bestStreak}` : '—', l: 'Best current streak' },
    { n: `${acc.migrated}`, l: 'Carried forward' },
  ]

  const nothingDone = acc.byCat.length === 0 && wins.length === 0

  return (
    <div>
      <div className="view-head mb-[18px] flex flex-wrap items-baseline gap-[14px]">
        <div className="flex-1">
          <h2>Fortnight report</h2>
          <p>
            {shortDate(rep.start)} – {shortDate(rep.end)}
            {offset === 0 ? ' · ending today' : ''}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button className="btn ghost sm" onClick={() => setOffset(offset - 1)}>
            ← Earlier
          </button>
          <button className="btn ghost sm" onClick={() => offset < 0 && setOffset(offset + 1)}>
            Later →
          </button>
        </div>
      </div>

      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {cards.map((c, i) => (
          <div key={i} className="statcard">
            <div className="n">{c.n}</div>
            <div className="l">{c.l}</div>
          </div>
        ))}
      </div>

      <div className="subhead">What you accomplished</div>
      {nothingDone && (
        <div className="hint px-0">
          Nothing checked off in this window yet — completed blocks and tasks will show up here.
        </div>
      )}
      <div className="flex flex-col gap-3">
        {acc.byCat.map((c) => (
          <div
            key={c.cat}
            className="overflow-hidden rounded-xl border"
            style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-2.5"
              style={{ borderColor: 'var(--line-soft)' }}
            >
              <span className={`qname s-${c.cat}`} style={stripeVar(styles[c.cat])}>
                <span className="dot" />
                {CATS[c.cat]}
              </span>
              <span className="text-[12px]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
                {c.titles.reduce((n, t) => n + t.count, 0)} done
                {c.deepSessions > 0 ? ` · ${c.deepSessions} deep` : ''} ·{' '}
                <span style={{ opacity: 0.7 }}>{fmtDur(c.mins) || '0m'}</span>
              </span>
            </div>
            {c.titles.map((t, i) => (
              <div key={i} className="litem" style={stripeVar(styles[c.cat])}>
                <span className="bullet" style={{ color: t.deep ? 'var(--accent)' : 'var(--ink-faint)' }}>
                  {t.deep ? '▲' : '•'}
                </span>
                <span className="txt">{t.title}</span>
                {t.count > 1 && (
                  <span className="text-[12px]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
                    ×{t.count}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {wins.length > 0 && (
        <>
          <div className="subhead">Tasks &amp; events logged</div>
          <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
            {wins.map((e) => (
              <div key={e.id} className={'litem' + (e.kind === 'task' && e.state === 'done' ? ' done' : '')}>
                <span className="bullet" style={{ fontFamily: 'var(--mono)' }}>
                  {e.kind === 'event' ? '○' : '✕'}
                </span>
                <span className="txt">
                  {e.signifier === 'priority' && <span style={{ color: 'var(--accent)', marginRight: 5 }}>✷</span>}
                  {e.text}
                </span>
                <span
                  className="text-[11px]"
                  style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)', flex: 'none' }}
                >
                  {mdShort(e.onDate)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="subhead">Habits over the fortnight</div>
      <table className="ptable">
        <thead>
          <tr>
            <th>Habit</th>
            <th>Done / target</th>
            <th>Rate</th>
            <th>Current streak</th>
          </tr>
        </thead>
        <tbody>
          {rep.habits.length === 0 && (
            <tr>
              <td colSpan={4} style={{ color: 'var(--ink-faint)' }}>
                No habits yet.
              </td>
            </tr>
          )}
          {rep.habits.map((r) => (
            <tr key={r.habit.id}>
              <td>
                <span className={`qname s-${r.habit.cat}`} style={stripeVar(styles[r.habit.cat])}>
                  <span className="dot" />
                  {r.habit.name}
                </span>
              </td>
              <td className="hrs">
                {r.done} / {r.target}
              </td>
              <td className="hrs">{r.target ? Math.round((r.done / r.target) * 100) : 0}%</td>
              <td className="hrs">{r.streak > 0 ? `🔥 ${r.streak}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
