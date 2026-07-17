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
  // The Bucket this block was placed from (ADR-0003). Null = Unassigned. Color
  // resolves live through this reference (see `blockStyle`); `cat` below is the
  // stamped derived plumbing kept in lockstep, never authoritative.
  bucketId: string | null
  cat: Cat
  title: string
  detail: string
  startMin: number
  durMin: number
  anchored: boolean
  deep: boolean
  // Traces carried from the placed Bucket Task (#20/#21), independent & coexisting:
  habitId: string | null // when set, checking this block off logs the habit
  projectId: string | null // when set, materialize stamps it on the entry -> accrues to the project
  sprintId: string | null // optional sprint container within the project
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

// ---------- bullet-journal log entries ----------

export type LogKind = 'task' | 'event' | 'note'
export type LogState = 'open' | 'done' | 'migrated' | 'scheduled' | 'dropped'
export type LogSignifier = '' | 'priority' | 'inspiration'

/** A single item on a given (local) day — the permanent record. Either
 *  rapid-logged by hand or frozen from a plan Block by `materialize_day`. */
export interface LogEntry {
  id: string
  onDate: string // ISO local date (YYYY-MM-DD)
  kind: LogKind
  state: LogState
  signifier: LogSignifier
  text: string
  cat: Cat
  blockId: string | null
  migratedTo: string | null
  projectId: string | null
  sprintId: string | null
  position: number
  // Frozen from the source Block when materialized; null/false for hand-typed
  // entries. `durMin != null` marks an entry as a frozen block accomplishment.
  durMin: number | null
  deep: boolean
  // Today-timeline placement: null for entries not on the "Today's plan"
  // timeline (rapid-log todos/notes). Frozen from the source Block's
  // resolve()-computed start at materialize time, then edited independently
  // via the same chained/anchored re-flow model as `blocks`' resolve().
  startMin: number | null
  anchored: boolean
}

/** A Log Entry with sensible defaults (hand-typed, open task); overrides win.
 *  The single constructor both backends use, so cloud and demo build entries
 *  identically. */
export function newLogEntry(over: Partial<LogEntry> & Pick<LogEntry, 'id' | 'onDate'>): LogEntry {
  return {
    kind: 'task',
    state: 'open',
    signifier: '',
    text: '',
    cat: 'open',
    blockId: null,
    migratedTo: null,
    projectId: null,
    sprintId: null,
    position: 0,
    durMin: null,
    deep: false,
    startMin: null,
    anchored: false,
    ...over,
  }
}

// ---------- projects & sprints ----------

export type ProjectStatus = 'planning' | 'active' | 'done' | 'archived'
export type SprintStatus = 'planning' | 'active' | 'done'

export interface Project {
  id: string
  name: string
  goal: string
  status: ProjectStatus
  position: number
}

export interface Sprint {
  id: string
  projectId: string
  name: string
  goal: string
  status: SprintStatus
  startDate: string | null
  endDate: string | null
  position: number
}

export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'done', 'archived']
export const SPRINT_STATUSES: SprintStatus[] = ['planning', 'active', 'done']

// ---------- traces (#20 habit, #21 project/sprint) ----------

/** A Trace: a Bucket Task's (and, once placed, a Block's) optional links to a
 *  Habit and/or a Project — optionally narrowed to a Sprint *container* within
 *  it. The two are independent and may coexist on one task. Every ref is
 *  nullable; a null everywhere is a vague task. */
export interface Trace {
  habitId: string | null
  projectId: string | null
  sprintId: string | null
}

/** The trace a Bucket Task carries (name + deep + Trace) — the shape the bucket
 *  editor and the placement path read. `Bucket`/`BucketTask` proper live in the
 *  queries layer; this is the pure slice the domain logic needs. */
export interface TracedTask extends Trace {
  name: string
  deep: boolean
}

/** Duration a placed chip gets by default (1h), matching the design palette. */
const PLACED_BLOCK_DUR = 60

/**
 * The fields to stamp on a Block when a Bucket Task chip is placed onto a day.
 * The placed Block records which Bucket it came from (`bucketId`; `cat` is the
 * stamped derived plumbing, ADR-0003) AND carries the task's Traces, so the
 * Block is pre-linked: checking it off logs the habit, and its materialized Log
 * Entry accrues to the project (and sprint). A vague task places a vague block
 * (all traces null). Pure: bucket + task in, block fields out.
 */
