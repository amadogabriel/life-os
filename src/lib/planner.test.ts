import { describe, expect, it } from 'vitest'
import {
  blockLogRowsFromEntries,
  blockStyle,
  bucketIdForCat,
  depthClass,
  detachHabit,
  detachProject,
  detachSprint,
  doneBlockMap,
  dowMon,
  dowOfIso,
  entryHabitMirror,
  fmt,
  fmtDur,
  forkCopies,
  fortnightReport,
  freezeBlockEntry,
  frozenPastItems,
  isCounted,
  isoDate,
  isTraceStale,
  manilaDate,
  materializes,
  nextOneOffStart,
  onTimelineEntries,
  parseTime,
  pendingMaterializationDates,
  placedBlockFields,
  planForDate,
  reorderWithinSlots,
  resolve,
  scheduleSlot,
  streak,
  weekDates,
  weekRange,
  weekStats,
  windowAccomplishments,
  type Block,
  type BucketColor,
  type BucketCounted,
  type Habit,
  type LogEntry,
  type LogMap,
  type Project,
  type Sprint,
} from './planner'

const b = (over: Partial<Block>): Block => ({
  id: 'b1',
  dow: 0,
  position: 0,
  bucketId: null,
  cat: 'work',
  deep: false,
  title: 't',
  detail: '',
  startMin: 0,
  durMin: 60,
  anchored: false,
  habitId: null,
  projectId: null,
  sprintId: null,
  ...over,
})

describe('blockStyle (per-bucket color resolution)', () => {
  // Two buckets share the legacy `work` cat but hold different colors — the
  // whole point of resolving per-reference (kills first-bucket-wins).
  const buckets: BucketColor[] = [
    { id: 'work-red', cat: 'work', color: '#ff0000' },
    { id: 'work-blue', cat: 'work', color: '#0000ff' },
    { id: 'math-plain', cat: 'math', color: '' }, // no custom color
  ]

  it('resolves the referenced bucket custom color (tier 1)', () => {
    expect(blockStyle({ bucketId: 'work-red', cat: 'work' }, buckets).color).toBe('#ff0000')
  })

  it('two buckets sharing a cat keep their own colors (no first-bucket-wins)', () => {
    expect(blockStyle({ bucketId: 'work-red', cat: 'work' }, buckets).color).toBe('#ff0000')
    expect(blockStyle({ bucketId: 'work-blue', cat: 'work' }, buckets).color).toBe('#0000ff')
  })

  it('falls back to the cat palette when the bucket has no custom color (tier 2)', () => {
    expect(blockStyle({ bucketId: 'math-plain', cat: 'math' }, buckets).color).toBe('var(--b-math)')
  })

  it("a set-null (deleted) bucket reverts to the block's stamped cat palette", () => {
    // Deleting a bucket set-nulls bucket_id but keeps the derived `cat`.
    expect(blockStyle({ bucketId: null, cat: 'math' }, buckets).color).toBe('var(--b-math)')
    // An id that no longer resolves behaves the same (uses the stamped cat).
    expect(blockStyle({ bucketId: 'deleted', cat: 'chin' }, buckets).color).toBe('var(--b-chin)')
  })

  it('an unassigned block (null bucket, open cat) is gray (tier 3)', () => {
    expect(blockStyle({ bucketId: null, cat: 'open' }, buckets).color).toBe('var(--b-open)')
  })

  it('the exercise cat maps to its aliased palette var', () => {
    expect(blockStyle({ bucketId: null, cat: 'exercise' }, buckets).color).toBe('var(--b-exer)')
  })

  // #18: a Log Entry resolves its color the same way — the resolver already
  // takes the {bucketId, cat} shape an entry carries, so recoloring the bucket
  // restyles its entries live.
  it('resolves a Log Entry color through its bucket (recolor-live)', () => {
    const entryLike = { bucketId: 'work-blue', cat: 'work' as const }
    expect(blockStyle(entryLike, buckets).color).toBe('#0000ff')
    // Unassigned entry (null bucket, open cat) → gray.
    expect(blockStyle({ bucketId: null, cat: 'open' }, buckets).color).toBe('var(--b-open)')
  })
})

describe('habits join the taxonomy (bucket color + backfill, #19)', () => {
  const h = (over: Partial<Habit>): Habit => ({
    id: 'h1',
    name: 'Habit',
    bucketId: null,
    cat: 'exercise',
    days: [0, 1, 2, 3, 4],
    position: 0,
    ...over,
  })

  // A habit resolves color through the SAME per-item resolver blocks use,
  // reading its live Bucket reference — no habit-specific resolution logic.
  const buckets: BucketColor[] = [
    { id: 'exer-orange', cat: 'exercise', color: '#ffa500' },
    { id: 'chin-plain', cat: 'chin', color: '' }, // no custom color
  ]

  it('resolves a habit through its bucket custom color (tier 1)', () => {
    expect(blockStyle(h({ bucketId: 'exer-orange', cat: 'exercise' }), buckets).color).toBe('#ffa500')
  })

  it('falls back to the cat palette when the bucket has no custom color (tier 2)', () => {
    expect(blockStyle(h({ bucketId: 'chin-plain', cat: 'chin' }), buckets).color).toBe('var(--b-chin)')
  })

  it('recoloring a bucket restyles the habit live (reads the live bucket list)', () => {
    const habit = h({ bucketId: 'exer-orange', cat: 'exercise' })
    const recolored: BucketColor[] = [{ id: 'exer-orange', cat: 'exercise', color: '#00ff00' }]
    expect(blockStyle(habit, recolored).color).toBe('#00ff00')
  })

  it('a deleted bucket set-nulls the habit, reverting to its stamped cat palette (still functional)', () => {
    // deleteBucket set-nulls bucket_id but keeps the derived `cat` — the habit
    // stays functional, just gray/fallback.
    expect(blockStyle(h({ bucketId: null, cat: 'exercise' }), buckets).color).toBe('var(--b-exer)')
    // a dangling id (bucket gone from the list) behaves the same
    expect(blockStyle(h({ bucketId: 'exer-orange', cat: 'exercise' }), []).color).toBe('var(--b-exer)')
  })

  it('an unassigned habit (null bucket, open cat) is gray (tier 3)', () => {
    expect(blockStyle(h({ bucketId: null, cat: 'open' }), buckets).color).toBe('var(--b-open)')
  })

  it('backfills a habit to its cat 1:1 bucket', () => {
    const bks = [
      { id: 'work', cat: 'work' as const, position: 0 },
      { id: 'exer', cat: 'exercise' as const, position: 1 },
    ]
    expect(bucketIdForCat('exercise', bks)).toBe('exer')
  })

  it('backfill picks the lowest-position bucket when several share a cat', () => {
    const bks = [
      { id: 'work-late', cat: 'work' as const, position: 5 },
      { id: 'work-early', cat: 'work' as const, position: 2 },
    ]
    expect(bucketIdForCat('work', bks)).toBe('work-early')
  })

  it('backfill yields null when no bucket carries the cat (habit stays Unassigned)', () => {
    expect(bucketIdForCat('thesis', [{ id: 'work', cat: 'work' as const, position: 0 }])).toBeNull()
  })
})

