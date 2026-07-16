// Ryder-Carroll key for the bullet-journal notation used across the Log &
// Report. Kept compact and faint — a reference strip, not a focal point.

interface Item {
  g: string
  label: string
  strike?: boolean
  accent?: boolean
}

const GROUPS: Item[][] = [
  [
    { g: '•', label: 'task' },
    { g: '○', label: 'event' },
    { g: '—', label: 'note' },
  ],
  [
    { g: '✕', label: 'done' },
    { g: '›', label: 'migrated' },
    { g: '‹', label: 'scheduled' },
    { g: '•', label: 'dropped', strike: true },
  ],
  [
    { g: '✷', label: 'priority', accent: true },
    { g: '▲', label: 'deep', accent: true },
  ],
]

export function BujoLegend() {
  return (
    <div
      className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t pt-3 text-[11px]"
      style={{ borderColor: 'var(--line-soft)', color: 'var(--ink-faint)' }}
    >
      <span className="uppercase tracking-[0.09em]" style={{ fontFamily: 'var(--mono)' }}>
        key
      </span>
      {GROUPS.map((group, gi) => (
        <span key={gi} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {gi > 0 && (
            <span aria-hidden style={{ color: 'var(--line)' }}>
              ·
            </span>
          )}
          {group.map((it) => (
            <span key={it.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                style={{
                  fontFamily: 'var(--mono)',
                  color: it.accent ? 'var(--accent)' : 'var(--ink-soft)',
                  textDecoration: it.strike ? 'line-through' : undefined,
                  width: 12,
                  textAlign: 'center',
                }}
              >
                {it.g}
              </span>
              {it.label}
            </span>
          ))}
        </span>
      ))}
    </div>
  )
}