export function placedBlockFields(
  bucket: { id: string; cat: Cat },
  task: Partial<Trace> & { name: string; deep: boolean },
): Pick<
  Block,
  'bucketId' | 'cat' | 'title' | 'durMin' | 'anchored' | 'deep' | 'habitId' | 'projectId' | 'sprintId'
> {
  return {
    bucketId: bucket.id,
    cat: bucket.cat,
    title: task.name,
    durMin: PLACED_BLOCK_DUR,
    anchored: false,
    deep: task.deep,
    habitId: task.habitId ?? null,
    projectId: task.projectId ?? null,
    sprintId: task.sprintId ?? null,
  }
}

/**
 * Freeze a resolved plan Block into an OPEN task Log Entry — the shared shape
 * `materialize` produces (both backends). Stamps the Block's project/sprint
 * Trace onto the entry so a later check-off accrues the accomplishment to the
 * project (and sprint) — the log-primary mirror of the SQL `materialize_day`.
 * The habit link is NOT copied onto the entry: it rides on the Block
 * (`habitId`), and the client mirrors the habit log from there when the Block's
 * entry is checked off.
 */
export function freezeBlockEntry(
  block: Pick<Block, 'id' | 'title' | 'cat' | 'durMin' | 'deep' | 'anchored' | 'projectId' | 'sprintId'>,
  dateIso: string,
  start: number,
  position: number,
  id: string,
): LogEntry {
  return newLogEntry({
    id,
    onDate: dateIso,
    state: 'open',
    text: block.title,
    cat: block.cat,
    blockId: block.id,
    position,
    durMin: block.durMin,
    deep: block.deep,
    startMin: start,
    anchored: block.anchored,
    projectId: block.projectId,
    sprintId: block.sprintId,
  })
}

/**
 * ON DELETE SET NULL mirror for a deleted Habit: null the habit trace on any
 * holder (Bucket Task or Block) that pointed at it — the chip survives, degraded
 * to vague. Returns the holder unchanged when it didn't reference this habit.
 */
export function detachHabit<T extends { habitId: string | null }>(holder: T, habitId: string): T {
  return holder.habitId === habitId ? { ...holder, habitId: null } : holder
}

/**
 * ON DELETE SET NULL mirror for a deleted Project: null BOTH the project and the
 * sprint trace (a sprint can't outlive its project — sprints cascade from
 * projects). Degrades the holder to vague.
 */
export function detachProject<T extends { projectId: string | null; sprintId: string | null }>(
  holder: T,
  projectId: string,
): T {
  return holder.projectId === projectId ? { ...holder, projectId: null, sprintId: null } : holder
}

/**
 * ON DELETE SET NULL mirror for a deleted Sprint: null ONLY the sprint trace,
 * keeping the project trace — the task stays project-traced, just no longer
 * narrowed to that sprint.
 */
export function detachSprint<T extends { sprintId: string | null }>(holder: T, sprintId: string): T {
  return holder.sprintId === sprintId ? { ...holder, sprintId: null } : holder
}

/**
 * A project/sprint Trace is STALE when its target is finished — the sprint is
 * done or the project archived (#21). A stale chip stays placeable but is
 * flagged for re-pointing. A vague (untraced) or habit-only task is never
 * stale, and a trace whose target no longer exists (already degraded to null)
 * isn't stale either. Pure: trace + the live project/sprint lists in.
 */
export function isTraceStale(
  trace: { projectId: string | null; sprintId: string | null },
  projects: { id: string; status: ProjectStatus }[],
  sprints: { id: string; status: SprintStatus }[],
): boolean {
  if (trace.projectId) {
    const p = projects.find((x) => x.id === trace.projectId)
    if (p && p.status === 'archived') return true
  }
  if (trace.sprintId) {
    const s = sprints.find((x) => x.id === trace.sprintId)
    if (s && s.status === 'done') return true
  }
  return false
}

/** A completed block, frozen as it stood the day it was planned. Now derived
 *  from the log-primary record (a done, block-sourced Log Entry) rather than
 *  the retired `block_logs` table. */
