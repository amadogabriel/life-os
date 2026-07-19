// All data access lives here — UI components never touch supabase directly.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import type {
  Block,
  BlockLogRow,
  BoardMove,
  Cat,
  Day,
  Habit,
  LogEntry,
  LogKind,
  LogMap,
  LogSignifier,
  LogState,
  Project,
  ProjectStatus,
  Sprint,
  SprintStatus,
  Trace,
} from '../planner'
import {
  applyBoardMove,
  blockLogRowsFromEntries,
  doneBlockMap,
  dowOfIso,
  entryHabitMirror,
  forkCopies,
  isoDate,
  manilaDate,
  newLogEntry,
  reorderWithinSlots,
  scheduleSlot,
} from '../planner'
import {
  DEFAULT_NOTES,
  DEFAULT_WAKE_MIN,
  defaultBuckets,
  defaultDays,
  defaultDesignItems,
  defaultHabits,
} from '../defaults'

// Traces (#20/#21) — independent, coexisting links to a Habit and/or a Project
// (optionally narrowed to a Sprint), composed in via `extends Trace`. Null
// everywhere = a vague task.
export interface BucketTask extends Trace {
  id: string
  name: string
  position: number
  deep: boolean
}

export interface Bucket {
  id: string
  name: string
  cat: Cat
  position: number
  color: string // '' = default palette color for the cat
  counted: boolean // whether this bucket's hours hit the scoreboard (ADR-0003 #17)
  tasks: BucketTask[]
}

export interface Todo {
  id: string
  text: string
  done: boolean
  position: number
}

export interface DumpItem {
  id: string
  text: string
  createdAt: string
}

export interface DesignItem {
  id: string
  position: number
  name: string
  cat: Cat
  mins: number
}

export interface PlannerData {
  days: Day[] // index = dow (0 = Monday)
  blocksByDow: Block[][] // index = dow, sorted by position — Template blocks only (on_date null)
  /** Day Plans (whole-day forks): ISO date → that date's dated Blocks, sorted
   *  by position. Key presence = the date is forked (an explicit forked_days
   *  marker); an empty array is an intentionally-emptied fork, not "no fork". */
  dayForks: Record<string, Block[]>
  blockLogs: LogMap // derived from log entries: on_date -> done block ids
  blockLogRows: BlockLogRow[] // derived: done block-sourced entries as frozen snapshots
  logEntries: LogEntry[] // the log-primary record, sorted by (on_date, position)
  projects: Project[]
  sprints: Sprint[]
  habits: Habit[]
  habitLogs: LogMap
  buckets: Bucket[]
  designItems: DesignItem[]
  todos: Todo[]
  dumps: DumpItem[]
  notes: string
  designWakeMin: number
}

export const plannerKey = ['planner'] as const

/** First-seed heuristic: study blocks and self-described deep blocks are deep. */
export function isDeepDefault(cat: Cat, title: string): boolean {
  return cat === 'math' || cat === 'thesis' || /deep/i.test(title)
}

function toLogMap(rows: { done_on: string }[], idKey: 'block_id' | 'habit_id'): LogMap {
  const map: LogMap = {}
  for (const r of rows as unknown as Record<string, string>[]) {
    ;(map[r.done_on] ??= {})[r[idKey]] = true
  }
  return map
}

async function seedDefaults(userId: string): Promise<void> {
  const days = defaultDays()
  const { error: dayErr } = await supabase
    .from('days')
    .insert(days.map((d, dow) => ({ user_id: userId, dow, name: d.name, loc: d.loc })))
  if (dayErr) throw dayErr

  const blockRows = days.flatMap((d, dow) =>
    d.blocks.map((b, position) => ({
      user_id: userId,
      dow,
      position,
      cat: b.cat,
      title: b.title,
      detail: b.detail,
      start_min: b.startMin,
      dur_min: b.durMin,
      anchored: b.anchored,
      deep: isDeepDefault(b.cat, b.title),
    })),
  )
  const { error: blkErr } = await supabase.from('blocks').insert(blockRows)
  if (blkErr) throw blkErr

  const { error: habErr } = await supabase
    .from('habits')
    .insert(defaultHabits.map((h, position) => ({ user_id: userId, ...h, position })))
  if (habErr) throw habErr

  for (const [position, bk] of defaultBuckets.entries()) {
    const { data: bucket, error } = await supabase
      .from('buckets')
      // Life-type buckets are recovery housekeeping — uncounted (ADR-0003 #17),
      // so they leave the scoreboard and never materialize (mirrors 0016).
      .insert({ user_id: userId, name: bk.name, cat: bk.cat, position, counted: bk.cat !== 'life' })
      .select('id')
      .single()
    if (error) throw error
    const { error: taskErr } = await supabase
      .from('bucket_tasks')
      .insert(
        bk.tasks.map((name, i) => ({
          user_id: userId,
          bucket_id: bucket.id,
          name,
          deep: isDeepDefault(bk.cat, name),
          position: i,
        })),
      )
    if (taskErr) throw taskErr
  }

  const { error: designErr } = await supabase
    .from('design_items')
    .insert(defaultDesignItems.map((it, position) => ({ user_id: userId, position, ...it })))
  if (designErr) throw designErr

  const { error: profErr } = await supabase
    .from('profiles')
    .insert({ user_id: userId, notes: DEFAULT_NOTES, design_wake_min: DEFAULT_WAKE_MIN })
  if (profErr) throw profErr
}

