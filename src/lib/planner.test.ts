import { describe, expect, it } from 'vitest'
import {
  dowMon,
  fmt,
  fmtDur,
  fortnightReport,
  isoDate,
  parseTime,
  resolve,
  streak,
  weekDates,
  weekStats,
  windowAccomplishments,
  type Block,
  type BlockLogRow,
  type Habit,
  type LogEntry,
  type LogMap,
} from './planner'

const b = (over: Partial<Block>): Block => ({
  id: 'b1',
  dow: 0,
  position: 0,
  cat: 'work',
  deep: false,
  title: 't',
  detail: '',
  startMin: 0,
  durMin: 60,
  anchored: false,
  habitId: null,
  ...over,
})

describe('time formatting', () => {
  it('formats minutes as HH:MM and wraps past midnight', () => {
    expect(fmt(300)).toBe('05:00')
    expect(fmt(0)).toBe('00:00')
    expect(fmt(1500)).toBe('01:00') // 25:00 wraps
  })
  it('formats durations', () => {
    expect(fmtDur(150)).toBe('2h 30m')
    expect(fmtDur(60)).toBe('1h')
    expect(fmtDur(45)).toBe('45m')
    expect(fmtDur(0)).toBe('')
  })
  it('parses HH:MM', () => {
    expect(parseTime('05:30')).toBe(330)
    expect(parseTime('00:00')).toBe(0)
  })
})

describe('date helpers', () => {
  it('maps Sunday to 6, Monday to 0', () => {
    expect(dowMon(new Date('2026-07-12T12:00:00'))).toBe(6) // a Sunday
    expect(dowMon(new Date('2026-07-13T12:00:00'))).toBe(0) // a Monday
  })
  it('weekDates spans Mon–Sun around today', () => {
    const dates = weekDates(new Date('2026-07-15T12:00:00')) // a Wednesday
    expect(dates).toHaveLength(7)
    expect(isoDate(dates[0])).toBe('2026-07-13')
    expect(isoDate(dates[6])).toBe('2026-07-19')
  })
})

describe('resolve (block re-flow)', () => {
  it('flows unanchored blocks after the previous block', () => {
    const res = resolve([
      b({ id: 'a', startMin: 300, durMin: 60, anchored: true }),
      b({ id: 'x', startMin: 0, durMin: 30 }),
      b({ id: 'y', startMin: 0, durMin: 45 }),
    ])
    expect(res.map((r) => r.start)).toEqual([300, 360, 390])
    expect(res.every((r) => !r.conflict)).toBe(true)
  })
  it('anchored blocks overrun by the previous block are pushed down, never overlapped', () => {
    const res = resolve([
      b({ id: 'a', startMin: 300, durMin: 120, anchored: true }),
      b({ id: 'c', startMin: 360, durMin: 30, anchored: true }), // pinned before a ends
    ])
    expect(res[1].start).toBe(420) // pushed to a's end
    expect(res[1].conflict).toBe(true) // pin not honored — flagged
  })
  it('anchored blocks keep a gap when the previous block ends earlier', () => {
    const res = resolve([
      b({ id: 'a', startMin: 300, durMin: 30, anchored: true }),
      b({ id: 'c', startMin: 480, durMin: 30, anchored: true }),
    ])
    expect(res[1].start).toBe(480) // gap 05:30–08:00 preserved
    expect(res[1].conflict).toBe(false)
  })
  it('first unanchored block uses its own startMin', () => {
    const res = resolve([b({ id: 'a', startMin: 420, durMin: 30 })])
    expect(res[0].start).toBe(420)
  })
})

describe('streak', () => {
  const habit: Pick<Habit, 'id' | 'days'> = { id: 'h1', days: [0, 1, 2, 3, 4, 5, 6] }
  const today = new Date('2026-07-15T12:00:00')
  const day = (off: number) => {
    const d = new Date(today)
    d.setDate(d.getDate() + off)
    return isoDate(d)
  }

  it('counts consecutive logged days', () => {
    const logs: LogMap = { [day(0)]: { h1: true }, [day(-1)]: { h1: true }, [day(-2)]: { h1: true } }
    expect(streak(habit, logs, today)).toBe(3)
  })
  it("an unlogged today doesn't break the streak", () => {
    const logs: LogMap = { [day(-1)]: { h1: true }, [day(-2)]: { h1: true } }
    expect(streak(habit, logs, today)).toBe(2)
  })
  it('a missed yesterday breaks the streak', () => {
    const logs: LogMap = { [day(0)]: { h1: true }, [day(-2)]: { h1: true } }
    expect(streak(habit, logs, today)).toBe(1)
  })
  it('skips off-target days', () => {
    // Wed 2026-07-15; habit targets only Mon(0). Mondays: Jul 13, Jul 6.
    const weekly: Pick<Habit, 'id' | 'days'> = { id: 'h1', days: [0] }
    const logs: LogMap = { '2026-07-13': { h1: true }, '2026-07-06': { h1: true } }
    expect(streak(weekly, logs, today)).toBe(2)
  })
})

