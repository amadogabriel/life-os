import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import { dowMon, fmt, isoDate, resolve, streak } from '../../lib/planner'

export function TodayView({ data, actions, today }: ViewProps) {
  const dow = dowMon(today)
  const todayIso = isoDate(today)
  const day = data.days[dow]
  const resolved = resolve(data.blocksByDow[dow])
  const log = data.blockLogs[todayIso] ?? {}
  const hlog = data.habitLogs[todayIso] ?? {}

  const doneable = resolved.filter((r) => r.block.cat !== 'life')
  const done = doneable.filter((r) => log[r.block.id]).length
  const pct = doneable.length ? Math.round((done / doneable.length) * 100) : 0

  const todaysHabits = data.habits.filter((h) => h.days.includes(dow))

  return (
    <div>
      <div
        className="mb-[18px] flex flex-wrap items-center gap-5 rounded-xl border px-5 py-[18px]"
        style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
      >
        <div className="ring" style={{ ['--p' as string]: pct }}>
          <span>{pct}%</span>
        </div>
        <div className="min-w-[180px] flex-1">
          <div className="text-[22px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
            {day.name} · {day.loc}
          </div>
          <div className="mt-0.5 text-[13.5px]" style={{ color: 'var(--ink-soft)' }}>
            {today.toDateString()}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
        {resolved.map(({ block: b, start }) => {
          const checked = !!log[b.id]
          return (
            <div key={b.id} className={`citem s-${b.cat}${checked ? ' done' : ''}`}>
              <button
                className="chk"
                role="checkbox"
                aria-checked={checked}
                onClick={() => actions.toggleBlockLog(b.id, todayIso)}
              >
                <Check />
              </button>
              <div className="time">{fmt(start)}</div>
              <div>
                <div className="title">{b.title}</div>
                {b.detail && <div className="desc">{b.detail}</div>}
              </div>
            </div>
          )
        })}
      </div>

      <div className="subhead">Habits — tap to log today</div>
      <div className="flex flex-wrap gap-2">
        {todaysHabits.length === 0 && (
          <span className="text-[13px]" style={{ color: 'var(--ink-faint)' }}>
            No habits target today.
          </span>
        )}
        {todaysHabits.map((h) => {
          const on = !!hlog[h.id]
          const s = streak(h, data.habitLogs, today)
          return (
            <button
              key={h.id}
              className={`htog s-${h.cat}`}
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
    </div>
  )
}
