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

export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

// The Trace fields (habitId/projectId/sprintId) are composed in via `extends Trace`
// (defined below); a placed Block carries the task's traces, independent & coexisting.
export interface Block extends Trace {
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
  // A Container holds a per-day Agenda instead of being its own content
  // (ADR-0006). Orthogonal to `deep`; default Concrete (false). Rides through
  // forks and projected days with the rest of the Block shape.
  container: boolean
}

export interface Day {
  dow: number
  name: string
  loc: string
}

export interface Habit {
  id: string
  name: string
  // The Bucket this habit belongs to (ADR-0003, #19). Null = Unassigned. Its
  // toggles, streak cells and bars resolve color live through this reference
  // (see `blockStyle`); `cat` below is the stamped derived plumbing kept in
  // lockstep, never authoritative.
  bucketId: string | null
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
  // The Bucket this entry belongs to (ADR-0003). Null = Unassigned (rendered
  // gray). Frozen from the source Block on materialize; picked at rapid-log;
  // backfilled through the block (else the cat→bucket 1:1 map) for history.
  // Color resolves live through this reference via `blockStyle`; `cat` below is
  // the stamped derived plumbing, kept in lockstep, never authoritative.
  bucketId: string | null
  cat: Cat
  blockId: string | null
  // The block_id role disambiguator (ADR-0006). false = a normal entry or a
  // Container's materialized parent line (block_id means "materialized FROM this
  // Block", 1:1). true = an Agenda item filled UNDER a Container (block_id is a
  // parent link, N:1) — a Dated one-off carrying order but no timeline start.
  isAgendaItem: boolean
  migratedTo: string | null
  // A block-less entry's own habit Trace (#24): a habit-traced chip placed via
  // the Today editor carries the task's habit here (a Block-placed chip rides on
  // blocks.habit_id instead). Checking such an entry off logs the habit — see
  // `entryHabitMirror`. Null everywhere = a vague/untraced entry.
  habitId: string | null
  projectId: string | null
  sprintId: string | null
  position: number
  // Board card order (#26, ADR-0005): this entry's order within whichever
  // Board column it currently sits in (global Inbox, a Project's Backlog, or
  // a Sprint — see boardColumnKey). Distinct from `position` (day-timeline
  // order) so reordering one view never touches the other.
  boardPosition: number
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
    bucketId: null,
    cat: 'open',
    blockId: null,
    isAgendaItem: false,
    migratedTo: null,
    habitId: null,
    projectId: null,
    sprintId: null,
    position: 0,
    boardPosition: 0,
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
 * `materialize` produces (both backends). Stamps the Block's `bucketId` (#18) so
 * the frozen entry groups into and recolors with its bucket, AND its
 * project/sprint Trace (#21) so a later check-off accrues the accomplishment to
 * the project (and sprint) — the log-primary mirror of the SQL `materialize_day`.
 * The habit link is NOT copied onto the entry: it rides on the Block
 * (`habitId`), and the client mirrors the habit log from there when the Block's
 * entry is checked off. (Uncounted buckets are filtered out by the caller via
 * `materializes` before this ever runs.)
 */
export function freezeBlockEntry(
  block: Pick<Block, 'id' | 'title' | 'bucketId' | 'cat' | 'durMin' | 'deep' | 'anchored' | 'projectId' | 'sprintId'>,
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
    bucketId: block.bucketId,
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
 * The habit-log mirror implied by flipping a Log Entry's state (#24): a
 * block-less entry carrying a habit Trace (a habit-traced chip placed via the
 * Today editor) logs its habit for that day when marked `done`, and un-logs it
 * for any other state. Returns `null` — no mirror — for an untraced entry, or a
 * block-linked one (that mirrors through its Block in `toggleBlockLog` instead,
 * never here). Pure: entry + its next state in, the habit-log delta out; both
 * backends apply the result (idempotently — skip when already in that state).
 */
export function entryHabitMirror(
  entry: Pick<LogEntry, 'habitId' | 'blockId'>,
  nextState: LogState,
): { habitId: string; on: boolean } | null {
  if (!entry.habitId || entry.blockId !== null) return null
  return { habitId: entry.habitId, on: nextState === 'done' }
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
  bucketId: string | null
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
 * A Container's **Agenda** on `dateIso`: the Log Entries filled under Container
 * Block `blockId` (an N:1 parent link on `block_id`, marked `isAgendaItem`),
 * in priority order. Excludes the Container's own materialized parent line
 * (`isAgendaItem` false) — parent and children share `block_id` and are told
 * apart by role (ADR-0006). Ordered by `position` (order, never duration).
 */
export function agendaItems(entries: LogEntry[], blockId: string, dateIso: string): LogEntry[] {
  return entries
    .filter((e) => e.isAgendaItem && e.blockId === blockId && e.onDate === dateIso)
    .sort((a, b) => a.position - b.position)
}

/** A trimmed Agenda item for rendering as a checklist row under a Container
 *  header — keeps its own state (for the ✓/strike) and its own Bucket/Trace so
 *  a completion credits the item's own Project/Sprint (#36/#39), not the
 *  Container's. `startMin`/`durMin` are deliberately absent: order, not time. */
export interface AgendaItemView {
  entryId: string
  text: string
  state: LogState
  deep: boolean
  bucketId: string | null
  cat: Cat
  projectId: string | null
  sprintId: string | null
}

export function agendaView(e: LogEntry): AgendaItemView {
  return {
    entryId: e.id,
    text: e.text,
    state: e.state,
    deep: e.deep,
    bucketId: e.bucketId,
    cat: e.cat,
    projectId: e.projectId,
    sprintId: e.sprintId,
  }
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
    bucketId: e.bucketId,
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

/**
 * The Bucket a legacy cat-keyed row backfills to: its 1:1 bucket, or the
 * lowest-position one when several buckets share the cat — mirroring migration
 * 0018's deterministic pick. `null` when no bucket carries the cat.
 *
 * Used to stamp `bucketId` onto Habits (#19) so their color resolves live
 * through `blockStyle`, and by the demo backend to reproduce the SQL backfill.
 */
export function bucketIdForCat(cat: Cat, buckets: { id: string; cat: Cat; position: number }[]): string | null {
  let best: { id: string; position: number } | undefined
  for (const bk of buckets) {
    if (bk.cat === cat && (!best || bk.position < best.position)) best = bk
  }
  return best?.id ?? null
}

/** ' sh' class suffix for shallow (non-deep) work — rendered muted. */
export function depthClass(deep: boolean): string {
  return deep ? '' : ' sh'
}

// ---------- counted / materialization (bucket-flag driven, ADR-0003 #17) ----------

/** The minimal Bucket shape the counted/materialization resolvers read. */
export interface BucketCounted {
  id: string
  counted: boolean
}

/**
 * Does this item's hours belong on the scoreboard? Resolved LIVE through the
 * item's Bucket `counted` flag — replaces the hardcoded `COUNTED`/`cat==='life'`
 * gate. A null/deleted bucket is **Unassigned** and never accrues (replacing the
 * `open` cat's role); an explicitly uncounted bucket (e.g. Life) doesn't either.
 * Pure: plain data in, boolean out — flipping a bucket's flag re-keys stats and
 * the weekly review instantly.
 */
export function isCounted(item: { bucketId: string | null }, buckets: BucketCounted[]): boolean {
  if (!item.bucketId) return false
  const bk = buckets.find((b) => b.id === item.bucketId)
  return !!bk?.counted
}

/**
 * Does this item freeze into the record on materialize? Only an explicitly
 * uncounted Bucket (e.g. Life: sleep/meals/commute) is excluded — replaces the
 * `cat <> 'life'` special case. A null/deleted bucket (**Unassigned**) still
 * materializes as a commitment, as does any counted bucket; it simply never
 * accrues counted hours (see `isCounted`).
 */
export function materializes(item: { bucketId: string | null }, buckets: BucketCounted[]): boolean {
  if (!item.bucketId) return true
  const bk = buckets.find((b) => b.id === item.bucketId)
  return bk ? bk.counted : true // a deleted bucket behaves as Unassigned
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

/** noon-anchored parse of an ISO date so it never rolls to the wrong day by timezone. */
export function fromIso(iso: string): Date {
  return new Date(iso + 'T12:00:00')
}

/** Weekday + short month + day + year, e.g. "Friday, Jul 18, 2026" — the
 *  long-form date label shared by the Log tab's day header and the Today
 *  tab's past-day pager (#25). */
export function longDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })
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
  // The Bucket reference — a Block's for projection/fork items, the entry's own
  // for entry-backed (frozen/today/one-off) items (#18). Color resolves live
  // through it (see `blockStyle`); null = Unassigned (gray).
  bucketId: string | null
  cat: Cat
  deep: boolean
  // A Container header (ADR-0006): a reserved chunk that holds a per-day Agenda.
  // Projection/fork items carry the Block's flag; entry-backed items default
  // false until a materialized Container parent line sets it (#35).
  container: boolean
  // The Container's Agenda for this day — its filled Agenda items in priority
  // order, rendered as a checklist under the header. Empty for a Concrete Block
  // or an unfilled Container.
  agenda: AgendaItemView[]
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
    bucketId: e.bucketId, // Log Entries carry a Bucket reference (#18); color resolves live
    cat: e.cat,
    deep: e.deep,
    container: false,
    agenda: [],
    durMin: e.durMin,
    start,
    conflict,
    anchored: e.anchored,
    blockId: e.blockId,
    entryId: e.id,
  }))
}

