// Pure planner domain logic, ported from the legacy mockup and unit-tested.
// No I/O here — everything takes plain data and returns plain data.

export type Cat =
  | 'work'
  | 'devops'
  | 'thesis'
  | 'math'
  | 'chin'
  | 'exercise'
  | 'wqu'
  | 'life'
  | 'open'

export const CATS: Record<Cat, string> = {
  work: 'Work · engineering',
  math: 'Measure theory / analysis',
  chin: 'Chinese (Migaku/CI)',
  exercise: 'Exercise',
  thesis: 'UPD thesis',
  devops: 'Work · DevOps',
  wqu: 'WQU (maintenance)',
  life: 'Life / recovery',
  open: 'OPEN — assign',
}

/** Categories that count toward planned/accomplished hours. */
export const COUNTED: Cat[] = ['work', 'math', 'chin', 'exercise', 'thesis', 'devops', 'wqu']

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export interface Block {
  id: string
  dow: number
  position: number
  cat: Cat
  title: string
  detail: string
  startMin: number
  durMin: number
  anchored: boolean
  deep: boolean
}

export interface Day {
  dow: number
  name: string
  loc: string
}

export interface Habit {
  id: string
  name: string
  cat: Cat
  days: number[] // target weekdays, 0 = Monday
  position: number
}

/** logs[dateISO] is the set of block/habit ids checked off that day. */
export type LogMap = Record<string, Record<string, true>>

// ---------- category styling ----------

export interface CatStyle {
  color: string // '' = default palette color for the cat
}

/** Per-category custom colors derived from the user's buckets. */
export function catStyles(buckets: { cat: Cat; color: string }[]): Partial<Record<Cat, CatStyle>> {
  const map: Partial<Record<Cat, CatStyle>> = {}
  for (const bk of buckets) if (!map[bk.cat]) map[bk.cat] = { color: bk.color }
  return map
}

/** Inline style overriding the stripe color when the bucket has a custom one. */
export function stripeVar(style?: CatStyle): Record<string, string> | undefined {
  return style?.color ? { ['--stripe']: style.color } : undefined
}

/** ' sh' class suffix for shallow (non-deep) work — rendered muted. */
export function depthClass(deep: boolean): string {
  return deep ? '' : ' sh'
}

// ---------- time / date helpers ----------

const pad = (n: number) => (n < 10 ? '0' : '') + n

/** Minutes-past-midnight → "HH:MM" (wraps past 24h). */
export function fmt(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  return pad(Math.floor(m / 60)) + ':' + pad(m % 60)
}

/** Duration in minutes → "2h 30m". */
export function fmtDur(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return (h ? h + 'h' : '') + (m ? (h ? ' ' : '') + m + 'm' : '')
}

/** "HH:MM" → minutes past midnight. */
export function parseTime(value: string): number {
  const [h, m] = value.split(':')
  return (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0)
}

export function isoDate(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

/** Weekday with Monday = 0 … Sunday = 6. */
export function dowMon(d: Date): number {
  const x = d.getDay()
  return x === 0 ? 6 : x - 1
}

export function addDays(d: Date, off: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + off)
  return x
}

/** The 7 dates (Mon–Sun) of the week containing `today`. */
export function weekDates(today: Date): Date[] {
  const mondayOff = -dowMon(today)
  return Array.from({ length: 7 }, (_, i) => addDays(today, mondayOff + i))
}

// ---------- block re-flow ----------

export interface Resolved<T> {
  block: T
  start: number
  conflict: boolean
}

/**
 * Lay out a day's blocks in order — blocks never overlap. Anchored blocks
 * start at their own time, which leaves a gap when the previous block ends
 * earlier; if the previous block runs past an anchor, the anchored block is
 * pushed down to the previous end (`conflict` marks that its pin wasn't
 * honored). Everything else flows immediately after the previous block.
 */
export function resolve<T extends { startMin: number; durMin: number; anchored: boolean }>(
  blocks: T[],
  startAt?: number,
): Resolved<T>[] {
  let cursor: number | null = startAt ?? null
  const out: Resolved<T>[] = []
  for (const b of blocks) {
    let start: number
    let conflict = false
    if (b.anchored) {
      start = cursor !== null ? Math.max(b.startMin, cursor) : b.startMin
      conflict = start > b.startMin
    } else {
      start = cursor !== null ? cursor : b.startMin
    }
    out.push({ block: b, start, conflict })
    cursor = start + b.durMin
  }
  return out
}

// ---------- habit streaks ----------

/**
 * Consecutive on-target days logged, counting back from `today` (up to 120
 * days). An unlogged *today* doesn't break the streak; off-days are skipped.
 */
