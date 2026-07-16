import { useState } from 'react'
import type { ViewProps } from '../../App'
import { BujoLegend } from '../../components/BujoLegend'
import {
  addDays,
  CATS,
  catStyles,
  fmtDur,
  isoDate,
  streak,
  stripeVar,
  weekDates,
  windowAccomplishments,
} from '../../lib/planner'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const md = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`
const weekLabel = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() ? `${md(a)} – ${b.getDate()}` : `${md(a)} – ${md(b)}`

interface Period {
  label: string
  tag: string
  startIso: string
  endIso: string
}

const ago = (idx: number, unit: 'week' | 'month') =>
  idx === 0 ? `this ${unit}` : idx === 1 ? `last ${unit}` : `${idx} ${unit}s ago`

export function ReportView({ data, today }: ViewProps) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const styles = catStyles(data.buckets)

  const allDates = [...data.blockLogRows.map((r) => r.dateIso), ...data.logEntries.map((e) => e.onDate)]
  const earliest = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : isoDate(today)

  // Build the list of periods (newest first), stopping once we run past the
  // earliest record we have.
  const periods: Period[] = []
  if (mode === 'week') {
    for (let k = 0; k < 26; k++) {
      const wd = weekDates(addDays(today, -7 * k))
      const startIso = isoDate(wd[0])
      const endIso = isoDate(wd[6])
      if (k > 0 && endIso < earliest) break
      periods.push({ label: weekLabel(wd[0], wd[6]), tag: ago(k, 'week'), startIso, endIso })
    }
  } else {
    let y = today.getFullYear()
    let m = today.getMonth()
    for (let k = 0; k < 24; k++) {
      const startIso = isoDate(new Date(y, m, 1))
      const endIso = isoDate(new Date(y, m + 1, 0))
      if (k > 0 && endIso < earliest) break
      periods.push({ label: `${MONTHS_FULL[m]} ${y}`, tag: ago(k, 'month'), startIso, endIso })
      m -= 1
      if (m < 0) {
        m = 11
        y -= 1
      }
    }
  }

  const topStreaks = data.habits
    .map((h) => ({ h, s: streak(h, data.habitLogs, today) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)

  const unit = mode

  return (
    <div>
      <div className="view-head mb-[18px] flex flex-wrap items-baseline gap-[14px]">
        <div className="flex-1">
          <h2>Where your {unit}s went</h2>
          <p>Most recent first — what actually got done, not hours logged.</p>
        </div>
        <div className="flex gap-1.5">
          <button className={'btn ghost sm' + (mode === 'week' ? ' deep-on' : '')} onClick={() => setMode('week')}>
            Week
          </button>
          <button className={'btn ghost sm' + (mode === 'month' ? ' deep-on' : '')} onClick={() => setMode('month')}>
            Month
          </button>
        </div>
      </div>

      {topStreaks.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-2">
          {topStreaks.map(({ h, s }) => (
            <span key={h.id} className={`htog s-${h.cat}`} style={stripeVar(styles[h.cat])}>
              🔥 {s} · {h.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {periods.map((p) => {
          const acc = windowAccomplishments(data.blockLogRows, data.logEntries, p.startIso, p.endIso)
          let habitsDone = 0
          const activeSet = new Set<string>()
          for (const iso of Object.keys(data.habitLogs)) {
            if (iso >= p.startIso && iso <= p.endIso) {
              const n = Object.keys(data.habitLogs[iso]).length
              habitsDone += n
              if (n > 0) activeSet.add(iso)
            }
          }
          for (const r of data.blockLogRows) if (r.dateIso >= p.startIso && r.dateIso <= p.endIso) activeSet.add(r.dateIso)
          const wins = data.logEntries
            .filter((e) => e.onDate >= p.startIso && e.onDate <= p.endIso)
            .filter((e) => (e.kind === 'task' && e.state === 'done') || e.kind === 'event')
            .sort((a, b) => b.onDate.localeCompare(a.onDate))
          const quiet = acc.totalBlocks === 0 && wins.length === 0 && habitsDone === 0

          return (
            <div key={p.startIso} className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--line-soft)' }}>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[16px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
                    {p.label}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
                    {p.tag}
                  </span>
                </div>
                {!quiet && (
                  <span className="text-[12px]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-soft)' }}>
                    {acc.tasksDone > 0 && `${acc.tasksDone} tasks · `}
                    {acc.deepSessions > 0 && `${acc.deepSessions} deep · `}
                    {acc.totalBlocks} blocks
                    {habitsDone > 0 && ` · ${habitsDone} habits`}
                    {acc.migrated > 0 && ` · ${acc.migrated} carried`}
                    {` · ${activeSet.size} active days`}
                  </span>
                )}
              </div>

              {quiet && <div className="hint">Quiet {unit} — nothing logged.</div>}

              {acc.byCat.map((c) => (
                <div key={c.cat} className="litem items-start" style={stripeVar(styles[c.cat])}>
                  <span className={`qname s-${c.cat}`} style={{ ...stripeVar(styles[c.cat]), minWidth: 150, flex: 'none' }}>
                    <span className="dot" />
                    {CATS[c.cat]}
                  </span>
                  <span className="txt" style={{ color: 'var(--ink-soft)' }}>
                    {c.titles.map((t, j) => (
                      <span key={j}>
                        {j > 0 && ' · '}
                        {t.deep && <span style={{ color: 'var(--accent)' }}>▲ </span>}
                        {t.title}
                        {t.count > 1 && ` ×${t.count}`}
                      </span>
                    ))}
                  </span>
                  <span className="text-[11px]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)', flex: 'none' }}>
                    {fmtDur(c.mins)}
                  </span>
                </div>
              ))}

              {wins.length > 0 && (
                <div className="litem items-start">
                  <span className="text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)', minWidth: 150, flex: 'none' }}>
                    logged
                  </span>
                  <span className="txt" style={{ color: 'var(--ink-soft)' }}>
                    {wins.map((e, j) => (
                      <span key={e.id}>
                        {j > 0 && ' · '}
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>{e.kind === 'event' ? '○ ' : '✕ '}</span>
                        {e.text}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <BujoLegend />
      <div className="hint px-0">Records go back to {md(new Date(earliest + 'T12:00:00'))}.</div>
    </div>
  )
}
