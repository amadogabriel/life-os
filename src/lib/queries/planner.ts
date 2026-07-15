// All data access lives here — UI components never touch supabase directly.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabase'
import type { Block, Cat, Day, Habit, LogMap } from '../planner'
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
}

export interface Bucket {
  id: string
  name: string
  cat: Cat
  position: number
  tasks: BucketTask[]
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
  habits: Habit[]
  habitLogs: LogMap
  buckets: Bucket[]
  designItems: DesignItem[]
  notes: string
  designWakeMin: number
}

export const plannerKey = ['planner'] as const

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
      .insert(bk.tasks.map((name, i) => ({ user_id: userId, bucket_id: bucket.id, name, position: i })))
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
  const [days, blocks, blockLogs, habits, habitLogs, buckets, bucketTasks, designItems, profile] =
    await Promise.all([
      supabase.from('days').select('*').order('dow'),
      supabase.from('blocks').select('*').order('dow').order('position'),
      supabase.from('block_logs').select('*'),
      supabase.from('habits').select('*').order('position'),
      supabase.from('habit_logs').select('*'),
      supabase.from('buckets').select('*').order('position'),
      supabase.from('bucket_tasks').select('*').order('position'),
      supabase.from('design_items').select('*').order('position'),
      supabase.from('profiles').select('*').maybeSingle(),
    ])
  const results = [days, blocks, blockLogs, habits, habitLogs, buckets, bucketTasks, designItems, profile]
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
    })
  }

  const taskByBucket = new Map<string, BucketTask[]>()
  for (const t of bucketTasks.data!) {
    const list = taskByBucket.get(t.bucket_id) ?? []
    list.push({ id: t.id, name: t.name, position: t.position })
    taskByBucket.set(t.bucket_id, list)
  }

  return {
    days: days.data.map((d) => ({ dow: d.dow, name: d.name, loc: d.loc })),
    blocksByDow,
    blockLogs: toLogMap(blockLogs.data!, 'block_id'),
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
      tasks: taskByBucket.get(bk.id) ?? [],
    })),
    designItems: designItems.data!.map((it) => ({
      id: it.id,
      position: it.position,
      name: it.name,
      cat: it.cat as Cat,
      mins: it.mins,
    })),
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

/** Imperative write API. Every action persists row-level changes, then
 *  invalidates the planner query; toggles patch the cache optimistically. */
export function usePlannerActions(userId: string) {
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
      const { error } = on
        ? await supabase.from('block_logs').upsert({ user_id: userId, block_id: blockId, done_on: dateIso })
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

    async updateBlock(id: string, fields: Partial<Pick<Block, 'cat' | 'title' | 'detail' | 'startMin' | 'durMin' | 'anchored'>>) {
      const { error } = await supabase
        .from('blocks')
        .update({
          ...(fields.cat !== undefined && { cat: fields.cat }),
          ...(fields.title !== undefined && { title: fields.title }),
          ...(fields.detail !== undefined && { detail: fields.detail }),
          ...(fields.startMin !== undefined && { start_min: fields.startMin }),
          ...(fields.durMin !== undefined && { dur_min: fields.durMin }),
          ...(fields.anchored !== undefined && { anchored: fields.anchored }),
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

    async saveBucket(bucket: { id?: string; name: string; cat: Cat; tasks: string[] }, position: number) {
      let bucketId = bucket.id
      if (bucketId) {
        const { error } = await supabase
          .from('buckets')
          .update({ name: bucket.name, cat: bucket.cat })
          .eq('id', bucketId)
        if (error) throw error
        const { error: delErr } = await supabase.from('bucket_tasks').delete().eq('bucket_id', bucketId)
        if (delErr) throw delErr
      } else {
        const { data, error } = await supabase
          .from('buckets')
          .insert({ user_id: userId, name: bucket.name, cat: bucket.cat, position })
          .select('id')
          .single()
        if (error) throw error
        bucketId = data.id
      }
      if (bucket.tasks.length) {
        const { error } = await supabase
          .from('bucket_tasks')
          .insert(bucket.tasks.map((name, i) => ({ user_id: userId, bucket_id: bucketId!, name, position: i })))
        if (error) throw error
      }
      await invalidate()
    },

    async deleteBucket(id: string) {
      const { error } = await supabase.from('buckets').delete().eq('id', id)
      if (error) throw error
      await invalidate()
    },

    async addDesignItem(item: { name: string; cat: Cat }, position: number) {
      const { error } = await supabase
        .from('design_items')
        .insert({ user_id: userId, position, name: item.name, cat: item.cat, mins: 60 })
      if (error) throw error
      await invalidate()
    },

    async updateDesignItem(id: string, fields: { mins?: number; position?: number }) {
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

export type PlannerActions = ReturnType<typeof usePlannerActions>
