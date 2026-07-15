import { useEffect, useRef, useState } from 'react'
import type { ViewProps } from '../../App'
import { CATS, COUNTED, weekStats } from '../../lib/planner'

export function StatsView({ data, actions, today }: ViewProps) {
  const stats = weekStats(data.blocksByDow, data.blockLogs, data.habits, data.habitLogs, today)
  const rows = COUNTED.map((k) => ({ k, m: stats.minsByCat[k] ?? 0 }))
    .filter((r) => r.m > 0)
    .sort((a, b) => b.m - a.m)
  const max = rows.reduce((x, r) => Math.max(x, r.m), 1)

  const [notes, setNotes] = useState(data.notes)
  const notesTimer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(notesTimer.current), [])
  function onNotes(value: string) {
    setNotes(value)
    clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => actions.setNotes(value), 800)
  }

  const cards = [
    { n: (stats.todayTotal ? Math.round((stats.todayDone / stats.todayTotal) * 100) : 0) + '%', l: "Today's blocks done" },
    { n: `${stats.weekDone}/${stats.weekTotal}`, l: "This week's blocks logged" },
    {
      n: stats.bestStreak > 0 ? `🔥 ${stats.bestStreak}` : '—',
      l: stats.bestStreak > 0 ? `Best streak · ${stats.bestStreakHabit}` : 'No streak yet',
    },
    { n: `~${(stats.totalMins / 60).toFixed(0)}h`, l: 'Planned commitment / week' },
  ]

  return (
    <div>
      <div className="view-head mb-[18px]">
        <h2>Stats</h2>
        <p>Planned hours per commitment (recovery excluded), plus this week's follow-through.</p>
      </div>
      <div className="mb-[22px] grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {cards.map((c, i) => (
          <div key={i} className="statcard">
            <div className="n">{c.n}</div>
            <div className="l">{c.l}</div>
          </div>
        ))}
      </div>
      <table className="ptable mb-[22px]">
        <thead>
          <tr>
            <th>Commitment</th>
            <th>Planned / week</th>
            <th style={{ width: 240 }}>Relative share</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} style={{ color: 'var(--ink-faint)' }}>
                No counted blocks yet.
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
              <td className="hrs">~{(r.m / 60).toFixed(r.m % 60 ? 1 : 0)} h</td>
              <td>
                <div className="bar-track">
                  <div className={`bar s-${r.k}`} style={{ width: `${Math.round((r.m / max) * 100)}%` }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-5">
        <label
          className="mb-1.5 block text-[11px] uppercase tracking-[0.08em]"
          style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}
          htmlFor="notesBox"
        >
          Parked / notes
        </label>
        <textarea
          id="notesBox"
          className="min-h-[46px] w-full resize-y rounded-lg border p-[11px_14px] text-sm leading-normal"
          style={{
            background: 'var(--card)',
            borderColor: 'var(--line)',
            borderLeft: '3px solid var(--b-thesis)',
            color: 'var(--ink)',
          }}
          placeholder="e.g. Thesis: in adviser review…"
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
        />
      </div>
      <div className="mt-[34px] border-t pt-5 text-[13px]" style={{ borderColor: 'var(--line)', color: 'var(--ink-faint)' }}>
        <p className="max-w-[76ch]">
          <b style={{ color: 'var(--ink-soft)' }}>The commute is audio, full stop.</b> A cramped, noisy
          jeepney or bus rules out reading — so both commute blocks are Chinese listening, ~18h/week of
          comprehensible input. Get noise-isolating earphones and pre-download offline audio.
        </p>
        <p className="max-w-[76ch]">
          <b style={{ color: 'var(--ink-soft)' }}>Weeknights are a tight stack.</b> Home ~7:30, then a short
          workout + one focused hour of math before a 22:00 lights-out. On a wiped day, do <i>one</i> of the
          two and protect sleep — the Habits streak rewards showing up, not overreaching.
        </p>
      </div>
    </div>
  )
}