export interface BlockLogRow {
  blockId: string
  dateIso: string
  title: string
  cat: Cat
  durMin: number
  deep: boolean
}

/** True for a done Log Entry that was frozen from a plan Block (carries a
 *  frozen duration) — the log-primary replacement for a `block_logs` row. */
function isBlockAccomplishment(e: LogEntry): boolean {
  return e.kind === 'task' && e.state === 'done' && e.durMin != null
}

/**
 * `dateIso`'s "Today's plan" timeline: task entries carrying a start time —
 * excludes rapid-log todos/notes (no `startMin`) and entries no longer part
 * of today's plan (dropped, migrated away). Sorted by position, the same
 * order `resolve()` expects.
 */
export function onTimelineEntries(entries: LogEntry[], dateIso: string): LogEntry[] {
  return entries
    .filter(
      (e) =>
        e.onDate === dateIso && e.kind === 'task' && e.startMin != null && e.state !== 'dropped' && e.state !== 'migrated',
    )
    .sort((a, b) => a.position - b.position)
}

/**
 * The done, block-sourced entries as frozen block snapshots — the log-primary
 * source for the accomplishment report and the past Daily Log's completed list
 * (replaces reading the retired `block_logs` table).
 */
export function blockLogRowsFromEntries(entries: LogEntry[]): BlockLogRow[] {
  return entries.filter(isBlockAccomplishment).map((e) => ({
    blockId: e.blockId ?? '',
    dateIso: e.onDate,
    title: e.text,
    cat: e.cat,
    durMin: e.durMin ?? 0,
    deep: e.deep,
  }))
}

/**
 * `{ [on_date]: { [block_id]: true } }` for every block whose entry is done —
 * the log-primary source of a block's checked state (replaces `block_logs`).
 * Drives the Today/Week checkboxes and completion stats.
 */
export function doneBlockMap(entries: LogEntry[]): LogMap {
  const map: LogMap = {}
  for (const e of entries) {
    if (e.blockId && e.kind === 'task' && e.state === 'done') {
      ;(map[e.onDate] ??= {})[e.blockId] = true
    }
  }
  return map
}

/** Ryder-Carroll bullet for an entry, factoring in kind + state. */
export function bullet(kind: LogKind, state: LogState): string {
  if (kind === 'note') return '—'
  if (kind === 'event') return '○'
  switch (state) {
    case 'done':
      return '✕'
    case 'migrated':
      return '›'
    case 'scheduled':
      return '‹'
    case 'dropped':
      return '•'
    default:
      return '•'
  }
}

export const SIGNIFIER_GLYPH: Record<LogSignifier, string> = {
  '': '',
  priority: '✷',
  inspiration: '!',
}

/** Tap-cycle for a task bullet: open → done → dropped → open. Notes/events don't cycle. */
export function nextState(kind: LogKind, state: LogState): LogState {
  if (kind !== 'task') return state
  if (state === 'open') return 'done'
  if (state === 'done') return 'dropped'
  return 'open'
}

// ---------- category styling ----------

export interface CatStyle {
  color: string // '' = default palette color for the cat
}

/** Per-category custom colors derived from the user's buckets. Legacy,
 *  first-bucket-wins, still used to tint cat-keyed things that don't (yet)
 *  carry a Bucket reference — Log Entries (#18), Habits (#19). Blocks resolve
 *  per-reference through `blockStyle`, which kills first-bucket-wins. */
export function catStyles(buckets: { cat: Cat; color: string }[]): Partial<Record<Cat, CatStyle>> {
  const map: Partial<Record<Cat, CatStyle>> = {}
  for (const bk of buckets) if (!map[bk.cat]) map[bk.cat] = { color: bk.color }
  return map
}

/** Inline style overriding the stripe color when a custom/resolved one exists. */
export function stripeVar(style?: CatStyle): Record<string, string> | undefined {
  return style?.color ? { ['--stripe']: style.color } : undefined
}

/** The default stripe color per cat as a CSS palette var (mirrors index.css's
 *  `.s-*` rules). The `open` slot is Unassigned gray. */
