// Local demo backend: same PlannerData/PlannerActions contract as the cloud
// layer, but the whole planner lives in localStorage. Active when no Supabase
// env is configured — lets you run and click through the app with no project.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Block, Cat } from '../planner'
import {
  DEFAULT_NOTES,
  DEFAULT_WAKE_MIN,
  defaultBuckets,
  defaultDays,
  defaultDesignItems,
  defaultHabits,
} from '../defaults'
import { isDeepDefault, plannerKey, type DesignItem, type PlannerActions, type PlannerData } from './planner'

const STORE_KEY = 'life-os-demo-v1'

let uid = 0
const nid = () => `demo-${Date.now().toString(36)}-${++uid}`

function buildDemoData(): PlannerData {
  const days = defaultDays()
  return {
    days: days.map((d, dow) => ({ dow, name: d.name, loc: d.loc })),
    blocksByDow: days.map((d, dow) =>
      d.blocks.map((b, position) => ({
        id: nid(),
        dow,
        position,
        cat: b.cat,
        title: b.title,
        detail: b.detail,
        startMin: b.startMin,
        durMin: b.durMin,
        anchored: b.anchored,
        deep: isDeepDefault(b.cat, b.title),
      })),
    ),
    blockLogs: {},
    habits: defaultHabits.map((h, position) => ({ id: nid(), position, ...h })),
    habitLogs: {},
    buckets: defaultBuckets.map((bk, position) => ({
      id: nid(),
      name: bk.name,
      cat: bk.cat,
      position,
      color: '',
      tasks: bk.tasks.map((name, i) => ({ id: nid(), name, position: i, deep: isDeepDefault(bk.cat, name) })),
    })),
    designItems: defaultDesignItems.map((it, position) => ({ id: nid(), position, ...it })),
    todos: [],
    dumps: [],
    notes: DEFAULT_NOTES,
    designWakeMin: DEFAULT_WAKE_MIN,
  }
}

function load(): PlannerData {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      // hydrate fields added after the store was first written
      const d = JSON.parse(raw) as PlannerData
      return {
        ...d,
        todos: d.todos ?? [],
        dumps: d.dumps ?? [],
        buckets: (d.buckets ?? []).map((bk) => ({
          ...bk,
          color: bk.color ?? '',
          tasks: bk.tasks.map((t) => ({ ...t, deep: t.deep ?? isDeepDefault(bk.cat, t.name) })),
        })),
        blocksByDow: (d.blocksByDow ?? []).map((bs) =>
          bs.map((b) => ({ ...b, deep: b.deep ?? isDeepDefault(b.cat, b.title) })),
        ),
      }
    }
  } catch {
    /* corrupted store — reseed */
  }
  const data = buildDemoData()
  localStorage.setItem(STORE_KEY, JSON.stringify(data))
  return data
}

export function useDemoPlanner() {
  return useQuery({ queryKey: plannerKey, queryFn: () => load(), staleTime: Infinity })
}

