import type { ViewProps } from '../../App'
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
const md = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`
/** "Jul 13 – 19" (same month) or "Jun 29 – Jul 5". */
const weekLabel = (a: Date, b: Date) =>
  a.getMonth() === b.getMonth() ? `${md(a)} – ${b.getDate()}` : `${md(a)} – ${md(b)}`

export function ReportView({ data, today }: ViewProps) {
  const styles = catStyles(data.buckets)

  // Earliest day we have any record for — bounds how far back the weeks go.
  const allDates = [...data.blockLogRows.map((r) => r.dateIso), ...data.logEntries.map((e) => e.onDate)]
  const earliest = allDates.length ? allDates.reduce((a, b) => (a < b ? a : b)) : isoDate(today)

  const weeks: {
    label: string
    startIso: string
    endIso: string
    acc: ReturnType<typeof windowAccomplishments>
    habitsDone: number
    activeDays: number
    wins: typeof data.logEntries
  }[] = []

  for (let k = 0; k < 26; k++) {
    const wd = weekDates(addDays(today, -7 * k))
    const startIso = isoDate(wd[0])
    const endIso = isoDate(wd[6])
    if (k > 0 && endIso < earliest) break
    const acc = windowAccomplishments(data.blockLogRows, data.logEntries, startIso, endIso)
    let habitsDone = 0
    const activeSet = new Set<string>()
    for (const d of wd) {
      const iso = isoDate(d)
      const h = Object.keys(data.habitLogs[iso] ?? {}).length
      habitsDone += h
      if (h > 0) activeSet.add(iso)
    }
    for (const r of data.blockLogRows) if (r.dateIso >= startIso && r.dateIso <= endIso) activeSet.add(r.dateIso)
    const wins = data.logEntries
      .filter((e) => e.onDate >= startIso && e.onDate <= endIso)
      .filter((e) => (e.kind === 'task' && e.state === 'done') || e.kind === 'event')
      .sort((a, b) => b.onDate.localeCompare(a.onDate))
    weeks.push({ label: weekLabel(wd[0], wd[6]), startIso, endIso, acc, habitsDone, activeDays: activeSet.size, wins })
  }

  const topStreaks = data.habits
    .map((h) => ({ h, s: streak(h, data.habitLogs, today) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 4)

  return (
    <div>
      <div className="view-head mb-[18px]">
        <h2>Where your weeks went</h2>
        <p>Your weeks, most recent first — what actually got done, not hours logged.</p>
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
        {weeks.map((w, i) => {
          const quiet = w.acc.totalBlocks === 0 && w.wins.length === 0 && w.habitsDone === 0
          return (
            <div
              key={w.startIso}
              className="overflow-hidden rounded-xl border"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
            >
              <div
                className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
                style={{ borderColor: 'var(--line-soft)' }}
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[16px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
                    {w.label}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
                    {i === 0 ? 'this week' : i === 1 ? 'last week' : `${i} weeks ago`}
                  </span>
                </div>
                {!quiet && (
                  <span className="text-[12px]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-soft)' }}>
                    {w.acc.tasksDone > 0 && `${w.acc.tasksDone} tasks · `}
                    {w.acc.deepSessions > 0 && `${w.acc.deepSessions} deep · `}
                    {w.acc.totalBlocks} blocks
                    {w.habitsDone > 0 && ` · ${w.habitsDone} habits`}
                    {w.acc.migrated > 0 && ` · ${w.acc.migrated} carried`}
                    {` · ${w.activeDays}/7 active`}
                  </span>
                )}
              </div>

              {quiet && <div className="hint">Quiet week — nothing logged.</div>}

              {w.acc.byCat.map((c) => (
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

              {w.wins.length > 0 && (
                <div className="litem items-start">
                  <span className="text-[11px] uppercase tracking-[0.08em]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)', minWidth: 150, flex: 'none' }}>
                    logged
                  </span>
                  <span className="txt" style={{ color: 'var(--ink-soft)' }}>
                    {w.wins.map((e, j) => (
                      <span key={e.id}>
                        {j > 0 && ' · '}
                        <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
                          {e.kind === 'event' ? '○ ' : '✕ '}
                        </span>
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

      <div className="hint px-0 mt-2">Weeks go back as far as your records — {md(new Date(earliest + 'T12:00:00'))} so far.</div>
    </div>
  )
}
