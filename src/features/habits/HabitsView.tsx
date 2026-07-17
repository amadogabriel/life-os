import { useState } from 'react'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import { blockStyle, DOW, dowMon, isoDate, streak, stripeVar, weekDates, type Habit } from '../../lib/planner'
import { HabitModal } from './HabitModal'

export function HabitsView({ data, actions, today }: ViewProps) {
  const [editing, setEditing] = useState<Habit | 'new' | null>(null)
  const todayDow = dowMon(today)
  const dates = weekDates(today)

  return (
    <div>
      <div className="view-head mb-[18px]">
        <h2>Habits &amp; streaks</h2>
        <p>
          This week, Mon–Sun. Dots mark off-days for that habit. Tick a box to log it; the streak counts
          consecutive on-target days.
        </p>
      </div>
      <table className="ptable habit-table">
        <thead>
          <tr>
            <th>Habit</th>
            {dates.map((d, i) => (
              <th key={i} className={i === todayDow ? 'istoday' : ''}>
                {DOW[i]}
                <br />
                {d.getDate()}
              </th>
            ))}
            <th>Streak</th>
          </tr>
        </thead>
        <tbody>
          {data.habits.map((h) => {
            const s = streak(h, data.habitLogs, today)
            return (
              <tr key={h.id}>
                <td>
                  <button
                    className={`hname s-${h.cat} cursor-pointer border-0 bg-transparent p-0`}
                    style={{ color: 'var(--ink)', ...stripeVar(blockStyle(h, data.buckets)) }}
                    onClick={() => setEditing(h)}
                  >
                    <span className="dot" />
                    {h.name}
                  </button>
                </td>
                {dates.map((d, i) => {
                  const on = h.days.includes(i)
                  const key = isoDate(d)
                  const checked = !!data.habitLogs[key]?.[h.id]
                  return (
                    <td key={i}>
                      {on ? (
                        <button
                          className={`hcell s-${h.cat}`}
                          style={stripeVar(blockStyle(h, data.buckets))}
                          role="checkbox"
                          aria-checked={checked}
                          onClick={() => actions.toggleHabitLog(h.id, key)}
                        >
                          <Check />
                        </button>
                      ) : (
                        <div className="hcell off" />
                      )}
                    </td>
                  )
                })}
                <td>
                  <span className="streak">{s > 0 ? `🔥 ${s}` : <span className="z">0</span>}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="mt-[14px]">
        <button className="btn sm" onClick={() => setEditing('new')}>
          + Add habit
        </button>
      </div>
      {editing && (
        <HabitModal
          habit={editing === 'new' ? null : editing}
          buckets={data.buckets}
          onSave={async (h) => {
            await actions.saveHabit(h, data.habits.length)
            setEditing(null)
          }}
          onDelete={async (id) => {
            await actions.deleteHabit(id)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