interface FrozenLayoutRow<T> {
  entry: T
  start: number
  conflict: boolean
}

/**
 * Shared core behind `frozenPastItems` and `frozenPastEntries`: sort a day's
 * task entries by their stored freeze-time `start_min` (never re-chained via
 * `resolve()` — ADR-0002 amendment), drop placeholder rows (a blank title or
 * an explicit zero duration — a half-built Template block that froze empty),
 * and flag — without repositioning — any entry whose stored start overlaps
 * the previous one's span. Stable sort: input pre-sorted by position, so
 * equal starts keep their frozen record order.
 */
function frozenLayout<T extends { startMin: number | null; text: string; durMin: number | null }>(
  entries: T[],
): FrozenLayoutRow<T>[] {
  const items = entries
    .filter((e) => e.startMin != null && e.text.trim() !== '' && e.durMin !== 0)
    .map((e) => ({ entry: e, start: e.startMin as number, conflict: false }))
    .sort((a, b) => a.start - b.start)
  let prevEnd = -Infinity
  for (const it of items) {
    const dur = it.entry.durMin ?? DEFAULT_ENTRY_DUR
    if (it.start < prevEnd) it.conflict = true
    prevEnd = Math.max(prevEnd, it.start + dur)
  }
  return items
}

/**
 * The frozen-past lens: a materialized day laid out at each entry's **stored**
 * freeze-time `start_min` — the plan exactly as it was frozen — NOT re-flowed
 * (ADR-0002 amendment). A past day's entries already carry their resolved start
 * times and are not in position=time order, so running them back through
 * `resolve()` (as the live-timeline lenses do) would discard those starts,
 * re-chain everything, collapse the real gaps, and overflow past midnight.
 *
 * Placeholder rows — a blank title or an explicit zero duration (a half-built
 * Template block that froze empty, filled in later) — are dropped; a titled
 * null-duration entry renders at the 30-min default. Items are sorted by clock
 * time; one overlapping the previous item in time is flagged `conflict`
 * (rendered with a collision tint) but never repositioned.
 */
