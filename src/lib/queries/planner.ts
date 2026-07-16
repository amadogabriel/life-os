// All data access lives here — UI components never touch supabase directly.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import type {
  Block,
  BlockLogRow,
  Cat,
  Day,
  Habit,
  LogEntry,
  LogKind,
  LogMap,
  LogSignifier,
  LogState,
} from '../planner'
import {
  DEFAULT_NOTES,
  DEFAULT_WAKE_MIN,
  defaultBuckets,
  defaultDays,
  defaultDesignItems,
  defaultHabits,
} from '../defaults'

export interface BucketTask {
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
  blocksByDow: Block[][] // index = dow, sorted by position
  blockLogs: LogMap
  blockLogRows: BlockLogRow[] // frozen snapshots of completed blocks, for the record
  logEntries: LogEntry[] // bullet-journal entries, sorted by (on_date, position)
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
      .insert({ user_id: userId, name: bk.name, cat: bk.cat, position })
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
  const [days, blocks, blockLogs, habits, habitLogs, buckets, bucketTasks, designItems, todos, dumps, logEntries, profile] =
    await Promise.all([
      supabase.from('days').select('*').order('dow'),
      supabase.from('blocks').select('*').order('dow').order('position'),
      supabase.from('block_logs').select('*'),
      supabase.from('habits').select('*').order('position'),
      supabase.from('habit_logs').select('*'),
      supabase.from('buckets').select('*').order('position'),
      supabase.from('bucket_tasks').select('*').order('position'),
      supabase.from('design_items').select('*').order('position'),
      supabase.from('todos').select('*').order('position'),
      supabase.from('dump_items').select('*').order('created_at'),
      supabase.from('log_entries').select('*').order('on_date').order('position'),
      supabase.from('profiles').select('*').maybeSingle(),
    ])
  const results = [days, blocks, blockLogs, habits, habitLogs, buckets, bucketTasks, designItems, todos, dumps, logEntries, profile]
  for (const r of results) if (r.error) throw r.error

  if (!days.data || days.data.length === 0) {
    // First run on a fresh account: seed the default week, then refetch.
    await seedDefaults(userId)
    return fetchPlanner(userId)
  }

  const blocksByDow: Block[][] = Array.from({ length: 7 }, () => [])
  for (const b of blocks.data!) {
    blocksByDow[b.dow].push({
      id: b.id,
      dow: b.dow,
      position: b.position,
      cat: b.cat as Cat,
      title: b.title,
      detail: b.detail,
      startMin: b.start_min,
      durMin: b.dur_min,
      anchored: b.anchored,
      deep: b.deep ?? false,
    })
  }

  const taskByBucket = new Map<string, BucketTask[]>()
  for (const t of bucketTasks.data!) {
    const list = taskByBucket.get(t.bucket_id) ?? []
    list.push({ id: t.id, name: t.name, position: t.position, deep: t.deep ?? false })
    taskByBucket.set(t.bucket_id, list)
  }