async function fetchPlanner(userId: string): Promise<PlannerData> {
  const [days, blocks, forkedDays, habits, habitLogs, buckets, bucketTasks, designItems, todos, dumps, logEntries, projects, sprints, profile] =
    await Promise.all([
      supabase.from('days').select('*').order('dow'),
      supabase.from('blocks').select('*').order('dow').order('position'),
      supabase.from('forked_days').select('*').order('on_date'),
      supabase.from('habits').select('*').order('position'),
      supabase.from('habit_logs').select('*'),
      supabase.from('buckets').select('*').order('position'),
      supabase.from('bucket_tasks').select('*').order('position'),
      supabase.from('design_items').select('*').order('position'),
      supabase.from('todos').select('*').order('position'),
      supabase.from('dump_items').select('*').order('created_at'),
      supabase.from('log_entries').select('*').order('on_date').order('position'),
      supabase.from('projects').select('*').order('position'),
      supabase.from('sprints').select('*').order('position'),
      supabase.from('profiles').select('*').maybeSingle(),
    ])
  const results = [days, blocks, forkedDays, habits, habitLogs, buckets, bucketTasks, designItems, todos, dumps, logEntries, projects, sprints, profile]
  for (const r of results) if (r.error) throw r.error

  if (!days.data || days.data.length === 0) {
    // First run on a fresh account: seed the default week, then refetch.
    await seedDefaults(userId)
    return fetchPlanner(userId)
  }

  // Template blocks (on_date null) fill the weekday grid; dated blocks belong
  // to their date's Day Plan (fork). The forked_days markers seed the map, so
  // a forked day whose blocks were all deleted still shows up (as an
  // intentionally-empty fork), never falling back to the Template.
  const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
  const dayForks: Record<string, Block[]> = {}
  for (const f of forkedDays.data!) dayForks[f.on_date] = []
  for (const b of blocks.data!) {
    const block: Block = {
      id: b.id,
      dow: b.dow,
      position: b.position,
      bucketId: b.bucket_id ?? null,
      cat: b.cat as Cat,
      title: b.title,
      detail: b.detail,
      startMin: b.start_min,
      durMin: b.dur_min,
      anchored: b.anchored,
      deep: b.deep ?? false,
      container: b.container ?? false,
      habitId: b.habit_id ?? null,
      projectId: b.project_id ?? null,
      sprintId: b.sprint_id ?? null,
    }
    if (b.on_date) (dayForks[b.on_date] ??= []).push(block)
    else blocksByDow[b.dow].push(block)
  }
  for (const list of Object.values(dayForks)) list.sort((a, b) => a.position - b.position)

  const taskByBucket = new Map<string, BucketTask[]>()
  for (const t of bucketTasks.data!) {
    const list = taskByBucket.get(t.bucket_id) ?? []
    list.push({
      id: t.id,
      name: t.name,
      position: t.position,
      deep: t.deep ?? false,
      habitId: t.habit_id ?? null,
      projectId: t.project_id ?? null,
      sprintId: t.sprint_id ?? null,
    })
    taskByBucket.set(t.bucket_id, list)
  }

  const entries: LogEntry[] = logEntries.data!.map((e) => ({
    id: e.id,
    onDate: e.on_date,
    kind: e.kind as LogKind,
    state: e.state as LogState,
    signifier: e.signifier as LogSignifier,
    text: e.text,
    bucketId: e.bucket_id ?? null,
    cat: e.cat as Cat,
    blockId: e.block_id,
    migratedTo: e.migrated_to,
    habitId: e.habit_id ?? null,
    projectId: e.project_id,
    sprintId: e.sprint_id,
    position: e.position,
    boardPosition: e.board_position,
    durMin: e.dur_min,
    deep: e.deep,
    startMin: e.start_min,
    anchored: e.anchored,
  }))

  return {
    days: days.data.map((d) => ({ dow: d.dow, name: d.name, loc: d.loc })),
    blocksByDow,
    dayForks,
    // Log-primary: block state lives in the Daily Log, not the retired block_logs.
    blockLogs: doneBlockMap(entries),
    blockLogRows: blockLogRowsFromEntries(entries),
    logEntries: entries,
    projects: projects.data!.map((p) => ({
      id: p.id,
      name: p.name,
      goal: p.goal,
      status: p.status as ProjectStatus,
      position: p.position,
    })),
    sprints: sprints.data!.map((s) => ({
      id: s.id,
      projectId: s.project_id,
      name: s.name,
      goal: s.goal,
      status: s.status as SprintStatus,
      startDate: s.start_date,
      endDate: s.end_date,
      position: s.position,
    })),
    habits: habits.data!.map((h) => ({
      id: h.id,
      name: h.name,
      bucketId: h.bucket_id ?? null,
      cat: h.cat as Cat,
      days: h.days,
      position: h.position,
    })),
    habitLogs: toLogMap(habitLogs.data!, 'habit_id'),
    buckets: buckets.data!.map((bk) => ({
      id: bk.id,
      name: bk.name,
      cat: bk.cat as Cat,
      position: bk.position,
      color: bk.color ?? '',
      counted: bk.counted ?? true,
      tasks: taskByBucket.get(bk.id) ?? [],
    })),
    designItems: designItems.data!.map((it) => ({
      id: it.id,
      position: it.position,
      name: it.name,
      cat: it.cat as Cat,
      mins: it.mins,
    })),
    todos: todos.data!.map((t) => ({ id: t.id, text: t.text, done: t.done, position: t.position })),
    dumps: dumps.data!.map((d) => ({ id: d.id, text: d.text, createdAt: d.created_at })),
    notes: profile.data?.notes ?? '',
    designWakeMin: profile.data?.design_wake_min ?? DEFAULT_WAKE_MIN,
  }
}

export function usePlanner(userId: string) {
  return useQuery({
    queryKey: plannerKey,
    queryFn: () => fetchPlanner(userId),
    staleTime: 15_000,
    // refetchOnWindowFocus (TanStack default) replaces the old
    // visibilitychange + full-page-reload hack.
  })
}

