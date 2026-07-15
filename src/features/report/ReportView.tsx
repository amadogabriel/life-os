import { useState } from 'react'
import type { ViewProps } from '../../App'
import { CATS, COUNTED, fmtDur, fortnightReport } from '../../lib/planner'

const shortDate = (d: Date) =>
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] +
  ' ' +
  d.getDate()

export function ReportView({ data, today }: ViewProps) {
  const [offset, setOffset] = useState(0)
  const rep = fortnightReport(data.blocksByDow, data.blockLogs, data.habits, data.habitLogs, today, offset)

  const totalDone = COUNTED.reduce((x, k) => x + (rep.accompByCat[k] ?? 0), 0)
  const rows = COUNTED.map((k) => ({ k, m: rep.accompByCat[k] ?? 0, p: rep.plannedByCat[k] ?? 0 }))
    .filter((r) => r.p > 0)
    .sort((a, b) => b.m - a.m)
  const max = rows.reduce((x, r) => Math.max(x, r.m), 1)

  const cards = [
    { n: `${rep.doneBlocks}/${rep.plannedBlocks}`, l: 'Blocks completed' },
    { n: fmtDur(totalDone) || '0m', l: 'Hours accomplished' },
    {
      n: (rep.plannedBlocks ? Math.round((rep.doneBlocks / rep.plannedBlocks) * 100) : 0) + '%',
      l: 'Follow-through',
    },
    { n: rep.bestStreak > 0 ? `🔥 ${rep.bestStreak}` : '—', l: 'Best current streak' },
  ]

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
      <div className="subhead">Hours accomplished by commitment</div>
      <table className="ptable">
        <thead>
          <tr>
            <th>Commitment</th>
            <th>Done</th>
            <th style={{ width: 240 }}>Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: 'var(--ink-faint)' }}>
                Nothing planned in this window.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.k}>
              <td>
                <span className={`qname s-${r.k}`}>
                  <span className="dot" />
                  {CATS[r.k]}
                </span>
              </td>
              <td className="hrs">
                {fmtDur(r.m) || '0m'} <span style={{ color: 'var(--ink-faint)' }}>/ {fmtDur(r.p)}</span>
              </td>
              <td>
                <div className="bar-track">
                  <div className={`bar s-${r.k}`} style={{ width: `${Math.round((r.m / max) * 100)}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
                <span className={`qname s-${r.habit.cat}`}>
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