describe('depthClass', () => {
  // Contract (#22): deep is the un-suffixed base (boosted look); shallow gets the
  // ' sh' suffix that mutes it. Every depth-aware surface (blocks, timeline cards,
  // today/log rows, palette chips) keys its rendering off this single hook.
  it('returns no suffix for deep work (renders boosted)', () => {
    expect(depthClass(true)).toBe('')
  })
  it('returns the " sh" suffix for shallow work (renders muted)', () => {
    expect(depthClass(false)).toBe(' sh')
  })
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
  it('dowOfIso reads an ISO date string as a local weekday', () => {
    expect(dowOfIso('2026-07-12')).toBe(6) // a Sunday
    expect(dowOfIso('2026-07-13')).toBe(0) // a Monday
    expect(dowOfIso('2026-07-17')).toBe(4) // a Friday
  })
  it('weekDates spans Mon–Sun around today', () => {
    const dates = weekDates(new Date('2026-07-15T12:00:00')) // a Wednesday
    expect(dates).toHaveLength(7)
    expect(isoDate(dates[0])).toBe('2026-07-13')
    expect(isoDate(dates[6])).toBe('2026-07-19')
  })
})

describe('manilaDate', () => {
  it("returns the Asia/Manila calendar date, not the UTC one", () => {
    // 17:30 UTC on Jul 16 is already 01:30 on Jul 17 in Manila (UTC+8)
    expect(isoDate(manilaDate(new Date('2026-07-16T17:30:00Z')))).toBe('2026-07-17')
  })
  it('agrees with UTC while both are on the same calendar day', () => {
    // 15:00 UTC on Jul 16 is 23:00 in Manila — still Jul 16
    expect(isoDate(manilaDate(new Date('2026-07-16T15:00:00Z')))).toBe('2026-07-16')
  })
  it('lands at local midnight so dowMon/weekDates work on it', () => {
    const d = manilaDate(new Date('2026-07-16T17:30:00Z')) // a Friday in Manila
    expect(dowMon(d)).toBe(4)
  })
})

