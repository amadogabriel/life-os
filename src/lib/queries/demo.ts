// Local demo backend: same PlannerData/PlannerActions contract as the cloud
// layer, but the whole planner lives in localStorage. Active when no Supabase
// env is configured — lets you run and click through the app with no project.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Block, Cat, LogEntry, LogState } from '../planner'
import {
  blockLogRowsFromEntries,
  bucketIdForCat,
  doneBlockMap,
  dowOfIso,
  forkCopies,
  isoDate,
  manilaDate,
  materializes,
  newLogEntry,
  reorderWithinSlots,
  resolve,
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
import { isDeepDefault, plannerKey, type DesignItem, type PlannerActions, type PlannerData } from './planner'

const STORE_KEY = 'life-os-demo-v1'

let uid = 0
const nid = () => `demo-${Date.now().toString(36)}-${++uid}`

function buildDemoData(): PlannerData {
  const days = defaultDays()
  // Buckets first, so blocks can reference their cat's bucket (mirrors the
  // migration's cat→bucket backfill — color then resolves live through it).
  const buckets = defaultBuckets.map((bk, position) => ({
    id: nid(),
    name: bk.name,
    cat: bk.cat,
    position,
    color: '',
    // Life-type buckets are uncounted recovery housekeeping (ADR-0003 #17).
    counted: bk.cat !== 'life',
    tasks: bk.tasks.map((name, i) => ({ id: nid(), name, position: i, deep: isDeepDefault(bk.cat, name) })),
  }))
  const bucketByCat = new Map(buckets.map((bk) => [bk.cat, bk.id]))
  return {
    days: days.map((d, dow) => ({ dow, name: d.name, loc: d.loc })),
    blocksByDow: days.map((d, dow) =>
      d.blocks.map((b, position) => ({
        id: nid(),
        dow,
        position,
        bucketId: bucketByCat.get(b.cat) ?? null,
        cat: b.cat,
        title: b.title,
        detail: b.detail,
        startMin: b.startMin,
        durMin: b.durMin,
        anchored: b.anchored,
        deep: isDeepDefault(b.cat, b.title),
        habitId: null,
      })),
    ),
    dayForks: {},
    blockLogs: {},
    blockLogRows: [],
    logEntries: [],
    projects: [],
    sprints: [],
    // Habits carry their cat's bucket, mirroring migration 0018's cat→bucket
    // backfill — color then resolves live through the reference (blockStyle).
    habits: defaultHabits.map((h, position) => ({
      id: nid(),
      position,
      bucketId: bucketIdForCat(h.cat, buckets),
      ...h,
    })),
    habitLogs: {},
    buckets,
    designItems: defaultDesignItems.map((it, position) => ({ id: nid(), position, ...it })),
    todos: [],
    dumps: [],
    notes: DEFAULT_NOTES,
    designWakeMin: DEFAULT_WAKE_MIN,
  }
}

/** Fill in derived fields so consumers always see a consistent snapshot. The
 *  Daily Log (logEntries) is the single source of truth; a block's checked
 *  state and the frozen accomplishment rows are derived from it. */
function finalize(d: PlannerData): PlannerData {
  return {
    ...d,
    blockLogs: doneBlockMap(d.logEntries),
    blockLogRows: blockLogRowsFromEntries(d.logEntries),
  }
}

function load(): PlannerData {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      // hydrate fields added after the store was first written
      const d = JSON.parse(raw) as PlannerData
      // Link blocks written before bucket_id existed to their cat's bucket
      // (mirrors the migration backfill), so recoloring restyles them too.
      const bucketByCat = new Map((d.buckets ?? []).map((bk) => [bk.cat, bk.id]))
      return finalize({
        ...d,
        dayForks: d.dayForks ?? {},
        todos: d.todos ?? [],
        dumps: d.dumps ?? [],
        // Link entries written before bucket_id existed to their cat's bucket
        // (mirrors the 0017 backfill), so they group into and recolor with it.
        logEntries: (d.logEntries ?? []).map((e) => ({
          ...e,
          bucketId: e.bucketId ?? (e.cat !== 'open' ? (bucketByCat.get(e.cat) ?? null) : null),
        })),
        projects: d.projects ?? [],
        sprints: d.sprints ?? [],
        buckets: (d.buckets ?? []).map((bk) => ({
          ...bk,
          color: bk.color ?? '',
          // Buckets written before the counted flag existed: Life uncounted,
          // everything else counted (mirrors migration 0016).
          counted: bk.counted ?? bk.cat !== 'life',
          tasks: bk.tasks.map((t) => ({ ...t, deep: t.deep ?? isDeepDefault(bk.cat, t.name) })),
        })),
        blocksByDow: (d.blocksByDow ?? []).map((bs) =>
          bs.map((b) => ({
            ...b,
            bucketId: b.bucketId ?? bucketByCat.get(b.cat) ?? null,
            deep: b.deep ?? isDeepDefault(b.cat, b.title),
            habitId: b.habitId ?? null,
          })),
        ),
        // Link habits written before bucket_id existed to their cat's bucket
        // (mirrors migration 0018's backfill), so recoloring restyles them too.
        habits: (d.habits ?? []).map((h) => ({
          ...h,
          bucketId: h.bucketId ?? bucketByCat.get(h.cat) ?? null,
        })),
      })
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
    const next = finalize(fn(load()))
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
  // A block id names either a Template block (blocksByDow) or a Day Plan
  // (fork) block (dayForks) — id-based actions serve both.
  const findForkDate = (d: PlannerData, id: string) =>
    Object.keys(d.dayForks).find((date) => d.dayForks[date].some((b) => b.id === id))
  const mapFork = (d: PlannerData, dateIso: string, fn: (blocks: Block[]) => Block[]) => ({
    ...d,
    dayForks: { ...d.dayForks, [dateIso]: renumber(fn(d.dayForks[dateIso] ?? [])) },
  })
  const mapBlockLists = (d: PlannerData, id: string, fn: (blocks: Block[]) => Block[]) => {
    const dow = findDow(d, id)
    if (dow >= 0) return mapDow(d, dow, fn)
    const date = findForkDate(d, id)
    return date ? mapFork(d, date, fn) : d
  }

  return {
    toggleBlockLog: (id, dateIso) =>
      mutate((d) => {
        // Log-primary: flip the block's Daily Log entry open<->done (creating it
        // if the day wasn't frozen yet). blockLogs is derived in finalize().
        const existing = d.logEntries.find((e) => e.blockId === id && e.onDate === dateIso)
        const blk = d.blocksByDow.flat().find((b) => b.id === id)
        const on = existing?.state !== 'done'
        let logEntries: LogEntry[]
        if (existing) {
          logEntries = d.logEntries.map((e) =>
            e.id === existing.id ? { ...e, state: (on ? 'done' : 'open') as LogState } : e,
          )
        } else {
          const position = d.logEntries
            .filter((e) => e.onDate === dateIso)
            .reduce((m, e) => Math.max(m, e.position + 1), 0)
          logEntries = [
            ...d.logEntries,
            newLogEntry({
              id: nid(),
              onDate: dateIso,
              state: 'done',
              text: blk?.title ?? '',
              bucketId: blk?.bucketId ?? null,
              cat: blk?.cat ?? 'open',
              blockId: id,
              position,
              durMin: blk?.durMin ?? null,
              deep: blk?.deep ?? false,
              startMin: blk?.startMin ?? null,
              anchored: blk?.anchored ?? false,
            }),
          ]
        }
        // Mirror a linked habit's log in the same direction.
        let habitLogs = d.habitLogs
        if (blk?.habitId) {
          const hday = { ...(habitLogs[dateIso] ?? {}) }
          if (on) hday[blk.habitId] = true
          else delete hday[blk.habitId]
          habitLogs = { ...habitLogs, [dateIso]: hday }
        }
        return { ...d, logEntries, habitLogs }
      }),
    toggleHabitLog: (id, dateIso) => toggle('habitLogs', id, dateIso),
    async materializeDay(dateIso) {
      let count = 0
      await mutate((d) => {
        const dow = dowOfIso(dateIso)
        const frozen = new Set(d.logEntries.filter((e) => e.onDate === dateIso && e.blockId).map((e) => e.blockId))
        // Fork wins: a forked date freezes from its Day Plan (even when
        // intentionally emptied), an unforked date from the weekday Template.
        // Uncounted buckets (Life) never materialize; Unassigned (null) does
        // (ADR-0003 #17) — mirrors materialize_day's counted gate.
        const blocks = (d.dayForks[dateIso] ?? d.blocksByDow[dow] ?? []).filter((b) => materializes(b, d.buckets))
        const resolved = resolve(blocks)
        let position = d.logEntries
          .filter((e) => e.onDate === dateIso)
          .reduce((m, e) => Math.max(m, e.position + 1), 0)
        const added: LogEntry[] = resolved
          .filter((r) => !frozen.has(r.block.id))
          .map((r) =>
            newLogEntry({
              id: nid(),
              onDate: dateIso,
              state: 'open',
              text: r.block.title,
              bucketId: r.block.bucketId,
              cat: r.block.cat,
              blockId: r.block.id,
              position: position++,
              durMin: r.block.durMin,
              deep: r.block.deep,
              startMin: r.start,
              anchored: r.block.anchored,
            }),
          )
        count = added.length
        return { ...d, logEntries: [...d.logEntries, ...added] }
      })
      return count
    },

    async addBlock(dow, position) {
      const id = nid()
      await mutate((d) =>
        mapDow(d, dow, (blocks) => [
          ...blocks,
          { id, dow, position, bucketId: null, cat: 'open', title: 'New block — assign', detail: '', startMin: 720, durMin: 30, anchored: false, deep: false, habitId: null },
        ]),
      )
      return id
    },
    updateBlock: (id, fields) =>
      mutate((d) => mapBlockLists(d, id, (blocks) => blocks.map((b) => (b.id === id ? { ...b, ...fields } : b)))),
    deleteBlock: (id) =>
      mutate((d) => mapBlockLists(d, id, (blocks) => blocks.filter((b) => b.id !== id))),
    swapBlocks: (a, b) =>
      mutate((d) =>
        mapBlockLists(d, a.id, (blocks) => {
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

    async forkDay(dateIso) {
      let idMap: Record<string, string> = {}
      await mutate((d) => {
        if (d.dayForks[dateIso]) return d // already forked — edits go to the fork
        const fork = forkCopies(d.blocksByDow[dowOfIso(dateIso)] ?? [], nid)
        idMap = fork.idMap
        return { ...d, dayForks: { ...d.dayForks, [dateIso]: fork.copies } }
      })
      return idMap
    },
    unforkDay: (dateIso) =>
      mutate((d) => {
        const dayForks = { ...d.dayForks }
        delete dayForks[dateIso]
        return { ...d, dayForks }
      }),
    async addForkBlock(dateIso, position) {
      const id = nid()
      await mutate((d) =>
        mapFork(d, dateIso, (blocks) => [
          ...blocks,
          { id, dow: dowOfIso(dateIso), position, bucketId: null, cat: 'open', title: 'New block — assign', detail: '', startMin: 720, durMin: 30, anchored: false, deep: false, habitId: null },
        ]),
      )
      return id
    },
    reorderForkBlocks: (dateIso, orderedIds) =>
      mutate((d) =>
        mapFork(d, dateIso, (blocks) =>
          [...blocks].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id)),
        ),
      ),

    saveHabit: (habit, position) =>
      mutate((d) => ({
        ...d,
        habits: habit.id
          ? d.habits.map((h) =>
              h.id === habit.id
                ? { ...h, name: habit.name, bucketId: habit.bucketId, cat: habit.cat, days: habit.days }
                : h,
            )
          : [
              ...d.habits,
              { id: nid(), name: habit.name, bucketId: habit.bucketId, cat: habit.cat, days: habit.days, position },
            ],
      })),
    deleteHabit: (id) => mutate((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) })),

    saveBucket: (bucket, position) =>
      mutate((d) => ({
        ...d,
        buckets: bucket.id
          ? d.buckets.map((bk) =>
              bk.id === bucket.id
                ? { ...bk, name: bucket.name, cat: bucket.cat, color: bucket.color, counted: bucket.counted, tasks: bucket.tasks.map((t, i) => ({ id: nid(), name: t.name, deep: t.deep, position: i })) }
                : bk,
            )
          : [
              ...d.buckets,
              { id: nid(), name: bucket.name, cat: bucket.cat, position, color: bucket.color, counted: bucket.counted, tasks: bucket.tasks.map((t, i) => ({ id: nid(), name: t.name, deep: t.deep, position: i })) },
            ],
      })),
    deleteBucket: (id) =>
      mutate((d) => ({
        ...d,
        buckets: d.buckets.filter((bk) => bk.id !== id),
        // Mirror the DB's ON DELETE SET NULL: blocks AND habits placed from this
        // bucket lose the reference and revert to the fallback palette (staying
        // functional — Unassigned/gray).
        blocksByDow: d.blocksByDow.map((bs) =>
          bs.map((b) => (b.bucketId === id ? { ...b, bucketId: null } : b)),
        ),
        habits: d.habits.map((h) => (h.bucketId === id ? { ...h, bucketId: null } : h)),
      })),

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

    async addLogEntry(entry) {
      const id = nid()
      await mutate((d) => {
        const onDay = d.logEntries.filter((e) => e.onDate === entry.onDate)
        const position = onDay.reduce((m, e) => Math.max(m, e.position + 1), 0)
        // Rapid-log picks a Bucket; `cat` is stamped from it (ADR-0003).
        const bucket = entry.bucketId ? d.buckets.find((bk) => bk.id === entry.bucketId) : undefined
        return {
          ...d,
          logEntries: [
            ...d.logEntries,
            {
              id,
              onDate: entry.onDate,
              kind: entry.kind,
              state: 'open',
              signifier: entry.signifier ?? '',
              text: entry.text,
              bucketId: entry.bucketId ?? null,
              cat: bucket?.cat ?? entry.cat ?? 'open',
              blockId: null,
              migratedTo: null,
              projectId: entry.projectId ?? null,
              sprintId: entry.sprintId ?? null,
              position,
              durMin: entry.durMin ?? null,
              deep: false,
              startMin: entry.startMin ?? null,
              anchored: entry.anchored ?? false,
            },
          ],
        }
      })
      return id
    },
    updateLogEntry: (id, fields) =>
      mutate((d) => ({ ...d, logEntries: d.logEntries.map((e) => (e.id === id ? { ...e, ...fields } : e)) })),
    deleteLogEntry: (id) => mutate((d) => ({ ...d, logEntries: d.logEntries.filter((e) => e.id !== id) })),
    reorderLogEntries: (dateIso, orderedIds) =>
      mutate((d) => {
        const dayEntries = d.logEntries.filter((e) => e.onDate === dateIso).sort((a, b) => a.position - b.position)
        const reordered = reorderWithinSlots(dayEntries, orderedIds).map((e, position) => ({ ...e, position }))
        const byId = new Map(reordered.map((e) => [e.id, e]))
        return { ...d, logEntries: d.logEntries.map((e) => byId.get(e.id) ?? e) }
      }),
    migrateLogEntry: (id, toDate, asScheduled = false) =>
      mutate((d) => {
        const src = d.logEntries.find((e) => e.id === id)
        if (!src) return d
        const position = d.logEntries
          .filter((e) => e.onDate === toDate)
          .reduce((m, e) => Math.max(m, e.position + 1), 0)
        const copyId = nid()
        return {
          ...d,
          logEntries: [
            ...d.logEntries.map((e) =>
              e.id === id
                ? { ...e, state: (asScheduled ? 'scheduled' : 'migrated') as LogState, migratedTo: copyId }
                : e,
            ),
            {
              id: copyId,
              onDate: toDate,
              kind: src.kind,
              state: 'open',
              signifier: src.signifier,
              text: src.text,
              bucketId: src.bucketId,
              cat: src.cat,
              blockId: null,
              migratedTo: null,
              projectId: null,
              sprintId: null,
              position,
              durMin: null,
              deep: false,
              startMin: null,
              anchored: false,
            },
          ],
        }
      }),

    async addProject(name) {
      const id = nid()
      await mutate((d) => ({
        ...d,
        projects: [...d.projects, { id, name, goal: '', status: 'planning', position: d.projects.length }],
      }))
      return id
    },
    updateProject: (id, fields) =>
      mutate((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, ...fields } : p)) })),
    deleteProject: (id) =>
      mutate((d) => ({
        ...d,
        projects: d.projects.filter((p) => p.id !== id),
        sprints: d.sprints.filter((s) => s.projectId !== id),
        logEntries: d.logEntries.map((e) => (e.projectId === id ? { ...e, projectId: null, sprintId: null } : e)),
      })),
    async addSprint(projectId, name) {
      const id = nid()
      await mutate((d) => ({
        ...d,
        sprints: [
          ...d.sprints,
          { id, projectId, name, goal: '', status: 'planning', startDate: null, endDate: null, position: d.sprints.filter((s) => s.projectId === projectId).length },
        ],
      }))
      return id
    },
    updateSprint: (id, fields) =>
      mutate((d) => ({ ...d, sprints: d.sprints.map((s) => (s.id === id ? { ...s, ...fields } : s)) })),
    deleteSprint: (id) =>
      mutate((d) => ({
        ...d,
        sprints: d.sprints.filter((s) => s.id !== id),
        logEntries: d.logEntries.map((e) => (e.sprintId === id ? { ...e, sprintId: null } : e)),
      })),
    scheduleEntryToDate: (entryId, dateIso) =>
      mutate((d) => {
        const todayIso = isoDate(manilaDate(new Date()))
        const { startMin, position } = scheduleSlot(
          { blocksByDow: d.blocksByDow, logEntries: d.logEntries, dayForks: d.dayForks },
          entryId,
          dateIso,
          todayIso,
        )
        return {
          ...d,
          logEntries: d.logEntries.map((e) =>
            e.id === entryId ? { ...e, onDate: dateIso, startMin, anchored: false, position } : e,
          ),
        }
      }),
    unscheduleEntry: (entryId) =>
      mutate((d) => ({
        ...d,
        logEntries: d.logEntries.map((e) => (e.id === entryId ? { ...e, startMin: null, anchored: false } : e)),
      })),

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
            bucketId: null,
            cat: it.cat,
            title: it.name,
            detail: '',
            startMin: ((cur % 1440) + 1440) % 1440,
            durMin: it.mins,
            anchored: position === 0,
            deep: false,
            habitId: null,
          }
          cur += it.mins
          return b
        })
        return { ...d, blocksByDow: d.blocksByDow.map((bs, i) => (i === dow ? blocks : bs)) }
      }),
  }
}