/** The write API every backend (cloud or local demo) implements. */
export interface PlannerActions {
  toggleBlockLog(blockId: string, dateIso: string): Promise<void>
  toggleHabitLog(habitId: string, dateIso: string): Promise<void>
  /** Freeze `dateIso`'s planned Blocks into the Daily Log as open task entries
   *  (idempotent, add-only). Serves both the "pull today's plan again" action
   *  and the on-open catch-up. Returns the number of newly-frozen entries. */
  materializeDay(dateIso: string): Promise<number>
  addBlock(dow: number, position: number): Promise<string>
  /** Works on Template AND Day Plan (fork) Blocks — both live in `blocks`,
   *  addressed by id. Placing/creating records the source Bucket in `bucketId`;
   *  the block editor writes `bucketId` and stamps `cat` from the chosen bucket
   *  (ADR-0003). */
  updateBlock(
    id: string,
    fields: Partial<
      Pick<
        Block,
        'bucketId' | 'cat' | 'title' | 'detail' | 'startMin' | 'durMin' | 'anchored' | 'deep' | 'habitId' | 'projectId' | 'sprintId'
      >
    >,
  ): Promise<void>
  /** Works on Template AND Day Plan (fork) Blocks. */
  deleteBlock(id: string): Promise<void>
  /** Works on Template AND Day Plan (fork) Blocks (both must share a day). */
  swapBlocks(a: Block, b: Block): Promise<void>
  reorderBlocks(dow: number, orderedIds: string[]): Promise<void>
  /** Fork `dateIso` into its own Day Plan: copy the weekday Template's Blocks
   *  into dated Blocks and record the forked-day marker; the date stops
   *  following the Template entirely. Returns source Template Block id → its
   *  fork copy's id (so an in-flight edit can retarget the fork). No-op
   *  (empty map) when the date is already forked. */
  forkDay(dateIso: string): Promise<Record<string, string>>
  /** Discard `dateIso`'s Day Plan — dated Blocks and marker — returning the
   *  date to the Template projection. */
  unforkDay(dateIso: string): Promise<void>
  /** Append a new Block to `dateIso`'s Day Plan (fork) — mirror of addBlock. */
  addForkBlock(dateIso: string, position: number): Promise<string>
  /** Re-number a fork's Blocks to the given id order — mirror of reorderBlocks. */
  reorderForkBlocks(dateIso: string, orderedIds: string[]): Promise<void>
  /** Move a block to another day; `orderedTargetIds` is the target day's id
   *  order including the moved block. */
  moveBlock(id: string, toDow: number, orderedTargetIds: string[]): Promise<void>
  /** Picks a Bucket; `cat` is stamped from it as derived plumbing (ADR-0003).
   *  Null bucket → Unassigned. */
  saveHabit(
    habit: { id?: string; name: string; bucketId: string | null; cat: Cat; days: number[] },
    position: number,
  ): Promise<void>
  deleteHabit(id: string): Promise<void>
  saveBucket(
    bucket: {
      id?: string
      name: string
      cat: Cat
      tasks: { name: string; deep: boolean; habitId?: string | null; projectId?: string | null; sprintId?: string | null }[]
      color: string
      counted: boolean
    },
    position: number,
  ): Promise<void>
  deleteBucket(id: string): Promise<void>
  addTodo(text: string): Promise<void>
  toggleTodo(id: string, done: boolean): Promise<void>
  deleteTodo(id: string): Promise<void>
  addDump(text: string): Promise<void>
  deleteDump(id: string): Promise<void>
  /** Returns the new entry's id (e.g. to immediately open its edit modal). */
  addLogEntry(entry: {
    onDate: string
    kind: LogKind
    text: string
    // The Bucket the entry belongs to (rapid-log picker). `cat` is derived from
    // it on write (ADR-0003); pass `cat` directly only when there's no bucket.
    bucketId?: string | null
    cat?: Cat
    signifier?: LogSignifier
    // A habit-traced chip placed via the Today editor carries its habit here so
    // checking the entry off logs the habit (#24) — block-less entries only.
    habitId?: string | null
    projectId?: string | null
    sprintId?: string | null
    durMin?: number | null
    startMin?: number | null
    anchored?: boolean
  }): Promise<string>
  updateLogEntry(
    id: string,
    fields: Partial<
      Pick<
        LogEntry,
        | 'text'
        | 'kind'
        | 'state'
        | 'signifier'
        | 'bucketId'
        | 'cat'
        | 'onDate'
        | 'position'
        | 'migratedTo'
        | 'habitId'
        | 'projectId'
        | 'sprintId'
        | 'durMin'
        | 'startMin'
        | 'anchored'
        | 'boardPosition'
      >
    >,
  ): Promise<void>
  deleteLogEntry(id: string): Promise<void>
  /** Carry an open entry to `toDate`: create a fresh open copy there and mark
   *  the original migrated (or scheduled, when moving to a future day). */
  migrateLogEntry(id: string, toDate: string, asScheduled?: boolean): Promise<void>
  /** Re-number a day's on-timeline Log Entries to match the given id order
   *  (drag reorder on the "Today's plan" timeline). */
  reorderLogEntries(dateIso: string, orderedIds: string[]): Promise<void>
  /** A Board drag (#26): move card `move.id` between/within Inbox, `projectId`'s
   *  Backlog, or one of its Sprints, via `applyBoardMove`. Covers cross-column
   *  moves (project/sprint assignment, note->task promotion) and in-column
   *  reorders (Board-position renumbering) with the same call. */
  moveBoardEntry(projectId: string, move: BoardMove): Promise<void>
  addProject(name: string): Promise<string>
  updateProject(id: string, fields: Partial<Pick<Project, 'name' | 'goal' | 'status'>>): Promise<void>
  deleteProject(id: string): Promise<void>
  addSprint(projectId: string, name: string): Promise<string>
  updateSprint(
    id: string,
    fields: Partial<Pick<Sprint, 'name' | 'goal' | 'status' | 'startDate' | 'endDate'>>,
  ): Promise<void>
  deleteSprint(id: string): Promise<void>
  /** Dated one-off (#13): put an open task onto `dateIso`'s plan. Sets the
   *  entry's `on_date`, an unanchored `start_min` chained after that day's
   *  last planned item (`nextOneOffStart`), and a position at the end of the
   *  day's log. The day itself is never forked — the one-off rides on top of
   *  its projection (or, for today, joins the live timeline). */
  scheduleEntryToDate(entryId: string, dateIso: string): Promise<void>
  /** Undo a dated one-off: clear `start_min` (and its anchor) so the task
   *  leaves its day's plan and returns to the Sprint work card. */
  unscheduleEntry(entryId: string): Promise<void>
  addDesignItem(item: { name: string; cat: Cat }, position: number): Promise<string>
  updateDesignItem(id: string, fields: { mins?: number; position?: number }): Promise<void>
  swapDesignItems(a: DesignItem, b: DesignItem): Promise<void>
  reorderDesignItems(orderedIds: string[]): Promise<void>
  deleteDesignItem(id: string): Promise<void>
  resetDesign(): Promise<void>
  setWake(min: number): Promise<void>
  setNotes(notes: string): Promise<void>
  applyDesignToDay(dow: number, items: DesignItem[], wakeMin: number): Promise<void>
}