  return {
    days: days.data.map((d) => ({ dow: d.dow, name: d.name, loc: d.loc })),
    blocksByDow,
    blockLogs: toLogMap(blockLogs.data!, 'block_id'),
    blockLogRows: blockLogs.data!.map((r) => ({
      blockId: r.block_id,
      dateIso: r.done_on,
      title: r.title,
      cat: r.cat as Cat,
      durMin: r.dur_min,
      deep: r.deep,
    })),
    logEntries: logEntries.data!.map((e) => ({
      id: e.id,
      onDate: e.on_date,
      kind: e.kind as LogKind,
      state: e.state as LogState,
      signifier: e.signifier as LogSignifier,
      text: e.text,
      cat: e.cat as Cat,
      blockId: e.block_id,
      migratedTo: e.migrated_to,
      position: e.position,
    })),
    habits: habits.data!.map((h) => ({
      id: h.id,
      name: h.name,
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
  addBlock(dow: number, position: number): Promise<string>
  updateBlock(
    id: string,
    fields: Partial<Pick<Block, 'cat' | 'title' | 'detail' | 'startMin' | 'durMin' | 'anchored' | 'deep'>>,
  ): Promise<void>
  deleteBlock(id: string): Promise<void>
  swapBlocks(a: Block, b: Block): Promise<void>
  reorderBlocks(dow: number, orderedIds: string[]): Promise<void>
  /** Move a block to another day; `orderedTargetIds` is the target day's id
   *  order including the moved block. */
  moveBlock(id: string, toDow: number, orderedTargetIds: string[]): Promise<void>
  saveHabit(habit: { id?: string; name: string; cat: Cat; days: number[] }, position: number): Promise<void>
  deleteHabit(id: string): Promise<void>
  saveBucket(
    bucket: { id?: string; name: string; cat: Cat; tasks: { name: string; deep: boolean }[]; color: string },
    position: number,
  ): Promise<void>
  deleteBucket(id: string): Promise<void>
  addTodo(text: string): Promise<void>
  toggleTodo(id: string, done: boolean): Promise<void>
  deleteTodo(id: string): Promise<void>
  addDump(text: string): Promise<void>
  deleteDump(id: string): Promise<void>
  addLogEntry(entry: { onDate: string; kind: LogKind; text: string; cat?: Cat; signifier?: LogSignifier }): Promise<void>
  updateLogEntry(
    id: string,
    fields: Partial<Pick<LogEntry, 'text' | 'kind' | 'state' | 'signifier' | 'cat' | 'onDate' | 'position' | 'migratedTo'>>,
  ): Promise<void>
  deleteLogEntry(id: string): Promise<void>
  /** Carry an open entry to `toDate`: create a fresh open copy there and mark
   *  the original migrated (or scheduled, when moving to a future day). */
  migrateLogEntry(id: string, toDate: string, asScheduled?: boolean): Promise<void>
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
      const on = patchLog('blockLogs', blockId, dateIso)
      // Freeze the block's current shape onto the log so the finished day
      // stays a faithful record even if the template is edited later.
      const blk = qc.getQueryData<PlannerData>(plannerKey)?.blocksByDow.flat().find((b) => b.id === blockId)
      const { error } = on
        ? await supabase.from('block_logs').upsert({
            user_id: userId,
            block_id: blockId,
            done_on: dateIso,
            title: blk?.title ?? '',
            cat: blk?.cat ?? '',
            dur_min: blk?.durMin ?? 0,
            deep: blk?.deep ?? false,
          })
        : await supabase.from('block_logs').delete().eq('block_id', blockId).eq('done_on', dateIso)
      if (error) invalidate()
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

    async updateBlock(id: string, fields: Partial<Pick<Block, 'cat' | 'title' | 'detail' | 'startMin' | 'durMin' | 'anchored' | 'deep'>>) {
      // Optimistic: rapid ± duration taps must see each other's result.
      patch((data) => ({
        ...data,
        blocksByDow: data.blocksByDow.map((bs) => bs.map((b) => (b.id === id ? { ...b, ...fields } : b))),
      }))
      const { error } = await supabase
        .from('blocks')
        .update({
          ...(fields.cat !== undefined && { cat: fields.cat }),
          ...(fields.title !== undefined && { title: fields.title }),
          ...(fields.detail !== undefined && { detail: fields.detail }),
          ...(fields.startMin !== undefined && { start_min: fields.startMin }),
          ...(fields.durMin !== undefined && { dur_min: fields.durMin }),
          ...(fields.anchored !== undefined && { anchored: fields.anchored }),
          ...(fields.deep !== undefined && { deep: fields.deep }),
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

    async saveHabit(habit: { id?: string; name: string; cat: Cat; days: number[] }, position: number) {
      const row = { user_id: userId, name: habit.name, cat: habit.cat, days: habit.days }
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
      bucket: { id?: string; name: string; cat: Cat; tasks: { name: string; deep: boolean }[]; color: string },
      position: number,
    ) {
      let bucketId = bucket.id
      if (bucketId) {
        const { error } = await supabase
          .from('buckets')
          .update({ name: bucket.name, cat: bucket.cat, color: bucket.color })
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
            })),
          )
        if (error) throw error
      }
      await invalidate()
    },

    async deleteBucket(id: string) {
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
      // Append after the last entry already on that day.
      const onDay = (qc.getQueryData<PlannerData>(plannerKey)?.logEntries ?? []).filter(
        (e) => e.onDate === entry.onDate,
      )
      const position = onDay.reduce((m, e) => Math.max(m, e.position + 1), 0)
      const { error } = await supabase.from('log_entries').insert({
        user_id: userId,
        on_date: entry.onDate,
        kind: entry.kind,
        text: entry.text,
        cat: entry.cat ?? 'open',
        signifier: entry.signifier ?? '',
        position,
      })
      if (error) throw error
      await invalidate()
    },

    async updateLogEntry(id, fields) {
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
          ...(fields.cat !== undefined && { cat: fields.cat }),
          ...(fields.onDate !== undefined && { on_date: fields.onDate }),
          ...(fields.position !== undefined && { position: fields.position }),
          ...(fields.migratedTo !== undefined && { migrated_to: fields.migratedTo }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
      if (error) invalidate()
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