export function useDemoActions(): PlannerActions {
  const qc = useQueryClient()
  const mutate = async (fn: (data: PlannerData) => PlannerData) => {
    const next = fn(load())
    localStorage.setItem(STORE_KEY, JSON.stringify(next))
    qc.setQueryData(plannerKey, next)
  }
  const toggle = (mapKey: 'blockLogs' | 'habitLogs', id: string, dateIso: string) =>
    mutate((d) => {
      const logs = { ...d[mapKey] }
      const day = { ...(logs[dateIso] ?? {}) }
      if (day[id]) delete day[id]
      else day[id] = true
      logs[dateIso] = day
      return { ...d, [mapKey]: logs }
    })
  const renumber = (blocks: Block[]) => blocks.map((b, position) => ({ ...b, position }))
  const mapDow = (d: PlannerData, dow: number, fn: (blocks: Block[]) => Block[]) => ({
    ...d,
    blocksByDow: d.blocksByDow.map((blocks, i) => (i === dow ? renumber(fn(blocks)) : blocks)),
  })
  const findDow = (d: PlannerData, id: string) => d.blocksByDow.findIndex((bs) => bs.some((b) => b.id === id))

  return {
    toggleBlockLog: (id, dateIso) => toggle('blockLogs', id, dateIso),
    toggleHabitLog: (id, dateIso) => toggle('habitLogs', id, dateIso),

    async addBlock(dow, position) {
      const id = nid()
      await mutate((d) =>
        mapDow(d, dow, (blocks) => [
          ...blocks,
          { id, dow, position, cat: 'open', title: 'New block — assign', detail: '', startMin: 720, durMin: 30, anchored: false, deep: false },
        ]),
      )
      return id
    },
    updateBlock: (id, fields) =>
      mutate((d) => mapDow(d, findDow(d, id), (blocks) => blocks.map((b) => (b.id === id ? { ...b, ...fields } : b)))),
    deleteBlock: (id) =>
      mutate((d) => mapDow(d, findDow(d, id), (blocks) => blocks.filter((b) => b.id !== id))),
    swapBlocks: (a, b) =>
      mutate((d) =>
        mapDow(d, a.dow, (blocks) => {
          const arr = [...blocks]
          const i = arr.findIndex((x) => x.id === a.id)
          const j = arr.findIndex((x) => x.id === b.id)
          if (i >= 0 && j >= 0) [arr[i], arr[j]] = [arr[j], arr[i]]
          return arr
        }),
      ),
    moveBlock: (id, toDow, orderedTargetIds) =>
      mutate((d) => {
        let moved: Block | undefined
        const stripped = d.blocksByDow.map((bs) => {
          const hit = bs.find((b) => b.id === id)
          if (hit) moved = hit
          return bs.filter((b) => b.id !== id)
        })
        if (!moved) return d
        const target = [...stripped[toDow]]
        target.splice(Math.max(0, orderedTargetIds.indexOf(id)), 0, { ...moved, dow: toDow })
        return {
          ...d,
          blocksByDow: stripped.map((bs, day) =>
            (day === toDow ? target : bs).map((b, position) => ({ ...b, position })),
          ),
        }
      }),
    reorderBlocks: (dow, orderedIds) =>
      mutate((d) =>
        mapDow(d, dow, (blocks) =>
          [...blocks].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)),
        ),
      ),

    saveHabit: (habit, position) =>
      mutate((d) => ({
        ...d,
        habits: habit.id
          ? d.habits.map((h) => (h.id === habit.id ? { ...h, name: habit.name, cat: habit.cat, days: habit.days } : h))
          : [...d.habits, { id: nid(), name: habit.name, cat: habit.cat, days: habit.days, position }],
      })),
    deleteHabit: (id) => mutate((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) })),

    saveBucket: (bucket, position) =>
      mutate((d) => ({
        ...d,
        buckets: bucket.id
          ? d.buckets.map((bk) =>
              bk.id === bucket.id
                ? { ...bk, name: bucket.name, cat: bucket.cat, color: bucket.color, tasks: bucket.tasks.map((t, i) => ({ id: nid(), name: t.name, deep: t.deep, position: i })) }
                : bk,
            )
          : [
              ...d.buckets,
              { id: nid(), name: bucket.name, cat: bucket.cat, position, color: bucket.color, tasks: bucket.tasks.map((t, i) => ({ id: nid(), name: t.name, deep: t.deep, position: i })) },
            ],
      })),
    deleteBucket: (id) => mutate((d) => ({ ...d, buckets: d.buckets.filter((bk) => bk.id !== id) })),

    addTodo: (text) =>
      mutate((d) => ({
        ...d,
        todos: [...d.todos, { id: nid(), text, done: false, position: d.todos.length }],
      })),
    toggleTodo: (id, done) =>
      mutate((d) => ({ ...d, todos: d.todos.map((t) => (t.id === id ? { ...t, done } : t)) })),
    deleteTodo: (id) => mutate((d) => ({ ...d, todos: d.todos.filter((t) => t.id !== id) })),
    addDump: (text) =>
      mutate((d) => ({
        ...d,
        dumps: [...d.dumps, { id: nid(), text, createdAt: new Date().toISOString() }],
      })),
    deleteDump: (id) => mutate((d) => ({ ...d, dumps: d.dumps.filter((x) => x.id !== id) })),

    async addDesignItem(item, position) {
      const id = nid()
      await mutate((d) => ({
        ...d,
        designItems: [...d.designItems, { id, position, name: item.name, cat: item.cat as Cat, mins: 60 }],
      }))
      return id
    },
    updateDesignItem: (id, fields) =>
      mutate((d) => ({ ...d, designItems: d.designItems.map((it) => (it.id === id ? { ...it, ...fields } : it)) })),
    swapDesignItems: (a, b) =>
      mutate((d) => {
        const arr = [...d.designItems]
        const i = arr.findIndex((x) => x.id === a.id)
        const j = arr.findIndex((x) => x.id === b.id)
        if (i >= 0 && j >= 0) [arr[i], arr[j]] = [arr[j], arr[i]]
        return { ...d, designItems: arr.map((it, position) => ({ ...it, position })) }
      }),
    reorderDesignItems: (orderedIds) =>
      mutate((d) => ({
        ...d,
        designItems: [...d.designItems]
          .sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id))
          .map((it, position) => ({ ...it, position })),
      })),
    deleteDesignItem: (id) =>
      mutate((d) => ({ ...d, designItems: d.designItems.filter((it) => it.id !== id).map((it, position) => ({ ...it, position })) })),
    resetDesign: () =>
      mutate((d) => ({ ...d, designItems: defaultDesignItems.map((it, position) => ({ id: nid(), position, ...it })) })),
    setWake: (min) => mutate((d) => ({ ...d, designWakeMin: min })),
    setNotes: (notes) => mutate((d) => ({ ...d, notes })),

    applyDesignToDay: (dow, items: DesignItem[], wakeMin) =>
      mutate((d) => {
        let cur = wakeMin
        const blocks = items.map((it, position) => {
          const b: Block = {
            id: nid(),
            dow,
            position,
            cat: it.cat,
            title: it.name,
            detail: '',
            startMin: ((cur % 1440) + 1440) % 1440,
            durMin: it.mins,
            anchored: position === 0,
            deep: false,
          }
          cur += it.mins
          return b
        })
        return { ...d, blocksByDow: d.blocksByDow.map((bs, i) => (i === dow ? blocks : bs)) }
      }),
  }
}