/** Imperative write API. Every action persists row-level changes, then
 *  invalidates the planner query; toggles patch the cache optimistically. */
export function usePlannerActions(userId: string): PlannerActions {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: plannerKey })
  const patch = (fn: (data: PlannerData) => PlannerData) =>
    qc.setQueryData<PlannerData>(plannerKey, (data) => (data ? fn(data) : data))

  /** Optimistically flip an id in the given log map; returns true if it turned on. */
  const patchLog = (mapKey: 'blockLogs' | 'habitLogs', id: string, dateIso: string) => {
    let turningOn = false
    patch((data) => {
      const logs = { ...data[mapKey] }
      const day = { ...(logs[dateIso] ?? {}) }
      if (day[id]) delete day[id]
      else {
        day[id] = true
        turningOn = true
      }
      logs[dateIso] = day
      return { ...data, [mapKey]: logs }
    })
    return turningOn
  }

  return {
    async toggleBlockLog(blockId: string, dateIso: string) {
      // Log-primary: checking a Block flips its Daily Log entry open<->done; it
      // no longer writes a parallel block_logs row.
      const cache = qc.getQueryData<PlannerData>(plannerKey)
      const existing = cache?.logEntries.find((e) => e.blockId === blockId && e.onDate === dateIso)
      const blk = cache?.blocksByDow.flat().find((b) => b.id === blockId)
      const on = existing?.state !== 'done' // clicking a not-done entry marks it done
      const nowIso = new Date().toISOString()
      const position = (cache?.logEntries ?? [])
        .filter((e) => e.onDate === dateIso)
        .reduce((m, e) => Math.max(m, e.position + 1), 0)

      // Optimistic: flip (or insert) the entry, then re-derive the checked map.
      patch((data) => {
        const logEntries = existing
          ? data.logEntries.map((e) =>
              e.id === existing.id ? { ...e, state: (on ? 'done' : 'open') as LogState } : e,
            )
          : [
              ...data.logEntries,
              newLogEntry({
                id: `optimistic-${blockId}-${dateIso}`,
                onDate: dateIso,
                state: 'done',
                text: blk?.title ?? '',
                bucketId: blk?.bucketId ?? null,
                cat: blk?.cat ?? 'open',
                blockId,
                position,
                durMin: blk?.durMin ?? null,
                deep: blk?.deep ?? false,
                startMin: blk?.startMin ?? null,
                anchored: blk?.anchored ?? false,
              }),
            ]
        return { ...data, logEntries, blockLogs: doneBlockMap(logEntries) }
      })

      let error
      if (existing) {
        error = (
          await supabase
            .from('log_entries')
            .update({ state: on ? 'done' : 'open', updated_at: nowIso })
            .eq('id', existing.id)
        ).error
      } else {
        // Edge: this block's day wasn't frozen yet (e.g. checked before the
        // freeze reached it). Freeze just this block's entry as done — never
        // touching siblings. start_min is a best-effort copy of the block's
        // own value (not a full resolve()-computed layout); materialize_day
        // is the source of truth for that.
        error = (
          await supabase.from('log_entries').insert({
            user_id: userId,
            on_date: dateIso,
            kind: 'task',
            state: 'done',
            text: blk?.title ?? '',
            bucket_id: blk?.bucketId ?? null,
            cat: blk?.cat ?? 'open',
            block_id: blockId,
            dur_min: blk?.durMin ?? null,
            deep: blk?.deep ?? false,
            start_min: blk?.startMin ?? null,
            anchored: blk?.anchored ?? false,
            position,
          })
        ).error
      }
      if (error) {
        invalidate()
        return
      }

      // Mirror a linked habit: checking the block logs the habit for the day,
      // un-checking removes it (only when the habit isn't already in that state).
      if (blk?.habitId) {
        const habitOn = !!qc.getQueryData<PlannerData>(plannerKey)?.habitLogs[dateIso]?.[blk.habitId]
        if (on !== habitOn) {
          patchLog('habitLogs', blk.habitId, dateIso)
          const { error: hErr } = on
            ? await supabase.from('habit_logs').upsert({ user_id: userId, habit_id: blk.habitId, done_on: dateIso })
            : await supabase.from('habit_logs').delete().eq('habit_id', blk.habitId).eq('done_on', dateIso)
          if (hErr) invalidate()
        }
      }

      // Inserted a fresh entry above with a placeholder id — reconcile to get
      // the real row (and refreshed report snapshots).
      if (!existing) await invalidate()
    },

    async materializeDay(dateIso: string) {
      const { data, error } = await supabase.rpc('materialize_day', { uid: userId, d: dateIso })
      if (error) throw error
      await invalidate()
      return data ?? 0
    },
    async toggleHabitLog(habitId: string, dateIso: string) {
      const on = patchLog('habitLogs', habitId, dateIso)
      const { error } = on
        ? await supabase.from('habit_logs').upsert({ user_id: userId, habit_id: habitId, done_on: dateIso })
        : await supabase.from('habit_logs').delete().eq('habit_id', habitId).eq('done_on', dateIso)
      if (error) invalidate()
    },

    async addBlock(dow: number, position: number) {
      const { data, error } = await supabase
        .from('blocks')
        .insert({
          user_id: userId,
          dow,
          position,
          cat: 'open',
          title: 'New block — assign',
          detail: '',
          start_min: 720,
          dur_min: 30,
          anchored: false,
        })
        .select('id')
        .single()
      if (error) throw error
      await invalidate()
      return data.id
    },

    async updateBlock(id: string, fields: Partial<Pick<Block, 'bucketId' | 'cat' | 'title' | 'detail' | 'startMin' | 'durMin' | 'anchored' | 'deep' | 'habitId' | 'projectId' | 'sprintId'>>) {
      // Optimistic: rapid ± duration taps must see each other's result. The id
      // may name a Template block or a Day Plan (fork) block — same table.
      patch((data) => ({
        ...data,
        blocksByDow: data.blocksByDow.map((bs) => bs.map((b) => (b.id === id ? { ...b, ...fields } : b))),
        dayForks: Object.fromEntries(
          Object.entries(data.dayForks).map(([date, bs]) => [date, bs.map((b) => (b.id === id ? { ...b, ...fields } : b))]),
        ),
      }))
      const { error } = await supabase
        .from('blocks')
        .update({
          ...(fields.bucketId !== undefined && { bucket_id: fields.bucketId }),
          ...(fields.cat !== undefined && { cat: fields.cat }),
          ...(fields.title !== undefined && { title: fields.title }),
          ...(fields.detail !== undefined && { detail: fields.detail }),
          ...(fields.startMin !== undefined && { start_min: fields.startMin }),
          ...(fields.durMin !== undefined && { dur_min: fields.durMin }),
          ...(fields.anchored !== undefined && { anchored: fields.anchored }),
          ...(fields.deep !== undefined && { deep: fields.deep }),
          ...(fields.habitId !== undefined && { habit_id: fields.habitId }),
          ...(fields.projectId !== undefined && { project_id: fields.projectId }),
          ...(fields.sprintId !== undefined && { sprint_id: fields.sprintId }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) throw error
      await invalidate()
    },

    async deleteBlock(id: string) {
      const { error } = await supabase.from('blocks').delete().eq('id', id)
      if (error) throw error
      await invalidate()
    },

    /** Swap the positions of two adjacent blocks in the same day. */
    async swapBlocks(a: Block, b: Block) {
      const r1 = await supabase.from('blocks').update({ position: b.position }).eq('id', a.id)
      const r2 = await supabase.from('blocks').update({ position: a.position }).eq('id', b.id)
      if (r1.error || r2.error) throw r1.error ?? r2.error
      await invalidate()
    },

    async moveBlock(id: string, toDow: number, orderedTargetIds: string[]) {
      patch((data) => {
        let moved: Block | undefined
        const stripped = data.blocksByDow.map((bs) => {
          const hit = bs.find((b) => b.id === id)
          if (hit) moved = hit
          return bs.filter((b) => b.id !== id)
        })
        if (!moved) return data
        const target = [...stripped[toDow]]
        target.splice(Math.max(0, orderedTargetIds.indexOf(id)), 0, { ...moved, dow: toDow })
        return {
          ...data,
          blocksByDow: stripped.map((bs, d) =>
            (d === toDow ? target : bs).map((b, position) => ({ ...b, position })),
          ),
        }
      })
      const r = await supabase.from('blocks').update({ dow: toDow }).eq('id', id)
      const results = await Promise.all(
        orderedTargetIds.map((bid, position) => supabase.from('blocks').update({ position }).eq('id', bid)),
      )
      const failed = r.error ?? results.find((x) => x.error)?.error
      if (failed) {
        invalidate()
        throw failed
      }
      await invalidate()
    },

    /** Re-number a day's blocks to match the given id order (drag reorder). */
    async reorderBlocks(dow: number, orderedIds: string[]) {
      patch((data) => {
        const blocks = [...data.blocksByDow[dow]]
          .sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
          .map((b, position) => ({ ...b, position }))
        return { ...data, blocksByDow: data.blocksByDow.map((bs, i) => (i === dow ? blocks : bs)) }
      })
      const results = await Promise.all(
        orderedIds.map((id, position) => supabase.from('blocks').update({ position }).eq('id', id)),
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        invalidate()
        throw failed.error
      }
      await invalidate()
    },

    /** Copy the weekday Template into dated Blocks + write the forked-day
     *  marker. Marker first: if the copies then fail, the date is a blank fork
     *  (visible, recoverable via unfork) rather than orphaned dated rows. */
    async forkDay(dateIso: string) {
      const cache = qc.getQueryData<PlannerData>(plannerKey)
      if (cache?.dayForks[dateIso]) return {}
      const src = cache?.blocksByDow[dowOfIso(dateIso)] ?? []
      // Client-side ids give us the Template→fork id map without a read-back.
      const { copies, idMap } = forkCopies(src, () => crypto.randomUUID())
      patch((data) => ({ ...data, dayForks: { ...data.dayForks, [dateIso]: copies } }))
      const m = await supabase.from('forked_days').insert({ user_id: userId, on_date: dateIso })
      if (m.error) {
        invalidate()
        throw m.error
      }
      if (copies.length) {
        const r = await supabase.from('blocks').insert(
          copies.map((b) => ({
            id: b.id,
            user_id: userId,
            dow: b.dow,
            on_date: dateIso,
            position: b.position,
            // Carry the source Template block's Bucket reference into its fork
            // copy, so a forked block keeps resolving its bucket color (#16).
            bucket_id: b.bucketId,
            cat: b.cat,
            title: b.title,
            detail: b.detail,
            start_min: b.startMin,
            dur_min: b.durMin,
            anchored: b.anchored,
            deep: b.deep,
            container: b.container,
            habit_id: b.habitId,
            project_id: b.projectId,
            sprint_id: b.sprintId,
          })),
        )
        if (r.error) {
          invalidate()
          throw r.error
        }
      }
      await invalidate()
      return idMap
    },

    async unforkDay(dateIso: string) {
      patch((data) => {
        const dayForks = { ...data.dayForks }
        delete dayForks[dateIso]
        return { ...data, dayForks }
      })
      const r1 = await supabase.from('blocks').delete().eq('user_id', userId).eq('on_date', dateIso)
      const r2 = await supabase.from('forked_days').delete().eq('user_id', userId).eq('on_date', dateIso)
      if (r1.error || r2.error) {
        invalidate()
        throw r1.error ?? r2.error
      }
      await invalidate()
    },

    async addForkBlock(dateIso: string, position: number) {
      const { data, error } = await supabase
        .from('blocks')
        .insert({
          user_id: userId,
          dow: dowOfIso(dateIso),
          on_date: dateIso,
          position,
          cat: 'open',
          title: 'New block — assign',
          detail: '',
          start_min: 720,
          dur_min: 30,
          anchored: false,
        })
        .select('id')
        .single()
      if (error) throw error
      await invalidate()
      return data.id
    },

    /** Re-number a fork's blocks to match the given id order (drag reorder). */
    async reorderForkBlocks(dateIso: string, orderedIds: string[]) {
      patch((data) => {
        const blocks = [...(data.dayForks[dateIso] ?? [])]
          .sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
          .map((b, position) => ({ ...b, position }))
        return { ...data, dayForks: { ...data.dayForks, [dateIso]: blocks } }
      })
      const results = await Promise.all(
        orderedIds.map((id, position) => supabase.from('blocks').update({ position }).eq('id', id)),
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        invalidate()
        throw failed.error
      }
      await invalidate()
    },

    async saveHabit(
      habit: { id?: string; name: string; bucketId: string | null; cat: Cat; days: number[] },
      position: number,
    ) {
      // The Bucket is authoritative; `cat` is stamped from it (ADR-0003, #19).
      const row = { user_id: userId, name: habit.name, bucket_id: habit.bucketId, cat: habit.cat, days: habit.days }
      const { error } = habit.id
        ? await supabase.from('habits').update(row).eq('id', habit.id)
        : await supabase.from('habits').insert({ ...row, position })
      if (error) throw error
      await invalidate()
    },

    async deleteHabit(id: string) {
      const { error } = await supabase.from('habits').delete().eq('id', id)
      if (error) throw error
      await invalidate()
    },

    async saveBucket(
      bucket: {
        id?: string
        name: string
        cat: Cat
        tasks: { name: string; deep: boolean; habitId?: string | null; projectId?: string | null; sprintId?: string | null }[]
        color: string
        counted: boolean
      },
      position: number,
    ) {
      let bucketId = bucket.id
      if (bucketId) {
        const { error } = await supabase
          .from('buckets')
          .update({ name: bucket.name, cat: bucket.cat, color: bucket.color, counted: bucket.counted })
          .eq('id', bucketId)
        if (error) throw error
        const { error: delErr } = await supabase.from('bucket_tasks').delete().eq('bucket_id', bucketId)
        if (delErr) throw delErr
      } else {
        const { data, error } = await supabase
          .from('buckets')
          .insert({
            user_id: userId,
            name: bucket.name,
            cat: bucket.cat,
            position,
            color: bucket.color,
            counted: bucket.counted,
          })
          .select('id')
          .single()
        if (error) throw error
        bucketId = data.id
      }
      if (bucket.tasks.length) {
        const { error } = await supabase
          .from('bucket_tasks')
          .insert(
            bucket.tasks.map((t, i) => ({
              user_id: userId,
              bucket_id: bucketId!,
              name: t.name,
              deep: t.deep,
              position: i,
              habit_id: t.habitId ?? null,
              project_id: t.projectId ?? null,
              sprint_id: t.sprintId ?? null,
            })),
          )
        if (error) throw error
      }
      await invalidate()
    },

    async deleteBucket(id: string) {
      // The blocks.bucket_id and habits.bucket_id FKs are ON DELETE SET NULL:
      // the DB set-nulls every block AND habit placed from this bucket, so they
      // revert to the fallback palette but stay functional. The refetch below
      // pulls those set-null rows back into the cache.
      const { error } = await supabase.from('buckets').delete().eq('id', id)
      if (error) throw error
      await invalidate()
    },

    async addTodo(text: string) {
      const { error } = await supabase.from('todos').insert({ user_id: userId, text, position: Date.now() })
      if (error) throw error
      await invalidate()
    },

    async toggleTodo(id: string, done: boolean) {
      patch((data) => ({ ...data, todos: data.todos.map((t) => (t.id === id ? { ...t, done } : t)) }))
      const { error } = await supabase.from('todos').update({ done }).eq('id', id)
      if (error) invalidate()
    },

    async deleteTodo(id: string) {
      patch((data) => ({ ...data, todos: data.todos.filter((t) => t.id !== id) }))
      const { error } = await supabase.from('todos').delete().eq('id', id)
      if (error) invalidate()
    },

    async addDump(text: string) {
      const { error } = await supabase.from('dump_items').insert({ user_id: userId, text })
      if (error) throw error
      await invalidate()
    },

    async deleteDump(id: string) {
      patch((data) => ({ ...data, dumps: data.dumps.filter((d) => d.id !== id) }))
      const { error } = await supabase.from('dump_items').delete().eq('id', id)
      if (error) invalidate()
    },

    async addLogEntry(entry) {
      const cache = qc.getQueryData<PlannerData>(plannerKey)
      // Append after the last entry already on that day.
      const onDay = (cache?.logEntries ?? []).filter((e) => e.onDate === entry.onDate)
      const position = onDay.reduce((m, e) => Math.max(m, e.position + 1), 0)
      // Append to the end of whichever Board column this entry lands in
      // (#26) — Inbox, a Project's Backlog, or a Sprint.
      const boardColumn = (cache?.logEntries ?? []).filter(
        (e) => e.projectId === (entry.projectId ?? null) && e.sprintId === (entry.sprintId ?? null),
      )
      const boardPosition = boardColumn.reduce((m, e) => Math.max(m, e.boardPosition + 1), 0)
      // Rapid-log picks a Bucket; `cat` is stamped from it (ADR-0003). A null
      // bucket keeps the passed cat (or `open` = Unassigned).
      const bucket = entry.bucketId ? cache?.buckets.find((bk) => bk.id === entry.bucketId) : undefined
      const cat = bucket?.cat ?? entry.cat ?? 'open'
      const { data, error } = await supabase
        .from('log_entries')
        .insert({
          user_id: userId,
          on_date: entry.onDate,
          kind: entry.kind,
          text: entry.text,
          bucket_id: entry.bucketId ?? null,
          cat,
          signifier: entry.signifier ?? '',
          habit_id: entry.habitId ?? null,
          project_id: entry.projectId ?? null,
          sprint_id: entry.sprintId ?? null,
          dur_min: entry.durMin ?? null,
          start_min: entry.startMin ?? null,
          anchored: entry.anchored ?? false,
          position,
          board_position: boardPosition,
        })
        .select('id')
        .single()
      if (error) throw error
      await invalidate()
      return data.id
    },

    async updateLogEntry(id, fields) {
      const entry = qc.getQueryData<PlannerData>(plannerKey)?.logEntries.find((e) => e.id === id)
      patch((data) => ({
        ...data,
        logEntries: data.logEntries.map((e) => (e.id === id ? { ...e, ...fields } : e)),
      }))
      const { error } = await supabase
        .from('log_entries')
        .update({
          ...(fields.text !== undefined && { text: fields.text }),
          ...(fields.kind !== undefined && { kind: fields.kind }),
          ...(fields.state !== undefined && { state: fields.state }),
          ...(fields.signifier !== undefined && { signifier: fields.signifier }),
          ...(fields.bucketId !== undefined && { bucket_id: fields.bucketId }),
          ...(fields.cat !== undefined && { cat: fields.cat }),
          ...(fields.onDate !== undefined && { on_date: fields.onDate }),
          ...(fields.position !== undefined && { position: fields.position }),
          ...(fields.migratedTo !== undefined && { migrated_to: fields.migratedTo }),
          ...(fields.habitId !== undefined && { habit_id: fields.habitId }),
          ...(fields.projectId !== undefined && { project_id: fields.projectId }),
          ...(fields.sprintId !== undefined && { sprint_id: fields.sprintId }),
          ...(fields.durMin !== undefined && { dur_min: fields.durMin }),
          ...(fields.startMin !== undefined && { start_min: fields.startMin }),
          ...(fields.anchored !== undefined && { anchored: fields.anchored }),
          ...(fields.boardPosition !== undefined && { board_position: fields.boardPosition }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) {
        invalidate()
        return
      }

      // Mirror a linked habit when this update flips the entry's state — the
      // entry-based equivalent of toggleBlockLog's block->habit mirror (#24),
      // for a habit-traced chip placed via the Today editor (no Block to hang
      // it on). No-op for untraced or block-linked entries (entryHabitMirror).
      if (entry && fields.state !== undefined) {
        const mirror = entryHabitMirror(entry, fields.state)
        if (mirror) {
          const habitOn = !!qc.getQueryData<PlannerData>(plannerKey)?.habitLogs[entry.onDate]?.[mirror.habitId]
          if (mirror.on !== habitOn) {
            patchLog('habitLogs', mirror.habitId, entry.onDate)
            const { error: hErr } = mirror.on
              ? await supabase.from('habit_logs').upsert({ user_id: userId, habit_id: mirror.habitId, done_on: entry.onDate })
              : await supabase.from('habit_logs').delete().eq('habit_id', mirror.habitId).eq('done_on', entry.onDate)
            if (hErr) invalidate()
          }
        }
      }
    },

    /** Re-number a day's on-timeline entries to match the given id order,
     *  without disturbing that day's other entries (todos/notes share the
     *  same position sequence). */
    async reorderLogEntries(dateIso: string, orderedIds: string[]) {
      let renumbered: { id: string; position: number }[] = []
      patch((data) => {
        const dayEntries = data.logEntries
          .filter((e) => e.onDate === dateIso)
          .sort((a, b) => a.position - b.position)
        const reordered = reorderWithinSlots(dayEntries, orderedIds).map((e, position) => ({ ...e, position }))
        renumbered = reordered.map((e) => ({ id: e.id, position: e.position }))
        const byId = new Map(reordered.map((e) => [e.id, e]))
        return { ...data, logEntries: data.logEntries.map((e) => byId.get(e.id) ?? e) }
      })
      const results = await Promise.all(
        renumbered.map(({ id, position }) => supabase.from('log_entries').update({ position }).eq('id', id)),
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        invalidate()
        throw failed.error
      }
      await invalidate()
    },

    /** A Board drag (#26): move a card between/within Inbox, a Project's
     *  Backlog, or one of its Sprints, via the pure `applyBoardMove`. */
    async moveBoardEntry(projectId: string, move: BoardMove) {
      const cache = qc.getQueryData<PlannerData>(plannerKey)
      if (!cache) return
      const updates = applyBoardMove(cache.logEntries, projectId, move)
      if (updates.length === 0) return
      patch((data) => {
        const byId = new Map(updates.map((u) => [u.id, u]))
        return {
          ...data,
          logEntries: data.logEntries.map((e) => {
            const u = byId.get(e.id)
            return u ? { ...e, ...u.fields } : e
          }),
        }
      })
      const results = await Promise.all(
        updates.map(({ id, fields }) =>
          supabase
            .from('log_entries')
            .update({
              ...(fields.projectId !== undefined && { project_id: fields.projectId }),
              ...(fields.sprintId !== undefined && { sprint_id: fields.sprintId }),
              ...(fields.kind !== undefined && { kind: fields.kind }),
              ...(fields.boardPosition !== undefined && { board_position: fields.boardPosition }),
              updated_at: new Date().toISOString(),
            })
            .eq('id', id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        invalidate()
        throw failed.error
      }
      await invalidate()
    },

    async deleteLogEntry(id) {
      patch((data) => ({ ...data, logEntries: data.logEntries.filter((e) => e.id !== id) }))
      const { error } = await supabase.from('log_entries').delete().eq('id', id)
      if (error) invalidate()
    },

    async migrateLogEntry(id, toDate, asScheduled = false) {
      const all = qc.getQueryData<PlannerData>(plannerKey)?.logEntries ?? []
      const src = all.find((e) => e.id === id)
      if (!src) return
      const position = all.filter((e) => e.onDate === toDate).reduce((m, e) => Math.max(m, e.position + 1), 0)
      const { data, error } = await supabase
        .from('log_entries')
        .insert({
          user_id: userId,
          on_date: toDate,
          kind: src.kind,
          text: src.text,
          bucket_id: src.bucketId,
          cat: src.cat,
          signifier: src.signifier,
          position,
        })
        .select('id')
        .single()
      if (error) throw error
      const { error: uErr } = await supabase
        .from('log_entries')
        .update({ state: asScheduled ? 'scheduled' : 'migrated', migrated_to: data.id, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (uErr) throw uErr
      await invalidate()
    },

    async addProject(name: string) {
      const position = (qc.getQueryData<PlannerData>(plannerKey)?.projects ?? []).reduce((m, p) => Math.max(m, p.position + 1), 0)
      const { data, error } = await supabase.from('projects').insert({ user_id: userId, name, position }).select('id').single()
      if (error) throw error
      await invalidate()
      return data.id
    },
    async updateProject(id, fields) {
      patch((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, ...fields } : p)) }))
      const { error } = await supabase
        .from('projects')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) invalidate()
    },
    async deleteProject(id) {
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
      await invalidate()
    },
    async addSprint(projectId, name) {
      const position = (qc.getQueryData<PlannerData>(plannerKey)?.sprints ?? [])
        .filter((s) => s.projectId === projectId)
        .reduce((m, s) => Math.max(m, s.position + 1), 0)
      const { data, error } = await supabase
        .from('sprints')
        .insert({ user_id: userId, project_id: projectId, name, position })
        .select('id')
        .single()
      if (error) throw error
      await invalidate()
      return data.id
    },
    async updateSprint(id, fields) {
      patch((d) => ({ ...d, sprints: d.sprints.map((s) => (s.id === id ? { ...s, ...fields } : s)) }))
      const { error } = await supabase
        .from('sprints')
        .update({
          ...(fields.name !== undefined && { name: fields.name }),
          ...(fields.goal !== undefined && { goal: fields.goal }),
          ...(fields.status !== undefined && { status: fields.status }),
          ...(fields.startDate !== undefined && { start_date: fields.startDate }),
          ...(fields.endDate !== undefined && { end_date: fields.endDate }),
        })
        .eq('id', id)
      if (error) invalidate()
    },
    async deleteSprint(id) {
      const { error } = await supabase.from('sprints').delete().eq('id', id)
      if (error) throw error
      await invalidate()
    },
    async scheduleEntryToDate(entryId, dateIso) {
      const cache = qc.getQueryData<PlannerData>(plannerKey)
      if (!cache) return
      const todayIso = isoDate(manilaDate(new Date()))
      const { startMin, position } = scheduleSlot(
        { blocksByDow: cache.blocksByDow, logEntries: cache.logEntries, dayForks: cache.dayForks },
        entryId,
        dateIso,
        todayIso,
      )
      const fields = { onDate: dateIso, startMin, anchored: false, position }
      patch((d) => ({ ...d, logEntries: d.logEntries.map((e) => (e.id === entryId ? { ...e, ...fields } : e)) }))
      const { error } = await supabase
        .from('log_entries')
        .update({ on_date: dateIso, start_min: startMin, anchored: false, position, updated_at: new Date().toISOString() })
        .eq('id', entryId)
      if (error) invalidate()
    },
    async unscheduleEntry(entryId) {
      patch((d) => ({
        ...d,
        logEntries: d.logEntries.map((e) => (e.id === entryId ? { ...e, startMin: null, anchored: false } : e)),
      }))
      const { error } = await supabase
        .from('log_entries')
        .update({ start_min: null, anchored: false, updated_at: new Date().toISOString() })
        .eq('id', entryId)
      if (error) invalidate()
    },

    async addDesignItem(item: { name: string; cat: Cat }, position: number) {
      const { data, error } = await supabase
        .from('design_items')
        .insert({ user_id: userId, position, name: item.name, cat: item.cat, mins: 60 })
        .select('id')
        .single()
      if (error) throw error
      await invalidate()
      return data.id
    },

    async updateDesignItem(id: string, fields: { mins?: number; position?: number }) {
      patch((data) => ({
        ...data,
        designItems: data.designItems.map((it) => (it.id === id ? { ...it, ...fields } : it)),
      }))
      const { error } = await supabase.from('design_items').update(fields).eq('id', id)
      if (error) throw error
      await invalidate()
    },

    async swapDesignItems(a: DesignItem, b: DesignItem) {
      const r1 = await supabase.from('design_items').update({ position: b.position }).eq('id', a.id)
      const r2 = await supabase.from('design_items').update({ position: a.position }).eq('id', b.id)
      if (r1.error || r2.error) throw r1.error ?? r2.error
      await invalidate()
    },

    /** Re-number design items to match the given id order (drag reorder). */
    async reorderDesignItems(orderedIds: string[]) {
      patch((data) => ({
        ...data,
        designItems: [...data.designItems]
          .sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
          .map((it, position) => ({ ...it, position })),
      }))
      const results = await Promise.all(
        orderedIds.map((id, position) => supabase.from('design_items').update({ position }).eq('id', id)),
      )
      const failed = results.find((r) => r.error)
      if (failed) {
        invalidate()
        throw failed.error
      }
      await invalidate()
    },

    async deleteDesignItem(id: string) {
      const { error } = await supabase.from('design_items').delete().eq('id', id)
      if (error) throw error
      await invalidate()
    },

    async resetDesign() {
      const { error } = await supabase.from('design_items').delete().eq('user_id', userId)
      if (error) throw error
      const { error: insErr } = await supabase
        .from('design_items')
        .insert(defaultDesignItems.map((it, position) => ({ user_id: userId, position, ...it })))
      if (insErr) throw insErr
      await invalidate()
    },

    async setWake(min: number) {
      patch((data) => ({ ...data, designWakeMin: min }))
      const { error } = await supabase
        .from('profiles')
        .upsert({ user_id: userId, design_wake_min: min })
      if (error) invalidate()
    },

    async setNotes(notes: string) {
      patch((data) => ({ ...data, notes }))
      const { error } = await supabase.from('profiles').upsert({ user_id: userId, notes })
      if (error) invalidate()
    },

    /** Replace a weekday's blocks with the designed day. Old block logs for
     *  that day's blocks go with them (same as the legacy behavior). */
    async applyDesignToDay(dow: number, items: DesignItem[], wakeMin: number) {
      const { error } = await supabase.from('blocks').delete().eq('user_id', userId).eq('dow', dow)
      if (error) throw error
      let cur = wakeMin
      const rows = items.map((it, position) => {
        const row = {
          user_id: userId,
          dow,
          position,
          cat: it.cat,
          title: it.name,
          detail: '',
          start_min: ((cur % 1440) + 1440) % 1440,
          dur_min: it.mins,
          anchored: position === 0,
        }
        cur += it.mins
        return row
      })
      const { error: insErr } = await supabase.from('blocks').insert(rows)
      if (insErr) throw insErr
      await invalidate()
    },
  }
}