export function frozenPastItems(entries: LogEntry[]): PlanItem[] {
  return frozenLayout(entries).map(({ entry: e, start, conflict }) => ({
    key: `entry:${e.id}`,
    title: e.text,
    detail: '',
    bucketId: e.bucketId, // Log Entries carry a Bucket reference (#18); color resolves live
    cat: e.cat,
    deep: e.deep,
    container: false,
    agenda: [],
    durMin: e.durMin ?? DEFAULT_ENTRY_DUR,
    start,
    conflict,
    anchored: e.anchored,
    blockId: e.blockId,
    entryId: e.id,
  }))
}

/**
 * `dateIso`'s Daily Log through the frozen-past lens, keeping full Log Entry
 * state (id/state/habitId/bucketId/…) instead of `frozenPastItems`'s
 * trimmed, state-stripped `PlanItem` — the Today tab's pageable past-day
 * view (#25) needs the real record, not a plan summary. Same layout core:
 * sorted by stored start, never re-chained; overlaps flagged `conflict`,
 * never repositioned.
 *
 * Diverges from `onTimelineEntries` (today's live lens) on purpose: dropped
 * and migrated entries are INCLUDED, with their real state intact, so a past
 * day stays actionable (reopen a dropped item, migrate an open one forward).
 * Diverges from `frozenPastItems`/Planner in the other direction: no
 * `materializes()`/counted filtering — life/routine items always render,
 * same as `frozenPastItems` already does.
 */