export const CAT_STRIPE: Record<Cat, string> = {
  work: 'var(--b-work)',
  devops: 'var(--b-devops)',
  thesis: 'var(--b-thesis)',
  math: 'var(--b-math)',
  chin: 'var(--b-chin)',
  exercise: 'var(--b-exer)',
  wqu: 'var(--b-wqu)',
  life: 'var(--b-life)',
  open: 'var(--b-open)',
}

/** The minimal Bucket shape the color resolver reads. */
export interface BucketColor {
  id: string
  cat: Cat
  color: string // '' = no custom color; fall back to the cat palette
}

/**
 * A Block's stripe color, resolved LIVE through its Bucket reference:
 *   1. the referenced bucket's custom color, else
 *   2. that bucket's cat palette (bucket exists, no custom color), else
 *   3. the block's own stamped cat palette — a null/deleted `bucketId` (the
 *      set-null revert keeps the block's derived `cat`), which for the
 *      Unassigned `open` cat resolves to gray.
 *
 * Pure: plain data in, a CatStyle out. Because it reads the live bucket list,
 * recoloring a bucket (or deleting it — bucket_id set-null) instantly restyles
 * every block placed from it, and two buckets sharing a legacy `cat` hold two
 * different colors without interfering.
 */
export function blockStyle(block: { bucketId: string | null; cat: Cat }, buckets: BucketColor[]): CatStyle {
  const bucket = block.bucketId ? buckets.find((bk) => bk.id === block.bucketId) : undefined
  if (bucket?.color) return { color: bucket.color }
  const cat = bucket?.cat ?? block.cat
  return { color: CAT_STRIPE[cat] ?? CAT_STRIPE.open }
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

/** Weekday (Mon = 0) of an ISO date string, read in local time. */
export function dowOfIso(dateIso: string): number {
  return dowMon(new Date(`${dateIso}T00:00:00`))
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

/**
 * `now`'s calendar date in Asia/Manila, as a local-midnight Date. The user's
 * sense of "today" — never trust the machine/UTC date for day boundaries
 * (UTC runs a day behind PHT every evening). Pure: inject `now`.
 */
export function manilaDate(now: Date): Date {
  const iso = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  return new Date(`${iso}T00:00:00`)
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface WeekRange {
  start: Date // Monday
  end: Date // Sunday
  label: string // e.g. "Week of Jul 20–26" / "Week of Jun 29 – Jul 5"
}

/**
 * The calendar week (Mon–Sun) containing `today`, shifted by `weekOffset`
 * whole weeks (0 = this week, 1 = next, -1 = last), with the Planner header's
 * display label. Pure — the caller injects "today" (see `manilaDate`).
 */
export function weekRange(today: Date, weekOffset = 0): WeekRange {
  const start = addDays(today, -dowMon(today) + weekOffset * 7)
  const end = addDays(start, 6)
  const label =
    start.getMonth() === end.getMonth()
      ? `Week of ${MONTH_SHORT[start.getMonth()]} ${start.getDate()}–${end.getDate()}`
      : `Week of ${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`
  return { start, end, label }
}

/**
 * Local dates (YYYY-MM-DD) still needing a Materialize freeze on app open:
 * every day after `lastSeen` through `today` inclusive. Empty when already
 * caught up (or the clock ran backwards); first run (no `lastSeen`) freezes
 * just today. Both args are Asia/Manila local dates — the caller derives them.
 */
export function pendingMaterializationDates(lastSeen: string | null, today: string): string[] {
  if (!lastSeen) return [today]
  if (lastSeen >= today) return [] // caught up today, or clock skew
  const out: string[] = []
  let d = addDays(new Date(`${lastSeen}T00:00:00`), 1)
  while (isoDate(d) <= today) {
    out.push(isoDate(d))
    d = addDays(d, 1)
  }
  return out
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

// ---------- "plan for date" resolver ----------

/** Where a Planner day's rendered plan comes from.
 *  - 'frozen-past': the day's materialized Log Entries — the plan as frozen; read-only.
 *  - 'today': the live today plan (today's on-timeline Log Entries), same lens as the Today tab.
 *  - 'projection': the weekday Template projected onto a future date; editing it edits the Template.
 *  - 'fork': a future date with its own Day Plan (whole-day fork) — resolution lands in slice #14. */
export type DaySource = 'frozen-past' | 'today' | 'projection' | 'fork'

/** One laid-out item in a Planner day column, normalized across sources so a
 *  single day can mix origins (a projection day + dated one-offs, slice #13).
 *  Exactly one of `blockId`-only / `entryId` identifies the edit target:
 *  a projection item carries the Template `blockId` (edits go to the Template);
 *  a frozen/today item carries the Log Entry's `entryId` (plus the source
 *  Block's id in `blockId` when it was materialized from one). */
export interface PlanItem {
  key: string // stable render key, unique within the day
  title: string
  detail: string
  // The source Block's Bucket reference (null for entry-backed items, which
  // don't carry one until #18) — blocks resolve their color live through it.
  bucketId: string | null
  cat: Cat
  deep: boolean
  durMin: number
  start: number // resolve()-computed start, minutes past midnight
  conflict: boolean
  anchored: boolean
  blockId: string | null
  entryId: string | null
}

/** A Planner day column: what to render and how to route edits. */
export interface DayPlan {
  dateIso: string
  source: DaySource
  items: PlanItem[]
}

/** Everything `planForDate` reads. Dated one-offs (#13) — entries with a
 *  **future** `onDate` + `startMin` — arrive via `logEntries`; the resolver
 *  merges them into that day's projection/fork. */
export interface PlanForDateInput {
  /** The weekday Template, index = dow (Mon = 0), each day sorted by position. */
  blocksByDow: Block[][]
  /** The log-primary record (materialized past days + today's live plan). */
  logEntries: LogEntry[]
  /** Day Plans (whole-day forks): ISO date → that date's dated Blocks, sorted
   *  by position. A key's **presence** means the date is forked — an empty
   *  array is an intentionally-emptied day (renders blank), not "no fork".
   *  A fork wins over the Template for future dates and tags the day 'fork';
   *  the record still wins for today/past (a fork is plan-side only). Dated
   *  one-offs (slice #13) merge on top of either a projection or a fork. */
  dayForks?: Record<string, Block[]>
}

const DEFAULT_ENTRY_DUR = 30 // hand-typed timeline entries carry no frozen duration

function entryItems(entries: LogEntry[]): PlanItem[] {
  const timeline = entries.map((e) => ({ ...e, startMin: e.startMin ?? 0, durMin: e.durMin ?? DEFAULT_ENTRY_DUR }))
  return resolve(timeline).map(({ block: e, start, conflict }) => ({
    key: `entry:${e.id}`,
    title: e.text,
    detail: '',
    bucketId: null, // Log Entries don't carry a Bucket reference yet (#18)
    cat: e.cat,
    deep: e.deep,
    durMin: e.durMin,
    start,
    conflict,
    anchored: e.anchored,
    blockId: e.blockId,
    entryId: e.id,
  }))
}

/**
 * Merge a future day's dated one-off entries (#13) into its already laid-out
 * plan (`base` — the Template projection today; a Day Plan fork's layout works
 * the same). One layout unit per item — base items pinned at their resolved
 * starts (keeping their own anchored flag), one-offs at their stored
 * `startMin` — sorted by start time and re-flowed through `resolve()`, so the
 * merged day never overlaps: an unanchored one-off chains into the gap where
 * its start time falls, an anchored one that a base item overruns is pushed
 * down and flagged. Base items keep their relative order (their resolved
 * starts are non-decreasing and the sort is stable).
 */
export function mergeDatedOneOffs(base: PlanItem[], oneOffs: LogEntry[]): PlanItem[] {
  if (!oneOffs.length) return base
  const units = base.map((item) => ({ startMin: item.start, durMin: item.durMin, anchored: item.anchored, item }))
  for (const e of oneOffs) {
    const durMin = e.durMin ?? DEFAULT_ENTRY_DUR
    const startMin = e.startMin ?? 0
    units.push({
      startMin,
      durMin,
      anchored: e.anchored,
      item: {
        key: `entry:${e.id}`,
        title: e.text,
        detail: '',
        bucketId: null, // Log Entries don't carry a Bucket reference yet (#18)
        cat: e.cat,
        deep: e.deep,
        durMin,
        start: startMin,
        conflict: false,
        anchored: e.anchored,
        blockId: e.blockId,
        entryId: e.id,
      },
    })
  }
  units.sort((a, b) => a.startMin - b.startMin)
  return resolve(units).map(({ block: u, start, conflict }) => ({
    ...u.item,
    start,
    conflict: u.item.conflict || conflict,
  }))
}

/** Fallback start for the first one-off on an otherwise empty day (09:00). */
const EMPTY_DAY_START = 540

/**
 * Where a newly scheduled dated one-off lands on `dateIso`: chained,
 * unanchored, right after the day's last planned item — whatever
 * `planForDate` says that day's plan is (today's live timeline, or a future
 * projection already merged with earlier one-offs). 09:00 on an empty day.
 */
export function nextOneOffStart(input: PlanForDateInput, dateIso: string, todayIso: string): number {
  const items = planForDate(input, dateIso, todayIso).items
  const last = items[items.length - 1]
  return last ? Math.min(last.start + last.durMin, 1410) : EMPTY_DAY_START
}

/**
 * Where a newly (re)scheduled dated one-off lands on `dateIso`: a `startMin`
 * chained unanchored after the day's last planned item, and a `position` at the
 * end of that date's entries. The entry being scheduled is excluded from both
 * (re-scheduling must not chain after its own old slot). Pure; both backends
 * persist the result.
 */
export function scheduleSlot(
  input: PlanForDateInput,
  entryId: string,
  dateIso: string,
  todayIso: string,
): { startMin: number; position: number } {
  const others = input.logEntries.filter((e) => e.id !== entryId)
  const startMin = nextOneOffStart({ ...input, logEntries: others }, dateIso, todayIso)
  const position = others.filter((e) => e.onDate === dateIso).reduce((m, e) => Math.max(m, e.position + 1), 0)
  return { startMin, position }
}

/**
 * Copy a weekday's Template Blocks into dated fork copies for a Day Plan,
 * minting a fresh id for each via `mkId` (the caller supplies the id source —
 * `crypto.randomUUID` in the cloud backend, the demo's counter otherwise).
 * Returns the copies in order plus the Template→fork id map, so the edit that
 * triggered the fork can retarget from the Template block to its fork copy.
 */
export function forkCopies(
  templateBlocks: Block[],
  mkId: () => string,
): { copies: Block[]; idMap: Record<string, string> } {
  const idMap: Record<string, string> = {}
  const copies = templateBlocks.map((b) => {
    const id = mkId()
    idMap[b.id] = id
    return { ...b, id }
  })
  return { copies, idMap }
}

/**
 * The single seam deciding what a Planner column shows for a calendar date.
 * Pure: planner data + ISO date (+ today's Manila-local ISO date) in,
 * laid-out day + source tag out.
 *
 * - Past date → 'frozen-past': that day's materialized Log Entries through the
 *   plan lens — every task entry with a start time, **regardless of record
 *   state** (done/migrated/dropped are facts about the record; the plan is the
 *   plan as frozen). Never-materialized days come back empty (blank column).
 * - Today → 'today': the live plan, exactly `onTimelineEntries` (the Today tab's lens).
 * - Future date → 'fork' when the date has a Day Plan (whole-day fork): laid
 *   out from the fork's own dated Blocks, ignoring the Template entirely — a
 *   forked-empty day renders blank, never the projection.
 * - Future date otherwise → 'projection': the weekday Template laid out by
 *   `resolve()`.
 * - Either way, the future day's base layout is then merged with the date's
 *   dated one-offs (entries with this `onDate` + a `startMin`, same lens as
 *   the Today timeline) via `mergeDatedOneOffs` — one-offs ride on top of the
 *   projection or fork; they never fork the day themselves.
 */
export function planForDate(input: PlanForDateInput, dateIso: string, todayIso: string): DayPlan {
  if (dateIso < todayIso) {
    const frozen = input.logEntries
      .filter((e) => e.onDate === dateIso && e.kind === 'task' && e.startMin != null)
      .sort((a, b) => a.position - b.position)
    return { dateIso, source: 'frozen-past', items: entryItems(frozen) }
  }
  if (dateIso === todayIso) {
    return { dateIso, source: 'today', items: entryItems(onTimelineEntries(input.logEntries, dateIso)) }
  }
  const fork = input.dayForks?.[dateIso]
  const blocks = fork ?? input.blocksByDow[dowOfIso(dateIso)] ?? []
  const items = resolve(blocks).map(({ block: b, start, conflict }) => ({
    key: `block:${b.id}`,
    title: b.title,
    detail: b.detail,
    bucketId: b.bucketId,
    cat: b.cat,
    deep: b.deep,
    durMin: b.durMin,
    start,
    conflict,
    anchored: b.anchored,
    blockId: b.id,
    entryId: null,
  }))
  return {
    dateIso,
    source: fork ? 'fork' : 'projection',
    items: mergeDatedOneOffs(items, onTimelineEntries(input.logEntries, dateIso)),
  }
}

/**
 * Re-order a subset of a shared-position list (e.g. one day's Log Entries,
 * where `position` interleaves tasks/notes/events together) without
 * disturbing entries outside the subset. Entries not named in `orderedIds`
 * keep their original slot; the named ones are placed into the slots they
 * collectively occupied, in `orderedIds`' order. Caller re-numbers `position`
 * from the returned array's index.
 */
export function reorderWithinSlots<T extends { id: string }>(dayItems: T[], orderedIds: string[]): T[] {
  const idSet = new Set(orderedIds)
  const slots: number[] = []
  dayItems.forEach((item, i) => {
    if (idSet.has(item.id)) slots.push(i)
  })
  const byId = new Map(dayItems.map((item) => [item.id, item]))
  const result = [...dayItems]
  slots.forEach((slotIdx, i) => {
    const item = byId.get(orderedIds[i])
    if (item) result[slotIdx] = item
  })
  return result
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

// ---------- accomplishments (what got done, not hours) ----------

export interface CatAccomplishment {
  cat: Cat
  titles: { title: string; count: number; deep: boolean }[]
  mins: number
  deepSessions: number
}

export interface Accomplishments {
  byCat: CatAccomplishment[]
  tasksDone: number
  events: number
  migrated: number
  deepSessions: number
  totalBlocks: number
}

/**
 * What real work was completed in the inclusive [startIso, endIso] window,
 * read log-primary from the Daily Log. Done, block-sourced entries (carrying a
 * frozen duration) are the "blocks" — grouped by commitment with their distinct
 * titles (× repeat count); `life`/`open` are excluded. Hand-typed done tasks
 * (no frozen duration) are counted separately as `tasksDone`, so ticking a
 * block is never double-counted. This is the accomplishment view — not hours.
 */
export function windowAccomplishments(
  logEntries: LogEntry[],
  startIso: string,
  endIso: string,
): Accomplishments {
  const inWin = (iso: string) => iso >= startIso && iso <= endIso
  const catMap = new Map<Cat, CatAccomplishment>()
  let totalBlocks = 0
  let deepSessions = 0

  for (const r of blockLogRowsFromEntries(logEntries)) {
    if (!inWin(r.dateIso) || !COUNTED.includes(r.cat)) continue
    totalBlocks++
    if (r.deep) deepSessions++
    const entry = catMap.get(r.cat) ?? { cat: r.cat, titles: [], mins: 0, deepSessions: 0 }
    entry.mins += r.durMin
    if (r.deep) entry.deepSessions++
    const t = entry.titles.find((x) => x.title === r.title)
    if (t) {
      t.count++
      t.deep = t.deep || r.deep
    } else {
      entry.titles.push({ title: r.title, count: 1, deep: r.deep })
    }
    catMap.set(r.cat, entry)
  }

  const byCat = [...catMap.values()].sort((a, b) => b.mins - a.mins)
  for (const c of byCat) c.titles.sort((a, b) => Number(b.deep) - Number(a.deep) || b.count - a.count)

  let tasksDone = 0
  let events = 0
  let migrated = 0
  for (const e of logEntries) {
    if (!inWin(e.onDate)) continue
    // Block-sourced done entries are the "blocks" above; only hand-typed done
    // tasks (no frozen duration) add to the tasks tally.
    if (e.kind === 'task' && e.state === 'done' && e.durMin == null) tasksDone++
    else if (e.kind === 'task' && e.state === 'migrated') migrated++
    if (e.kind === 'event') events++
  }

  return { byCat, tasksDone, events, migrated, deepSessions, totalBlocks }
}