describe('weekStats', () => {
  it('sums counted categories and excludes life from completion', () => {
    const today = new Date('2026-07-15T12:00:00') // Wednesday, dow 2
    const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
    blocksByDow[2] = [
      b({ id: 'w1', dow: 2, cat: 'work', durMin: 120 }),
      b({ id: 'l1', dow: 2, cat: 'life', durMin: 60 }),
      b({ id: 'm1', dow: 2, cat: 'math', durMin: 60 }),
    ]
    const logs: LogMap = { '2026-07-15': { w1: true, l1: true } }
    const stats = weekStats(blocksByDow, logs, [], {}, today)
    expect(stats.minsByCat.work).toBe(120)
    expect(stats.minsByCat.life).toBeUndefined()
    expect(stats.todayTotal).toBe(2) // life excluded
    expect(stats.todayDone).toBe(1)
    expect(stats.totalMins).toBe(180)
  })
})

describe('fortnightReport', () => {
  const today = new Date('2026-07-15T12:00:00')
  it('covers 14 days ending today at offset 0', () => {
    const rep = fortnightReport(Array.from({ length: 7 }, () => []), {}, [], {}, today, 0)
    expect(isoDate(rep.end)).toBe('2026-07-15')
    expect(isoDate(rep.start)).toBe('2026-07-02')
  })
  it('accumulates planned and accomplished minutes', () => {
    const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
    // one 60-min work block every day
    for (let d = 0; d < 7; d++) blocksByDow[d] = [b({ id: 'blk' + d, dow: d, cat: 'work' })]
    const logs: LogMap = { '2026-07-15': { blk2: true }, '2026-07-14': { blk1: true } }
    const rep = fortnightReport(blocksByDow, logs, [], {}, today, 0)
    expect(rep.plannedBlocks).toBe(14)
    expect(rep.doneBlocks).toBe(2)
    expect(rep.plannedByCat.work).toBe(14 * 60)
    expect(rep.accompByCat.work).toBe(120)
  })
  it('earlier fortnights contain no recent logs', () => {
    const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [b(ryDay(0))])
    function ryDay(d: number) {
      return { id: 'blk', dow: d, cat: 'work' as const }
    }
    const logs: LogMap = { '2026-07-15': { blk: true } }
    const rep = fortnightReport(blocksByDow, logs, [], {}, today, -1)
    expect(rep.doneBlocks).toBe(0)
  })
})

describe('windowAccomplishments', () => {
  const row = (over: Partial<BlockLogRow>): BlockLogRow => ({
    blockId: 'b',
    dateIso: '2026-07-15',
    title: 'Deep work',
    cat: 'work',
    durMin: 60,
    deep: false,
    ...over,
  })
  const entry = (over: Partial<LogEntry>): LogEntry => ({
    id: 'e',
    onDate: '2026-07-15',
    kind: 'task',
    state: 'done',
    signifier: '',
    text: 't',
    cat: 'open',
    blockId: null,
    migratedTo: null,
    projectId: null,
    sprintId: null,
    position: 0,
    ...over,
  })

  it('groups completed blocks by commitment and counts repeats', () => {
    const rows = [
      row({ blockId: 'a', title: 'Math focus', cat: 'math', deep: true }),
      row({ blockId: 'b', dateIso: '2026-07-14', title: 'Math focus', cat: 'math', deep: true }),
      row({ blockId: 'c', title: 'Sleep', cat: 'life' }), // excluded (life)
    ]
    const acc = windowAccomplishments(rows, [], '2026-07-02', '2026-07-15')
    expect(acc.byCat).toHaveLength(1)
    expect(acc.byCat[0].cat).toBe('math')
    expect(acc.byCat[0].titles[0]).toEqual({ title: 'Math focus', count: 2, deep: true })
    expect(acc.deepSessions).toBe(2)
    expect(acc.totalBlocks).toBe(2)
  })

  it('counts done tasks, events and migrations, ignoring out-of-window rows', () => {
    const entries = [
      entry({ id: '1', kind: 'task', state: 'done' }),
      entry({ id: '2', kind: 'task', state: 'migrated' }),
      entry({ id: '3', kind: 'event', state: 'open' }),
      entry({ id: '4', kind: 'task', state: 'open' }), // still open, not counted
      entry({ id: '5', kind: 'task', state: 'done', onDate: '2026-06-01' }), // out of window
    ]
    const acc = windowAccomplishments([], entries, '2026-07-02', '2026-07-15')
    expect(acc.tasksDone).toBe(1)
    expect(acc.migrated).toBe(1)
    expect(acc.events).toBe(1)
  })
})