export function frozenPastEntries(entries: LogEntry[], dateIso: string): Resolved<LogEntry & { durMin: number }>[] {
  const dayEntries = entries
    .filter((e) => e.onDate === dateIso && e.kind === 'task')
    .sort((a, b) => a.position - b.position)
  return frozenLayout(dayEntries).map(({ entry, start, conflict }) => ({
    block: { ...entry, durMin: entry.durMin ?? DEFAULT_ENTRY_DUR },
    start,
    conflict,
  }))
}

/**
 * The item lens the Today tab's plan editor and entry modal both source from
 * (#25): the live on-timeline lens for the actual current day, else the
 * frozen-past-with-state lens for `dateIso`. One seam so `TodayEditor` and
 * `TodayEntryModal` can't drift on which entries a past day's structural
 * editing surface exposes.
 */
export function viewedEntries(entries: LogEntry[], dateIso: string, past: boolean): LogEntry[] {
  return past ? frozenPastEntries(entries, dateIso).map((r) => r.block) : onTimelineEntries(entries, dateIso)
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
        bucketId: e.bucketId, // Log Entries carry a Bucket reference (#18); color resolves live
        cat: e.cat,
        deep: e.deep,
        container: false,
        agenda: [],
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
 * The daily freeze in pure form (#35) — the client/demo mirror of the SQL
 * `materialize_day` RPC, kept in lockstep with it. Freezes `dateIso`'s plan
 * Blocks (a fork's dated Blocks or the weekday Template) into new OPEN parent
 * task Log Entries: only counted-Bucket blocks materialize (`materializes`),
 * laid out by `resolve()`, one parent line per block.
 *
 * Containers (ADR-0006): a Container is a plain block here, so it freezes into
 * exactly one **parent** line — its filled **Agenda items already exist** as
 * Log Entries (Dated one-offs sharing the Container's `block_id`), so the
 * parent + children shape emerges without copying anything. An **empty**
 * Container still freezes into its lone parent line (reserved time survives).
 * Crucially, the "already-frozen" guard counts **parent lines only**
 * (`!isAgendaItem`): a pre-filled Container's children share its `block_id` but
 * must NOT suppress creating the parent (the role split the SQL index encodes).
 *
 * Add-only and idempotent: a block whose parent line already exists is skipped,
 * mirroring the SQL `on conflict (…) where block_id is not null and not
 * is_agenda_item do nothing`. Returns the new parent entries to append.
 */
export function freezeDayBlocks(
  dayBlocks: Block[],
  logEntries: LogEntry[],
  dateIso: string,
  buckets: BucketCounted[],
  mkId: () => string,
): LogEntry[] {
  const onDay = logEntries.filter((e) => e.onDate === dateIso)
  // Parent lines already frozen for this day — Agenda children (isAgendaItem)
  // share a Container's block_id but never count as its frozen parent line.
  const frozen = new Set(onDay.filter((e) => e.blockId && !e.isAgendaItem).map((e) => e.blockId))
  let position = onDay.reduce((m, e) => Math.max(m, e.position + 1), 0)
  return resolve(dayBlocks.filter((b) => materializes(b, buckets)))
    .filter((r) => !frozen.has(r.block.id))
    .map((r) => freezeBlockEntry(r.block, dateIso, r.start, position++, mkId()))
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
 * Nest each entry-backed Container parent line's Agenda under it (#35): for a
 * materialized day (today/past), an item whose `blockId` has filled Agenda
 * children on that date is a Container parent — mark it `container` and hang
 * its Agenda. An empty materialized Container has no children, so it renders as
 * a plain reserved line (its time still survives in the record). Concrete
 * blocks (no children) pass through untouched.
 */
function attachAgenda(items: PlanItem[], entries: LogEntry[], dateIso: string): PlanItem[] {
  return items.map((it) => {
    if (!it.blockId) return it
    const kids = agendaItems(entries, it.blockId, dateIso)
    return kids.length ? { ...it, container: true, agenda: kids.map(agendaView) } : it
  })
}

/**
 * The single seam deciding what a Planner column shows for a calendar date.
 * Pure: planner data + ISO date (+ today's Manila-local ISO date) in,
 * laid-out day + source tag out.
 *
 * - Past date → 'frozen-past': that day's materialized Log Entries through the
 *   plan lens — every titled task entry with a start time, **regardless of
 *   record state** (done/migrated/dropped are facts about the record; the plan
 *   is the plan as frozen), rendered at its stored start with no re-flow (see
 *   `frozenPastItems`). Never-materialized days come back empty (blank column).
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
      // Agenda items (isAgendaItem) render nested under their Container's parent
      // line, never as their own timeline row — exclude them here (#35).
      .filter((e) => e.onDate === dateIso && e.kind === 'task' && !e.isAgendaItem)
      .sort((a, b) => a.position - b.position)
    // Rendered at stored freeze-time starts, NOT re-flowed — see frozenPastItems.
    return { dateIso, source: 'frozen-past', items: attachAgenda(frozenPastItems(frozen), input.logEntries, dateIso) }
  }
  if (dateIso === todayIso) {
    return {
      dateIso,
      source: 'today',
      items: attachAgenda(entryItems(onTimelineEntries(input.logEntries, dateIso)), input.logEntries, dateIso),
    }
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
    container: b.container,
    // A Container's Agenda rides on top of the projection/fork as Dated one-offs
    // (Log Entries parented via block_id) — it never forks the day (#32/US-13).
    agenda: b.container ? agendaItems(input.logEntries, b.id, dateIso).map(agendaView) : [],
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

// ---------- Board (#26) ----------

/** A Board move: dragging card `id` to `dest` (the global Inbox, the current
 *  Project's Backlog, or one of its Sprints by id), landing at `index` within
 *  that column's Board-position order. Dropping back into the same column at
 *  a new index is a plain in-column reorder. */
export interface BoardMove {
  id: string
  dest: 'inbox' | 'backlog' | string
  index: number
}

/** One entry's field updates from a Board move — either just a renumbered
 *  `boardPosition` (an untouched column member shifting to make room) or,
 *  for the dragged card itself, its new column assignment too. */
export interface BoardMoveUpdate {
  id: string
  fields: Partial<Pick<LogEntry, 'projectId' | 'sprintId' | 'kind' | 'boardPosition'>>
}

/**
 * Compute the Log Entry field updates for one Board move (#26) — a card
 * dragged between or within Inbox/Backlog/Sprint columns on `projectId`'s
 * Board. Covers both a cross-column move (project/sprint assignment, and
 * note->task promotion, mirroring the legacy moveEntry in ProjectsView) and
 * an in-column reorder (Board-position renumbering, in the same spirit as
 * reorderWithinSlots) with the same call — dropping a card back into its own
 * column just renumbers.
 *
 * Only returns updates for the destination column's members (post-move); any
 * other column, including the card's former one, is left untouched.
 */
export function applyBoardMove(entries: LogEntry[], projectId: string, move: BoardMove): BoardMoveUpdate[] {
  const moved = entries.find((e) => e.id === move.id)
  if (!moved) return []

  const destProjectId = move.dest === 'inbox' ? null : projectId
  const destSprintId = move.dest === 'inbox' || move.dest === 'backlog' ? null : move.dest

  const column = entries
    .filter((e) => e.id !== move.id && e.projectId === destProjectId && e.sprintId === destSprintId)
    .sort((a, b) => a.boardPosition - b.boardPosition)
  const index = Math.max(0, Math.min(move.index, column.length))
  const ordered = [...column.slice(0, index), moved, ...column.slice(index)]

  return ordered.map((e, boardPosition) => {
    if (e.id !== move.id) return { id: e.id, fields: { boardPosition } }
    const fields: BoardMoveUpdate['fields'] = { projectId: destProjectId, sprintId: destSprintId, boardPosition }
    if (moved.kind === 'note' && move.dest !== 'inbox') fields.kind = 'task' // processing a note into a project makes it a task
    return { id: e.id, fields }
  })
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
  /** Planned counted minutes grouped by Bucket lane (bucketId). */
  minsByBucket: Record<string, number>
  totalMins: number
  todayDone: number
  todayTotal: number
  weekDone: number
  weekTotal: number
  bestStreak: number
  bestStreakHabit: string
}

/**
 * This week's planned/accomplished picture, grouped by **Bucket lane** and
 * gated by each bucket's `counted` flag (ADR-0003 #17). `minsByBucket` sums only
 * counted blocks' planned minutes (Unassigned + uncounted buckets excluded);
 * completion counts (today/week Done/Total) include every **materializing**
 * block — i.e. exclude only uncounted buckets like Life, but keep Unassigned
 * commitments (replaces the old `cat <> 'life'` / `COUNTED` cat lists).
 */
export function weekStats(
  blocksByDow: Block[][],
  blockLogs: LogMap,
  habits: Habit[],
  habitLogs: LogMap,
  today: Date,
  buckets: BucketCounted[],
): WeekStats {
  const minsByBucket: Record<string, number> = {}
  for (const dayBlocks of blocksByDow) {
    for (const b of dayBlocks) {
      if (b.bucketId && isCounted(b, buckets)) minsByBucket[b.bucketId] = (minsByBucket[b.bucketId] ?? 0) + b.durMin
    }
  }
  const totalMins = Object.values(minsByBucket).reduce((a, b) => a + b, 0)

  const todayIso = isoDate(today)
  const todayLog = blockLogs[todayIso] ?? {}
  let todayDone = 0
  let todayTotal = 0
  for (const b of blocksByDow[dowMon(today)] ?? []) {
    if (!materializes(b, buckets)) continue
    todayTotal++
    if (todayLog[b.id]) todayDone++
  }

  let weekDone = 0
  let weekTotal = 0
  weekDates(today).forEach((d, i) => {
    const log = blockLogs[isoDate(d)] ?? {}
    for (const b of blocksByDow[i] ?? []) {
      if (!materializes(b, buckets)) continue
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

  return { minsByBucket, totalMins, todayDone, todayTotal, weekDone, weekTotal, bestStreak, bestStreakHabit }
}

// ---------- fortnight report ----------

export interface FortnightReport {
  start: Date
  end: Date
  /** Grouped by Bucket lane (bucketId), counted buckets only. */
  accompByBucket: Record<string, number>
  plannedByBucket: Record<string, number>
  doneBlocks: number
  plannedBlocks: number
  habits: { habit: Habit; target: number; done: number; streak: number }[]
  bestStreak: number
}

/** offset 0 = the 14 days ending today; -1 = the previous fortnight, etc.
 *  Grouped by Bucket lane and gated by each bucket's `counted` flag (#17). */
export function fortnightReport(
  blocksByDow: Block[][],
  blockLogs: LogMap,
  habits: Habit[],
  habitLogs: LogMap,
  today: Date,
  offset: number,
  buckets: BucketCounted[],
): FortnightReport {
  const endOff = offset * 14
  const startOff = endOff - 13
  const accompByBucket: Record<string, number> = {}
  const plannedByBucket: Record<string, number> = {}
  let doneBlocks = 0
  let plannedBlocks = 0

  for (let off = startOff; off <= endOff; off++) {
    const d = addDays(today, off)
    const log = blockLogs[isoDate(d)] ?? {}
    for (const b of blocksByDow[dowMon(d)] ?? []) {
      if (!b.bucketId || !isCounted(b, buckets)) continue
      plannedByBucket[b.bucketId] = (plannedByBucket[b.bucketId] ?? 0) + b.durMin
      plannedBlocks++
      if (log[b.id]) {
        accompByBucket[b.bucketId] = (accompByBucket[b.bucketId] ?? 0) + b.durMin
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
    accompByBucket,
    plannedByBucket,
    doneBlocks,
    plannedBlocks,
    habits: habitRows,
    bestStreak: habitRows.reduce((x, r) => Math.max(x, r.streak), 0),
  }
}

// ---------- accomplishments (what got done, not hours) ----------

export interface BucketAccomplishment {
  bucketId: string
  cat: Cat // representative stamped cat, for a palette/label fallback
  titles: { title: string; count: number; deep: boolean }[]
  mins: number
  deepSessions: number
}

export interface Accomplishments {
  byBucket: BucketAccomplishment[]
  tasksDone: number
  events: number
  migrated: number
  deepSessions: number
  totalBlocks: number
}

/**
 * What real work was completed in the inclusive [startIso, endIso] window,
 * read log-primary from the Daily Log. Done, block-sourced entries (carrying a
 * frozen duration) are the "blocks" — grouped by **Bucket lane** with their
 * distinct titles (× repeat count); gated by each bucket's `counted` flag, so
 * Unassigned + uncounted (Life) rows are excluded (ADR-0003 #17/#18). Because
 * every row is backfilled to its cat's 1:1 bucket, a past window's bucket-lane
 * totals equal what the cat lanes showed before. Hand-typed done tasks (no
 * frozen duration) are counted separately as `tasksDone`, so ticking a block is
 * never double-counted. This is the accomplishment view — not hours.
 */
export function windowAccomplishments(
  logEntries: LogEntry[],
  startIso: string,
  endIso: string,
  buckets: BucketCounted[],
): Accomplishments {
  const inWin = (iso: string) => iso >= startIso && iso <= endIso
  const bucketMap = new Map<string, BucketAccomplishment>()
  let totalBlocks = 0
  let deepSessions = 0

  for (const r of blockLogRowsFromEntries(logEntries)) {
    if (!inWin(r.dateIso) || !r.bucketId || !isCounted(r, buckets)) continue
    totalBlocks++
    if (r.deep) deepSessions++
    const entry = bucketMap.get(r.bucketId) ?? { bucketId: r.bucketId, cat: r.cat, titles: [], mins: 0, deepSessions: 0 }
    entry.mins += r.durMin
    if (r.deep) entry.deepSessions++
    const t = entry.titles.find((x) => x.title === r.title)
    if (t) {
      t.count++
      t.deep = t.deep || r.deep
    } else {
      entry.titles.push({ title: r.title, count: 1, deep: r.deep })
    }
    bucketMap.set(r.bucketId, entry)
  }

  const byBucket = [...bucketMap.values()].sort((a, b) => b.mins - a.mins)
  for (const c of byBucket) c.titles.sort((a, b) => Number(b.deep) - Number(a.deep) || b.count - a.count)

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

  return { byBucket, tasksDone, events, migrated, deepSessions, totalBlocks }
}