describe('weekRange', () => {
  it("names today's Mon–Sun week within one month", () => {
    const r = weekRange(new Date('2026-07-15T12:00:00')) // a Wednesday
    expect(isoDate(r.start)).toBe('2026-07-13')
    expect(isoDate(r.end)).toBe('2026-07-19')
    expect(r.label).toBe('Week of Jul 13–19')
  })
  it('pages by whole weeks with weekOffset', () => {
    const next = weekRange(new Date('2026-07-15T12:00:00'), 1)
    expect(isoDate(next.start)).toBe('2026-07-20')
    expect(isoDate(next.end)).toBe('2026-07-26')
    expect(next.label).toBe('Week of Jul 20–26')
    const prev = weekRange(new Date('2026-07-15T12:00:00'), -1)
    expect(isoDate(prev.start)).toBe('2026-07-06')
    expect(prev.label).toBe('Week of Jul 6–12')
  })
  it('names both months when the week crosses one', () => {
    const r = weekRange(new Date('2026-06-30T12:00:00')) // Tuesday, week is Jun 29 – Jul 5
    expect(isoDate(r.start)).toBe('2026-06-29')
    expect(isoDate(r.end)).toBe('2026-07-05')
    expect(r.label).toBe('Week of Jun 29 – Jul 5')
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

// Buckets 1:1 with cats, mirroring the backfill: Life uncounted, the rest
// counted. Used across the flag-driven stats/materialization tests.
const bk = (id: string, counted: boolean): BucketCounted => ({ id, counted })
const COUNTED_BUCKETS: BucketCounted[] = [
  bk('bk-work', true),
  bk('bk-math', true),
  bk('bk-life', false),
]

describe('isCounted / materializes (bucket-flag driven)', () => {
  it('counts only items in a counted bucket; null + uncounted never accrue', () => {
    expect(isCounted({ bucketId: 'bk-work' }, COUNTED_BUCKETS)).toBe(true)
    expect(isCounted({ bucketId: 'bk-life' }, COUNTED_BUCKETS)).toBe(false) // uncounted (Life)
    expect(isCounted({ bucketId: null }, COUNTED_BUCKETS)).toBe(false) // Unassigned
    expect(isCounted({ bucketId: 'deleted' }, COUNTED_BUCKETS)).toBe(false) // gone → Unassigned
  })
  it('materializes everything except an explicitly uncounted bucket', () => {
    expect(materializes({ bucketId: 'bk-work' }, COUNTED_BUCKETS)).toBe(true)
    expect(materializes({ bucketId: null }, COUNTED_BUCKETS)).toBe(true) // Unassigned still commits
    expect(materializes({ bucketId: 'deleted' }, COUNTED_BUCKETS)).toBe(true)
    expect(materializes({ bucketId: 'bk-life' }, COUNTED_BUCKETS)).toBe(false) // Life never freezes
  })
})

describe('weekStats', () => {
  const today = new Date('2026-07-15T12:00:00') // Wednesday, dow 2
  const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
  blocksByDow[2] = [
    b({ id: 'w1', dow: 2, bucketId: 'bk-work', cat: 'work', durMin: 120 }),
    b({ id: 'l1', dow: 2, bucketId: 'bk-life', cat: 'life', durMin: 60 }),
    b({ id: 'm1', dow: 2, bucketId: 'bk-math', cat: 'math', durMin: 60 }),
    b({ id: 'u1', dow: 2, bucketId: null, cat: 'open', durMin: 45 }), // Unassigned
  ]

  it('sums counted buckets and excludes uncounted (Life) from completion', () => {
    const logs: LogMap = { '2026-07-15': { w1: true, l1: true } }
    const stats = weekStats(blocksByDow, logs, [], {}, today, COUNTED_BUCKETS)
    expect(stats.minsByBucket['bk-work']).toBe(120)
    expect(stats.minsByBucket['bk-math']).toBe(60)
    expect(stats.minsByBucket['bk-life']).toBeUndefined() // uncounted
    expect(stats.totalMins).toBe(180) // Unassigned doesn't accrue counted hours
    // Completion counts every materializing block — Unassigned included, Life not.
    expect(stats.todayTotal).toBe(3)
    expect(stats.todayDone).toBe(1)
  })

  it("toggling a bucket's counted off drops its hours immediately", () => {
    const off: BucketCounted[] = [bk('bk-work', false), bk('bk-math', true), bk('bk-life', false)]
    const stats = weekStats(blocksByDow, {}, [], {}, today, off)
    expect(stats.minsByBucket['bk-work']).toBeUndefined() // left the scoreboard
    expect(stats.minsByBucket['bk-math']).toBe(60)
    expect(stats.totalMins).toBe(60)
  })
})

describe('fortnightReport', () => {
  const today = new Date('2026-07-15T12:00:00')
  it('covers 14 days ending today at offset 0', () => {
    const rep = fortnightReport(Array.from({ length: 7 }, () => []), {}, [], {}, today, 0, COUNTED_BUCKETS)
    expect(isoDate(rep.end)).toBe('2026-07-15')
    expect(isoDate(rep.start)).toBe('2026-07-02')
  })
  it('accumulates planned and accomplished minutes per bucket lane', () => {
    const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
    // one 60-min work block every day
    for (let d = 0; d < 7; d++) blocksByDow[d] = [b({ id: 'blk' + d, dow: d, bucketId: 'bk-work', cat: 'work' })]
    const logs: LogMap = { '2026-07-15': { blk2: true }, '2026-07-14': { blk1: true } }
    const rep = fortnightReport(blocksByDow, logs, [], {}, today, 0, COUNTED_BUCKETS)
    expect(rep.plannedBlocks).toBe(14)
    expect(rep.doneBlocks).toBe(2)
    expect(rep.plannedByBucket['bk-work']).toBe(14 * 60)
    expect(rep.accompByBucket['bk-work']).toBe(120)
  })
  it('excludes uncounted (Life) and Unassigned blocks from the report', () => {
    const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
    for (let d = 0; d < 7; d++)
      blocksByDow[d] = [
        b({ id: 'w' + d, dow: d, bucketId: 'bk-work', cat: 'work' }),
        b({ id: 'l' + d, dow: d, bucketId: 'bk-life', cat: 'life' }),
        b({ id: 'u' + d, dow: d, bucketId: null, cat: 'open' }),
      ]
    const rep = fortnightReport(blocksByDow, {}, [], {}, today, 0, COUNTED_BUCKETS)
    expect(rep.plannedBlocks).toBe(14) // only the work blocks
    expect(rep.plannedByBucket['bk-life']).toBeUndefined()
  })
  it('earlier fortnights contain no recent logs', () => {
    const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [b(ryDay(0))])
    function ryDay(d: number) {
      return { id: 'blk', dow: d, bucketId: 'bk-work', cat: 'work' as const }
    }
    const logs: LogMap = { '2026-07-15': { blk: true } }
    const rep = fortnightReport(blocksByDow, logs, [], {}, today, -1, COUNTED_BUCKETS)
    expect(rep.doneBlocks).toBe(0)
  })
})

const entry = (over: Partial<LogEntry>): LogEntry => ({
  id: 'e',
  onDate: '2026-07-15',
  kind: 'task',
  state: 'done',
  signifier: '',
  text: 't',
  bucketId: null,
  cat: 'open',
  blockId: null,
  migratedTo: null,
  habitId: null,
  projectId: null,
  sprintId: null,
  position: 0,
  durMin: null,
  deep: false,
  startMin: null,
  anchored: false,
  ...over,
})

/** A frozen, block-sourced done entry (materialized then checked off). */
const blockEntry = (over: Partial<LogEntry>): LogEntry =>
  entry({ blockId: 'a', bucketId: 'bk-work', durMin: 60, cat: 'work', text: 'Deep work', ...over })

describe('windowAccomplishments', () => {
  it('groups completed blocks by bucket lane and counts repeats', () => {
    const entries = [
      blockEntry({ id: 'a', blockId: 'a', bucketId: 'bk-math', text: 'Math focus', cat: 'math', deep: true }),
      blockEntry({ id: 'b', blockId: 'b', bucketId: 'bk-math', onDate: '2026-07-14', text: 'Math focus', cat: 'math', deep: true }),
      blockEntry({ id: 'c', blockId: 'c', bucketId: 'bk-life', text: 'Sleep', cat: 'life' }), // excluded (uncounted)
    ]
    const acc = windowAccomplishments(entries, '2026-07-02', '2026-07-15', COUNTED_BUCKETS)
    expect(acc.byBucket).toHaveLength(1)
    expect(acc.byBucket[0].bucketId).toBe('bk-math')
    expect(acc.byBucket[0].cat).toBe('math')
    expect(acc.byBucket[0].titles[0]).toEqual({ title: 'Math focus', count: 2, deep: true })
    expect(acc.deepSessions).toBe(2)
    expect(acc.totalBlocks).toBe(2)
    // block-sourced done entries are "blocks", not hand-typed tasks
    expect(acc.tasksDone).toBe(0)
  })

  it('excludes Unassigned (null bucket) block accomplishments from the lanes', () => {
    const entries = [
      blockEntry({ id: 'a', blockId: 'a', bucketId: null, cat: 'open', text: 'Loose block' }),
      blockEntry({ id: 'b', blockId: 'b', bucketId: 'bk-work', text: 'Ship it' }),
    ]
    const acc = windowAccomplishments(entries, '2026-07-02', '2026-07-15', COUNTED_BUCKETS)
    expect(acc.byBucket.map((c) => c.bucketId)).toEqual(['bk-work'])
    expect(acc.totalBlocks).toBe(1)
  })

  it('counts hand-typed done tasks, events and migrations, ignoring out-of-window rows', () => {
    const entries = [
      entry({ id: '1', kind: 'task', state: 'done' }), // hand-typed (durMin null)
      entry({ id: '2', kind: 'task', state: 'migrated' }),
      entry({ id: '3', kind: 'event', state: 'open' }),
      entry({ id: '4', kind: 'task', state: 'open' }), // still open, not counted
      entry({ id: '5', kind: 'task', state: 'done', onDate: '2026-06-01' }), // out of window
      blockEntry({ id: '6' }), // a done block — a "block", not a hand-typed task
    ]
    const acc = windowAccomplishments(entries, '2026-07-02', '2026-07-15', COUNTED_BUCKETS)
    expect(acc.tasksDone).toBe(1)
    expect(acc.migrated).toBe(1)
    expect(acc.events).toBe(1)
    expect(acc.totalBlocks).toBe(1)
  })

  // Backfill parity: because every historical row is mapped to its cat's 1:1
  // bucket, a past window's bucket-lane totals equal what the cat lanes showed.
  it('bucket-lane totals match the pre-migration cat-lane totals (backfill parity)', () => {
    const entries = [
      blockEntry({ id: 'w', blockId: 'w', bucketId: 'bk-work', cat: 'work', text: 'Work A', durMin: 90 }),
      blockEntry({ id: 'm1', blockId: 'm1', bucketId: 'bk-math', cat: 'math', text: 'Math A', durMin: 60 }),
      blockEntry({ id: 'm2', blockId: 'm2', bucketId: 'bk-math', cat: 'math', text: 'Math B', durMin: 30 }),
    ]
    const acc = windowAccomplishments(entries, '2026-07-02', '2026-07-15', COUNTED_BUCKETS)
    const byId = Object.fromEntries(acc.byBucket.map((c) => [c.bucketId, c.mins]))
    // Same partition as grouping by cat would have produced (work 90, math 90).
    expect(byId).toEqual({ 'bk-work': 90, 'bk-math': 90 })
  })
})

describe('doneBlockMap', () => {
  it('maps on_date -> block_id for done, block-linked entries only', () => {
    const map = doneBlockMap([
      blockEntry({ id: '1', blockId: 'b1', onDate: '2026-07-15' }),
      blockEntry({ id: '2', blockId: 'b2', onDate: '2026-07-15', state: 'open' }), // open — excluded
      entry({ id: '3', blockId: null, state: 'done' }), // no block — excluded
    ])
    expect(map).toEqual({ '2026-07-15': { b1: true } })
  })
})

describe('blockLogRowsFromEntries', () => {
  it('projects done block-sourced entries into frozen snapshot rows', () => {
    const rows = blockLogRowsFromEntries([
      blockEntry({ id: '1', blockId: 'b1', bucketId: 'bk-math', text: 'Math', cat: 'math', durMin: 90, deep: true }),
      blockEntry({ id: '2', state: 'open' }), // open — not an accomplishment
      entry({ id: '3', state: 'done' }), // hand-typed — no frozen duration
    ])
    expect(rows).toEqual([
      { blockId: 'b1', dateIso: '2026-07-15', title: 'Math', bucketId: 'bk-math', cat: 'math', durMin: 90, deep: true },
    ])
  })
})

describe('pendingMaterializationDates', () => {
  it('returns just today on first run (no lastSeen)', () => {
    expect(pendingMaterializationDates(null, '2026-07-17')).toEqual(['2026-07-17'])
  })
  it('is empty when already caught up today', () => {
    expect(pendingMaterializationDates('2026-07-17', '2026-07-17')).toEqual([])
  })
  it('fills every missed day through today inclusive', () => {
    expect(pendingMaterializationDates('2026-07-14', '2026-07-17')).toEqual([
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
    ])
  })
  it('is empty when the clock ran backwards', () => {
    expect(pendingMaterializationDates('2026-07-20', '2026-07-17')).toEqual([])
  })
  it('crosses a month boundary correctly', () => {
    expect(pendingMaterializationDates('2026-07-30', '2026-08-01')).toEqual(['2026-07-31', '2026-08-01'])
  })
})

describe('onTimelineEntries', () => {
  it('keeps only task entries with a start time on the given day', () => {
    const entries = [
      entry({ id: 'a', startMin: 480, state: 'open' }),
      entry({ id: 'b', startMin: null, state: 'open' }), // rapid-log todo, not on the timeline
      entry({ id: 'c', startMin: 540, kind: 'note' }),
      entry({ id: 'd', startMin: 600, onDate: '2026-07-14' }),
    ]
    expect(onTimelineEntries(entries, '2026-07-15').map((e) => e.id)).toEqual(['a'])
  })

  it('excludes dropped and migrated entries', () => {
    const entries = [
      entry({ id: 'a', startMin: 480, state: 'open' }),
      entry({ id: 'b', startMin: 540, state: 'dropped' }),
      entry({ id: 'c', startMin: 600, state: 'migrated' }),
    ]
    expect(onTimelineEntries(entries, '2026-07-15').map((e) => e.id)).toEqual(['a'])
  })

  it('sorts by position', () => {
    const entries = [
      entry({ id: 'a', startMin: 480, position: 2 }),
      entry({ id: 'b', startMin: 540, position: 0 }),
      entry({ id: 'c', startMin: 600, position: 1 }),
    ]
    expect(onTimelineEntries(entries, '2026-07-15').map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })
})

describe('frozenPastItems — the frozen-past lens (ADR-0002 amendment)', () => {
  it('renders at stored start_min, sorted by clock — no re-flow of position order', () => {
    const items = frozenPastItems([
      entry({ id: 'late', text: 'Afternoon', startMin: 780, durMin: 60, position: 0 }),
      entry({ id: 'early', text: 'Dawn', startMin: 360, durMin: 60, position: 1 }),
    ])
    // clock order, not position order; each holds its OWN stored start (not chained)
    expect(items.map((i) => i.entryId)).toEqual(['early', 'late'])
    expect(items.map((i) => i.start)).toEqual([360, 780])
  })

  it('drops placeholder rows (blank title or zero duration); keeps titled null-dur at the default', () => {
    const items = frozenPastItems([
      entry({ id: 'blank', text: '', startMin: 400, durMin: 0 }),
      entry({ id: 'ghost', text: 'Emptied block', startMin: 500, durMin: 0 }),
      entry({ id: 'idea', text: 'Titled, no dur', startMin: 600, durMin: null }),
      entry({ id: 'real', text: 'Work', startMin: 700, durMin: 60 }),
    ])
    expect(items.map((i) => i.entryId)).toEqual(['idea', 'real'])
    expect(items.find((i) => i.entryId === 'idea')!.durMin).toBe(30)
  })

  it('flags — but does not reflow — a block overlapping the previous one', () => {
    const items = frozenPastItems([
      entry({ id: 'span', text: 'Long block', startMin: 480, durMin: 180 }), // 08:00–11:00
      entry({ id: 'inside', text: 'Pinned inside', startMin: 600, durMin: 30 }), // 10:00–10:30
      entry({ id: 'after', text: 'Clear', startMin: 720, durMin: 60 }), // 12:00–13:00
    ])
    const by = Object.fromEntries(items.map((i) => [i.entryId, i]))
    expect(by.span.conflict).toBe(false)
    expect(by.inside.conflict).toBe(true) // overlaps the still-running span
    expect(by.inside.start).toBe(600) // true time, not pushed down
    expect(by.after.conflict).toBe(false)
  })

  it('excludes entries with no start time (rapid-log todos are not on the timeline)', () => {
    expect(frozenPastItems([entry({ id: 't', text: 'todo', startMin: null })])).toEqual([])
  })
})

describe('planForDate', () => {
  const todayIso = '2026-07-15' // a Wednesday
  const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
  // Thursday Template: an anchored deep block, then a chained shallow one
  blocksByDow[3] = [
    b({ id: 'anchor', dow: 3, position: 0, title: 'Deep math', cat: 'math', startMin: 540, durMin: 90, anchored: true, deep: true }),
    b({ id: 'chain', dow: 3, position: 1, title: 'Email batch', cat: 'work', startMin: 0, durMin: 30 }),
  ]
  const logEntries: LogEntry[] = [
    // Monday Jul 13 — a materialized (frozen) day
    entry({ id: 'p1', onDate: '2026-07-13', blockId: 'blk1', text: 'Frozen deep block', cat: 'math', startMin: 540, durMin: 90, anchored: true, deep: true, state: 'done', position: 0 }),
    entry({ id: 'p2', onDate: '2026-07-13', text: 'Hand-added timeline item', cat: 'work', startMin: 0, durMin: null, state: 'open', position: 1 }),
    entry({ id: 'p3', onDate: '2026-07-13', text: 'Rapid-log todo', startMin: null, state: 'open', position: 2 }),
    // Tuesday Jul 14 — frozen entries later migrated/dropped
    entry({ id: 'q1', onDate: '2026-07-14', text: 'Migrated away', startMin: 480, durMin: 60, state: 'migrated', position: 0 }),
    entry({ id: 'q2', onDate: '2026-07-14', text: 'Dropped', startMin: 600, durMin: 30, state: 'dropped', position: 1 }),
    // Wednesday Jul 15 (today) — the live plan
    entry({ id: 't1', onDate: todayIso, text: 'Live block', cat: 'work', startMin: 480, durMin: 60, state: 'open', position: 0 }),
    entry({ id: 't2', onDate: todayIso, text: 'Dropped today', startMin: 540, durMin: 30, state: 'dropped', position: 1 }),
    entry({ id: 't3', onDate: todayIso, text: 'Chained today', cat: 'math', startMin: 0, durMin: null, state: 'open', position: 2 }),
  ]
  const input = { blocksByDow, logEntries }

  it('entry-backed items carry the entry bucketId (frozen days color by bucket) — #18', () => {
    const withBucket: LogEntry[] = [
      entry({ id: 'fb', onDate: '2026-07-13', bucketId: 'bk-work', cat: 'work', text: 'Frozen', startMin: 540, durMin: 60, state: 'open', position: 0 }),
    ]
    const past = planForDate({ blocksByDow, logEntries: withBucket }, '2026-07-13', todayIso)
    expect(past.items[0].bucketId).toBe('bk-work')
    // a merged one-off likewise threads its entry's bucket
    const oneOffEntry = entry({ id: 'oo', onDate: '2026-07-16', bucketId: 'bk-math', cat: 'math', text: 'One-off', startMin: 660, state: 'open', position: 0 })
    const future = planForDate({ blocksByDow, logEntries: [oneOffEntry] }, '2026-07-16', todayIso)
    const item = future.items.find((i) => i.entryId === 'oo')
    expect(item?.bucketId).toBe('bk-math')
  })

  it('past day with entries → the frozen plan at stored starts, sorted by clock, no re-flow', () => {
    const day = planForDate(input, '2026-07-13', todayIso)
    expect(day.source).toBe('frozen-past')
    expect(day.dateIso).toBe('2026-07-13')
    // rapid-log todos (no startMin) are not part of the frozen timeline; the
    // remaining two render at their STORED starts (0, 540) — not re-chained — so
    // clock order (p2 then p1) wins over position order (p1 then p2).
    expect(day.items.map((i) => i.entryId)).toEqual(['p2', 'p1'])
    expect(day.items.map((i) => i.start)).toEqual([0, 540])
    expect(day.items[0].title).toBe('Hand-added timeline item')
    expect(day.items[0].durMin).toBe(30) // hand-typed, no frozen duration → default
    const deep = day.items.find((i) => i.entryId === 'p1')!
    expect(deep.start).toBe(540) // held its own frozen start, not chained after p2
    expect(deep.durMin).toBe(90)
    expect(deep.blockId).toBe('blk1')
    expect(day.items.every((i) => i.entryId !== null)).toBe(true)
  })

  it('past day ignores record state — migrated/dropped entries still show as planned', () => {
    const day = planForDate(input, '2026-07-14', todayIso)
    expect(day.source).toBe('frozen-past')
    expect(day.items.map((i) => i.entryId)).toEqual(['q1', 'q2'])
  })

  it('past day never materialized → frozen-past with no items (blank)', () => {
    const day = planForDate(input, '2026-07-12', todayIso)
    expect(day.source).toBe('frozen-past')
    expect(day.items).toEqual([])
  })

  it("today → the live today plan, exactly the Today tab's on-timeline entries", () => {
    const day = planForDate(input, todayIso, todayIso)
    expect(day.source).toBe('today')
    // same lens as onTimelineEntries: dropped/migrated excluded
    expect(day.items.map((i) => i.entryId)).toEqual(['t1', 't3'])
    expect(day.items.map((i) => i.start)).toEqual([480, 540]) // chained off the first
    // today never renders the weekday Template, even though Wednesday has none here
    expect(day.items.every((i) => i.entryId !== null)).toBe(true)
  })

  it('future day → the weekday Template projected onto the date, laid out by re-flow', () => {
    const day = planForDate(input, '2026-07-16', todayIso) // Thursday
    expect(day.source).toBe('projection')
    expect(day.items.map((i) => i.blockId)).toEqual(['anchor', 'chain'])
    expect(day.items.map((i) => i.entryId)).toEqual([null, null])
    expect(day.items.map((i) => i.start)).toEqual([540, 630])
    expect(day.items[0]).toMatchObject({ title: 'Deep math', cat: 'math', deep: true, durMin: 90, anchored: true })
  })

  it('future day with an empty Template projects nothing', () => {
    const day = planForDate(input, '2026-07-17', todayIso) // Friday — no Template blocks
    expect(day.source).toBe('projection')
    expect(day.items).toEqual([])
  })

  it('projection re-flow flags an overrun anchor as a conflict', () => {
    const bd: Block[][] = Array.from({ length: 7 }, () => [])
    bd[3] = [
      b({ id: 'a', dow: 3, position: 0, startMin: 540, durMin: 120, anchored: true }),
      b({ id: 'c', dow: 3, position: 1, startMin: 600, durMin: 30, anchored: true }), // pinned before a ends
    ]
    const day = planForDate({ blocksByDow: bd, logEntries: [] }, '2026-07-16', todayIso)
    expect(day.items[1].start).toBe(660)
    expect(day.items[1].conflict).toBe(true)
  })

  // Day Plan forks (slice #14): a future date with a fork resolves from the
  // fork's own dated blocks and is tagged 'fork'; the Template no longer
  // speaks for it.
  it("future day with a Day Plan fork → source 'fork', laid out from the fork, Template ignored", () => {
    const dayForks = {
      '2026-07-16': [
        // Thursday's Template has 'anchor'/'chain' — the fork replaces them wholesale
        b({ id: 'f1', dow: 3, position: 0, title: 'Fork deep block', cat: 'thesis', startMin: 600, durMin: 120, anchored: true, deep: true }),
        b({ id: 'f2', dow: 3, position: 1, title: 'Fork errand', cat: 'life', startMin: 0, durMin: 45 }),
      ],
    }
    const day = planForDate({ ...input, dayForks }, '2026-07-16', todayIso)
    expect(day.source).toBe('fork')
    expect(day.items.map((i) => i.blockId)).toEqual(['f1', 'f2']) // not 'anchor'/'chain'
    expect(day.items.map((i) => i.entryId)).toEqual([null, null])
    // fork blocks get the same resolve() re-flow: anchored pin, then chained
    expect(day.items.map((i) => i.start)).toEqual([600, 720])
    expect(day.items[0]).toMatchObject({ title: 'Fork deep block', cat: 'thesis', deep: true, durMin: 120, anchored: true })
  })

  it('forked-empty future day renders blank — never the projection', () => {
    // key present + empty array = an intentionally-emptied fork, not "no fork"
    const day = planForDate({ ...input, dayForks: { '2026-07-16': [] } }, '2026-07-16', todayIso)
    expect(day.source).toBe('fork')
    expect(day.items).toEqual([])
  })

  it('a fork never overrides the record: today and past days keep their source', () => {
    const dayForks = {
      [todayIso]: [b({ id: 'ft', dow: 2, position: 0, title: 'Fork today' })],
      '2026-07-13': [b({ id: 'fp', dow: 0, position: 0, title: 'Fork past' })],
    }
    const today = planForDate({ ...input, dayForks }, todayIso, todayIso)
    expect(today.source).toBe('today')
    expect(today.items.map((i) => i.entryId)).toEqual(['t1', 't3'])
    const past = planForDate({ ...input, dayForks }, '2026-07-13', todayIso)
    expect(past.source).toBe('frozen-past')
    // frozen-past renders at stored starts, clock-sorted (p2@0 before p1@540)
    expect(past.items.map((i) => i.entryId)).toEqual(['p2', 'p1'])
  })

  it('a fork on one date leaves other dates of the same weekday projecting the Template', () => {
    const dayForks = { '2026-07-16': [] } // fork this Thursday…
    const day = planForDate({ ...input, dayForks }, '2026-07-23', todayIso) // …next Thursday still projects
    expect(day.source).toBe('projection')
    expect(day.items.map((i) => i.blockId)).toEqual(['anchor', 'chain'])
  })

  // Slice #13 (dated one-offs): entries with a future onDate + startMin ride on
  // top of that day's projection without forking it.
  const oneOff = (over: Partial<LogEntry>): LogEntry =>
    entry({ id: 'o1', onDate: '2026-07-16', text: 'Sprint task', cat: 'thesis', state: 'open', startMin: 660, durMin: null, position: 0, ...over })

  it("future day merges a dated one-off into the projection — day stays 'projection'", () => {
    const day = planForDate({ blocksByDow, logEntries: [...logEntries, oneOff({})] }, '2026-07-16', todayIso)
    expect(day.source).toBe('projection') // riding on top — the day is NOT forked
    expect(day.items.map((i) => i.key)).toEqual(['block:anchor', 'block:chain', 'entry:o1'])
    // the projection is untouched; the one-off lands after it at its chained start
    expect(day.items.map((i) => i.start)).toEqual([540, 630, 660])
    expect(day.items[2]).toMatchObject({ entryId: 'o1', blockId: null, title: 'Sprint task', cat: 'thesis', durMin: 30, anchored: false })
  })

  it('re-flows an unanchored one-off landing mid-projection — chained, no overlap', () => {
    // one-off nominally at 10:00, inside the anchor block (09:00–10:30)
    const day = planForDate({ blocksByDow, logEntries: [...logEntries, oneOff({ startMin: 600 })] }, '2026-07-16', todayIso)
    expect(day.items.map((i) => i.key)).toEqual(['block:anchor', 'entry:o1', 'block:chain'])
    // chains off the anchor's end; the chained Template block re-flows after it
    expect(day.items.map((i) => i.start)).toEqual([540, 630, 660])
    expect(day.items.every((i) => !i.conflict)).toBe(true)
  })

  it('an anchored one-off overrun by the projection is pushed down and flagged', () => {
    const day = planForDate(
      { blocksByDow, logEntries: [...logEntries, oneOff({ startMin: 600, anchored: true })] },
      '2026-07-16',
      todayIso,
    )
    expect(day.items.map((i) => i.key)).toEqual(['block:anchor', 'entry:o1', 'block:chain'])
    expect(day.items[1].start).toBe(630) // pin at 10:00 not honored — pushed to the anchor's end
    expect(day.items[1].conflict).toBe(true)
  })

  it('a one-off on an empty future day is the whole plan', () => {
    const day = planForDate({ blocksByDow, logEntries: [...logEntries, oneOff({ onDate: '2026-07-17' })] }, '2026-07-17', todayIso)
    expect(day.source).toBe('projection')
    expect(day.items.map((i) => i.key)).toEqual(['entry:o1'])
    expect(day.items[0].start).toBe(660)
  })

  it('dropped/migrated one-offs no longer ride on the projection; other days are untouched', () => {
    const entries = [...logEntries, oneOff({ state: 'dropped' }), oneOff({ id: 'o2', state: 'migrated' })]
    const day = planForDate({ blocksByDow, logEntries: entries }, '2026-07-16', todayIso)
    expect(day.items.map((i) => i.key)).toEqual(['block:anchor', 'block:chain'])
    // a one-off belongs only to its own date
    const friday = planForDate({ blocksByDow, logEntries: [...logEntries, oneOff({})] }, '2026-07-17', todayIso)
    expect(friday.items).toEqual([])
  })

  // Combined (#13 × #14): fork-wins picks the day's base blocks AND the source
  // tag; dated one-offs merge on top of that base either way.
  it("dated one-off merges on top of a forked day's own blocks — source stays 'fork'", () => {
    const dayForks = {
      '2026-07-16': [
        b({ id: 'f1', dow: 3, position: 0, title: 'Fork deep block', cat: 'thesis', startMin: 600, durMin: 120, anchored: true, deep: true }),
        b({ id: 'f2', dow: 3, position: 1, title: 'Fork errand', cat: 'life', startMin: 0, durMin: 45 }),
      ],
    }
    const day = planForDate(
      { blocksByDow, logEntries: [...logEntries, oneOff({ startMin: 765 })], dayForks },
      '2026-07-16',
      todayIso,
    )
    expect(day.source).toBe('fork')
    // the fork's layout is the base (Template 'anchor'/'chain' ignored); the one-off rides on top
    expect(day.items.map((i) => i.key)).toEqual(['block:f1', 'block:f2', 'entry:o1'])
    expect(day.items.map((i) => i.start)).toEqual([600, 720, 765])
    expect(day.items[2]).toMatchObject({ entryId: 'o1', blockId: null, title: 'Sprint task' })
  })

  it('forked-empty day with a one-off shows just the one-off — blank fork, not blank day', () => {
    const day = planForDate(
      { blocksByDow, logEntries: [...logEntries, oneOff({})], dayForks: { '2026-07-16': [] } },
      '2026-07-16',
      todayIso,
    )
    expect(day.source).toBe('fork')
    expect(day.items.map((i) => i.key)).toEqual(['entry:o1'])
    expect(day.items[0].start).toBe(660)
  })
})

describe('nextOneOffStart', () => {
  const todayIso = '2026-07-15'
  const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
  blocksByDow[3] = [
    b({ id: 'anchor', dow: 3, position: 0, startMin: 540, durMin: 90, anchored: true }),
    b({ id: 'chain', dow: 3, position: 1, startMin: 0, durMin: 30 }),
  ]
  const logEntries: LogEntry[] = [
    entry({ id: 't1', onDate: todayIso, text: 'Live block', startMin: 480, durMin: 60, state: 'open', position: 0 }),
    entry({ id: 't2', onDate: todayIso, text: 'Chained today', startMin: 0, durMin: null, state: 'open', position: 1 }),
  ]
  const input = { blocksByDow, logEntries }

  it("chains after the last item of a future day's projection", () => {
    // Thursday projects anchor (540+90) then chain (630+30) → next slot 660
    expect(nextOneOffStart(input, '2026-07-16', todayIso)).toBe(660)
  })

  it('chains after one-offs already merged into the day', () => {
    const withOneOff = { blocksByDow, logEntries: [...logEntries, entry({ id: 'o1', onDate: '2026-07-16', startMin: 660, durMin: 45, state: 'open' })] }
    expect(nextOneOffStart(withOneOff, '2026-07-16', todayIso)).toBe(705)
  })

  it("chains after today's live timeline when scheduling to today", () => {
    // today: 480+60 → chained 540 + default 30 → next slot 570
    expect(nextOneOffStart(input, todayIso, todayIso)).toBe(570)
  })

  it('falls back to 09:00 on an empty day', () => {
    expect(nextOneOffStart(input, '2026-07-17', todayIso)).toBe(540) // Friday — no Template blocks
  })
})

describe('scheduleSlot', () => {
  const todayIso = '2026-07-15'
  const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
  blocksByDow[3] = [
    b({ id: 'anchor', dow: 3, position: 0, startMin: 540, durMin: 90, anchored: true }),
    b({ id: 'chain', dow: 3, position: 1, startMin: 0, durMin: 30 }),
  ]

  it('chains the start after the day and positions after that date’s entries', () => {
    const logEntries: LogEntry[] = [
      entry({ id: 'x', onDate: '2026-07-16', startMin: 660, durMin: 45, state: 'open', position: 0 }),
    ]
    // Thursday projects anchor (540+90) then chain, plus the existing one-off at
    // 660+45 → next slot 705; position lands after the one existing entry.
    expect(scheduleSlot({ blocksByDow, logEntries }, 'new', '2026-07-16', todayIso)).toEqual({
      startMin: 705,
      position: 1,
    })
  })

  it('excludes the entry being (re)scheduled from both start and position', () => {
    // The entry moving to 07-16 must not chain after — or count its own — old slot.
    const logEntries: LogEntry[] = [entry({ id: 'move', onDate: '2026-07-16', startMin: 900, durMin: 60, state: 'open', position: 0 })]
    expect(scheduleSlot({ blocksByDow, logEntries }, 'move', '2026-07-16', todayIso)).toEqual({
      startMin: 660, // just the Thursday projection; the moving entry is ignored
      position: 0,
    })
  })
})

describe('forkCopies', () => {
  it('mints a fresh id per Template block and returns the Template→fork id map', () => {
    const template = [b({ id: 'a', position: 0, title: 'A' }), b({ id: 'z', position: 1, title: 'Z' })]
    let n = 0
    const { copies, idMap } = forkCopies(template, () => `fk${n++}`)
    expect(copies.map((c) => c.id)).toEqual(['fk0', 'fk1'])
    // Copies preserve everything but the id, in order.
    expect(copies.map((c) => c.title)).toEqual(['A', 'Z'])
    expect(idMap).toEqual({ a: 'fk0', z: 'fk1' })
    // The originals are untouched (copy, not move).
    expect(template.map((t) => t.id)).toEqual(['a', 'z'])
  })

  it('is a no-op mapping for an empty Template day', () => {
    const { copies, idMap } = forkCopies([], () => 'x')
    expect(copies).toEqual([])
    expect(idMap).toEqual({})
  })
})

describe('reorderWithinSlots', () => {
  it('permutes only the named ids, leaving others in their original slot', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }))
    // b, d are the "timeline" subset; a, c, e are untouched siblings sharing
    // the same position sequence (e.g. rapid-log todos/notes on the same day).
    const result = reorderWithinSlots(items, ['d', 'b'])
    expect(result.map((i) => i.id)).toEqual(['a', 'd', 'c', 'b', 'e'])
  })

  it('is a no-op when the order is unchanged', () => {
    const items = ['a', 'b', 'c'].map((id) => ({ id }))
    expect(reorderWithinSlots(items, ['a', 'b', 'c']).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

// ---------- traces (#20 habit, #21 project/sprint) ----------

describe('placedBlockFields (chip placement carries the trace)', () => {
  const bucket = { id: 'bk1', cat: 'work' as const }

  it('a vague task places a vague block (all traces null)', () => {
    const f = placedBlockFields(bucket, { name: 'Emails', deep: false })
    expect(f).toMatchObject({
      bucketId: 'bk1',
      cat: 'work',
      title: 'Emails',
      durMin: 60,
      anchored: false,
      deep: false,
      habitId: null,
      projectId: null,
      sprintId: null,
    })
  })

  it('a habit-traced task pre-links the habit on the block (#20)', () => {
    const f = placedBlockFields(bucket, { name: 'Sentence mining', deep: true, habitId: 'h1' })
    expect(f.habitId).toBe('h1')
    expect(f.deep).toBe(true)
    expect(f.projectId).toBeNull()
    expect(f.sprintId).toBeNull()
  })

  it('a project-traced task carries the project (and sprint) onto the block (#21)', () => {
    const f = placedBlockFields(bucket, { name: 'Write chapter', deep: false, projectId: 'p1', sprintId: 's1' })
    expect(f.projectId).toBe('p1')
    expect(f.sprintId).toBe('s1')
    expect(f.habitId).toBeNull()
  })

  it('a double-traced task carries BOTH links (#21)', () => {
    const f = placedBlockFields(bucket, { name: 'Deep study', deep: true, habitId: 'h1', projectId: 'p1', sprintId: 's1' })
    expect(f.habitId).toBe('h1')
    expect(f.projectId).toBe('p1')
    expect(f.sprintId).toBe('s1')
  })
})

describe('freezeBlockEntry (materialize stamps the trace onto the record)', () => {
  const traced = b({ id: 'blk', title: 'Write chapter', cat: 'thesis', durMin: 90, deep: true, projectId: 'p1', sprintId: 's1' })

  it('freezes an open task entry pointing back at the block', () => {
    const e = freezeBlockEntry(traced, '2026-07-17', 540, 3, 'e1')
    expect(e).toMatchObject({
      id: 'e1',
      onDate: '2026-07-17',
      kind: 'task',
      state: 'open',
      text: 'Write chapter',
      cat: 'thesis',
      blockId: 'blk',
      durMin: 90,
      deep: true,
      startMin: 540,
      position: 3,
    })
  })

  it('stamps the project/sprint trace so a check-off accrues to the project (#21)', () => {
    const e = freezeBlockEntry(traced, '2026-07-17', 540, 0, 'e1')
    expect(e.projectId).toBe('p1')
    expect(e.sprintId).toBe('s1')
  })

  it('a vague block freezes a vague entry (no accrual)', () => {
    const e = freezeBlockEntry(b({ id: 'v', projectId: null, sprintId: null }), '2026-07-17', 540, 0, 'e2')
    expect(e.projectId).toBeNull()
    expect(e.sprintId).toBeNull()
  })

  it('a double-traced block freezes an entry that accrues to the project (habit rides on the block)', () => {
    // The habit is NOT stamped on the entry — it stays on the block and is
    // mirrored on check-off. The entry carries only the project accrual.
    const dbl = b({ id: 'd', habitId: 'h1', projectId: 'p1', sprintId: 's1' })
    const e = freezeBlockEntry(dbl, '2026-07-17', 540, 0, 'e3')
    expect(e.projectId).toBe('p1')
    expect(dbl.habitId).toBe('h1') // habit pre-link survives on the block for the checkoff mirror
  })
})

describe('trace degrade rules (ON DELETE SET NULL mirror)', () => {
  it('deleting a habit degrades the task to vague — chip name survives, link nulled (#20)', () => {
    const task = { name: 'Mining', deep: true, habitId: 'h1', projectId: null, sprintId: null }
    const d = detachHabit(task, 'h1')
    expect(d.habitId).toBeNull()
    expect(d.name).toBe('Mining') // chip survives
  })

  it('detachHabit leaves an unrelated habit trace untouched', () => {
    const task = { name: 'x', deep: false, habitId: 'h2', projectId: null, sprintId: null }
    expect(detachHabit(task, 'h1')).toBe(task) // same reference — no change
  })

  it('deleting a project degrades to vague — BOTH project and sprint nulled (#21)', () => {
    const task = { name: 'Chapter', deep: false, habitId: null, projectId: 'p1', sprintId: 's1' }
    const d = detachProject(task, 'p1')
    expect(d.projectId).toBeNull()
    expect(d.sprintId).toBeNull()
    expect(d.name).toBe('Chapter')
  })

  it('deleting just the sprint keeps the project trace (#21)', () => {
    const task = { name: 'Chapter', deep: false, habitId: null, projectId: 'p1', sprintId: 's1' }
    const d = detachSprint(task, 's1')
    expect(d.projectId).toBe('p1') // project trace stays
    expect(d.sprintId).toBeNull()
  })

  it('a habit trace is independent of a project trace under deletes', () => {
    const task = { name: 'Deep', deep: true, habitId: 'h1', projectId: 'p1', sprintId: 's1' }
    const afterHabit = detachHabit(task, 'h1')
    expect(afterHabit.habitId).toBeNull()
    expect(afterHabit.projectId).toBe('p1') // project survives a habit delete
    const afterProject = detachProject(task, 'p1')
    expect(afterProject.habitId).toBe('h1') // habit survives a project delete
  })
})

describe('isTraceStale (finished target flags the chip)', () => {
  const projects: Pick<Project, 'id' | 'status'>[] = [
    { id: 'p1', status: 'active' },
    { id: 'p2', status: 'archived' },
    { id: 'p3', status: 'done' },
  ]
  const sprints: Pick<Sprint, 'id' | 'status'>[] = [
    { id: 's1', status: 'active' },
    { id: 's2', status: 'done' },
  ]

  it('a done sprint is stale (#21)', () => {
    expect(isTraceStale({ projectId: 'p1', sprintId: 's2' }, projects, sprints)).toBe(true)
  })

  it('an archived project is stale (#21)', () => {
    expect(isTraceStale({ projectId: 'p2', sprintId: null }, projects, sprints)).toBe(true)
  })

  it('an active project + active sprint is not stale', () => {
    expect(isTraceStale({ projectId: 'p1', sprintId: 's1' }, projects, sprints)).toBe(false)
  })

  it('a vague or habit-only task is never stale', () => {
    expect(isTraceStale({ projectId: null, sprintId: null }, projects, sprints)).toBe(false)
  })

  it('a trace whose target no longer exists (already degraded) is not stale', () => {
    expect(isTraceStale({ projectId: 'gone', sprintId: 'gone' }, projects, sprints)).toBe(false)
  })

  it('a done (not archived) project alone is not stale — only archived flags it', () => {
    expect(isTraceStale({ projectId: 'p3', sprintId: null }, projects, sprints)).toBe(false)
  })
})

describe('entryHabitMirror (Today-editor chip logs its habit on check-off, #24)', () => {
  it('a block-less habit-traced entry logs its habit when marked done', () => {
    // The bug: a habit-traced chip placed via the Today editor is a block-less
    // Log Entry; checking it off must now log the habit (it carries habitId).
    expect(entryHabitMirror({ habitId: 'h1', blockId: null }, 'done')).toEqual({ habitId: 'h1', on: true })
  })

  it('un-logs the habit when the entry leaves the done state', () => {
    expect(entryHabitMirror({ habitId: 'h1', blockId: null }, 'open')).toEqual({ habitId: 'h1', on: false })
    expect(entryHabitMirror({ habitId: 'h1', blockId: null }, 'dropped')).toEqual({ habitId: 'h1', on: false })
  })

  it('an untraced entry yields no mirror', () => {
    expect(entryHabitMirror({ habitId: null, blockId: null }, 'done')).toBeNull()
  })

  it('a block-linked entry yields no mirror — it mirrors through its Block instead', () => {
    // Even if such an entry carried a habitId, the block->habit path
    // (toggleBlockLog) owns the mirror; entryHabitMirror must stay out of it to
    // avoid double-logging the Planner-placed path.
    expect(entryHabitMirror({ habitId: 'h1', blockId: 'blk' }, 'done')).toBeNull()
  })
})