export function streak(habit: Pick<Habit, 'id' | 'days'>, habitLogs: LogMap, today: Date): number {
  let n = 0
  for (let off = 0; off > -120; off--) {
    const d = addDays(today, off)
    if (!habit.days.includes(dowMon(d))) continue
    const logged = habitLogs[isoDate(d)]?.[habit.id]
    if (logged) n++
    else if (off === 0) continue
    else break
  }
  return n
}

// ---------- weekly stats ----------

export interface WeekStats {
  minsByCat: Partial<Record<Cat, number>>
  totalMins: number
  todayDone: number
  todayTotal: number
  weekDone: number
  weekTotal: number
  bestStreak: number
  bestStreakHabit: string
}

export function weekStats(
  blocksByDow: Block[][],
  blockLogs: LogMap,
  habits: Habit[],
  habitLogs: LogMap,
  today: Date,
): WeekStats {
  const minsByCat: Partial<Record<Cat, number>> = {}
  for (const dayBlocks of blocksByDow) {
    for (const b of dayBlocks) {
      if (COUNTED.includes(b.cat)) minsByCat[b.cat] = (minsByCat[b.cat] ?? 0) + b.durMin
    }
  }
  const totalMins = Object.values(minsByCat).reduce((a, b) => a + b, 0)

  const todayIso = isoDate(today)
  const todayLog = blockLogs[todayIso] ?? {}
  let todayDone = 0
  let todayTotal = 0
  for (const b of blocksByDow[dowMon(today)] ?? []) {
    if (b.cat === 'life') continue
    todayTotal++
    if (todayLog[b.id]) todayDone++
  }

  let weekDone = 0
  let weekTotal = 0
  weekDates(today).forEach((d, i) => {
    const log = blockLogs[isoDate(d)] ?? {}
    for (const b of blocksByDow[i] ?? []) {
      if (b.cat === 'life') continue
      weekTotal++
      if (log[b.id]) weekDone++
    }
  })

  let bestStreak = 0
  let bestStreakHabit = ''
  for (const h of habits) {
    const s = streak(h, habitLogs, today)
    if (s > bestStreak) {
      bestStreak = s
      bestStreakHabit = h.name
    }
  }

  return { minsByCat, totalMins, todayDone, todayTotal, weekDone, weekTotal, bestStreak, bestStreakHabit }
}

// ---------- fortnight report ----------

export interface FortnightReport {
  start: Date
  end: Date
  accompByCat: Partial<Record<Cat, number>>
  plannedByCat: Partial<Record<Cat, number>>
  doneBlocks: number
  plannedBlocks: number
  habits: { habit: Habit; target: number; done: number; streak: number }[]
  bestStreak: number
}

/** offset 0 = the 14 days ending today; -1 = the previous fortnight, etc. */
export function fortnightReport(
  blocksByDow: Block[][],
  blockLogs: LogMap,
  habits: Habit[],
  habitLogs: LogMap,
  today: Date,
  offset: number,
): FortnightReport {
  const endOff = offset * 14
  const startOff = endOff - 13
  const accompByCat: Partial<Record<Cat, number>> = {}
  const plannedByCat: Partial<Record<Cat, number>> = {}
  let doneBlocks = 0
  let plannedBlocks = 0

  for (let off = startOff; off <= endOff; off++) {
    const d = addDays(today, off)
    const log = blockLogs[isoDate(d)] ?? {}
    for (const b of blocksByDow[dowMon(d)] ?? []) {
      if (!COUNTED.includes(b.cat)) continue
      plannedByCat[b.cat] = (plannedByCat[b.cat] ?? 0) + b.durMin
      plannedBlocks++
      if (log[b.id]) {
        accompByCat[b.cat] = (accompByCat[b.cat] ?? 0) + b.durMin
        doneBlocks++
      }
    }
  }

  const habitRows = habits.map((habit) => {
    let target = 0
    let done = 0
    for (let off = startOff; off <= endOff; off++) {
      const d = addDays(today, off)
      if (!habit.days.includes(dowMon(d))) continue
      target++
      if (habitLogs[isoDate(d)]?.[habit.id]) done++
    }
    return { habit, target, done, streak: streak(habit, habitLogs, today) }
  })

  return {
    start: addDays(today, startOff),
    end: addDays(today, endOff),
    accompByCat,
    plannedByCat,
    doneBlocks,
    plannedBlocks,
    habits: habitRows,
    bestStreak: habitRows.reduce((x, r) => Math.max(x, r.streak), 0),
  }
}
