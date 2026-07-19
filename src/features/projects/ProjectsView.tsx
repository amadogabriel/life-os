import { useState, type ReactNode } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import {
  addDays,
  blockStyle,
  bullet,
  DOW,
  isoDate,
  manilaDate,
  stripeVar,
  weekRange,
  type LogEntry,
  type Project,
  type ProjectStatus,
  type SprintStatus,
} from '../../lib/planner'

const PROJECT_NEXT: Record<ProjectStatus, ProjectStatus> = {
  planning: 'active',
  active: 'done',
  done: 'archived',
  archived: 'planning',
}
const SPRINT_NEXT: Record<SprintStatus, SprintStatus> = { planning: 'active', active: 'done', done: 'planning' }
const STATUS_COLOR: Record<string, string> = {
  planning: 'var(--ink-faint)',
  active: 'var(--accent)',
  done: '#6db06d',
  archived: 'var(--ink-faint)',
}

// Column collapse (#26): local-only, per-browser — keyed per column occurrence
// so two Projects' Backlog columns (both keyed 'backlog' in Board-move terms)
// don't collide. Inbox is global (same key everywhere), matching its data.
const COLLAPSE_KEY = 'life-os-board-collapsed-v1'
function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

const StatusPill = ({ status, onClick }: { status: string; onClick?: () => void }) => (
  <button
    className="text-[10px] uppercase tracking-[0.08em]"
    title={onClick ? 'Advance status' : undefined}
    onClick={onClick}
    style={{
      fontFamily: 'var(--mono)',
      color: STATUS_COLOR[status],
      border: `1px solid ${STATUS_COLOR[status]}`,
      borderRadius: 999,
      padding: '1px 8px',
      background: 'transparent',
      cursor: onClick ? 'pointer' : 'default',
    }}
  >
    {status}
  </button>
)

// Hoisted to a stable top-level component (#26 prerequisite): previously
// defined inside ProjectsView's body, so every re-render (e.g. typing into
// the add-task draft state) minted a new component identity, forcing React
// to unmount/remount the whole column subtree — which is why the Backlog
// "+ add task…" input lost focus after every keystroke.
function EntryCard({
  e,
  entryStyle,
  onToggleDone,
  onDelete,
}: {
  e: LogEntry
  entryStyle: (e: LogEntry) => Record<string, string> | undefined
  onToggleDone: (e: LogEntry) => void
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id })
  const done = e.state === 'done'
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex touch-none items-center gap-2 rounded-md border px-2 py-1.5"
      style={{
        borderColor: 'var(--line-soft)',
        background: 'var(--paper)',
        ...entryStyle(e),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
    >
      {e.kind === 'task' ? (
        <button
          className="bullet"
          title="Toggle done"
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={() => onToggleDone(e)}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--mono)', width: 16 }}
        >
          {bullet(e.kind, e.state)}
        </button>
      ) : (
        <span className="bullet" style={{ fontFamily: 'var(--mono)', width: 16, color: 'var(--ink-faint)' }}>
          {bullet(e.kind, e.state)}
        </span>
      )}
      <span
        className="flex-1 text-[13px]"
        style={done ? { textDecoration: 'line-through', color: 'var(--ink-faint)' } : undefined}
      >
        {e.text}
      </span>
      {/* Filled into a Container's Agenda (#33): the same card, spoken for. */}
      {e.isAgendaItem && e.onDate && !done ? (
        <span
          className="text-[10px]"
          title={`Scheduled into a chunk on ${e.onDate}`}
          style={{ flex: 'none', color: 'var(--ink-faint)', border: '1px solid var(--line)', borderRadius: 999, padding: '0 6px' }}
        >
          ‹ scheduled {e.onDate.slice(5)}
        </span>
      ) : null}
      <button className="x" title="Delete" onPointerDown={(ev) => ev.stopPropagation()} onClick={() => onDelete(e.id)}>
        ✕
      </button>
    </div>
  )
}

// Hoisted alongside EntryCard for the same reason. Droppable (so an empty
// column, or dropping past the last card, still registers) and a Sortable
// list host for its cards; collapses to a thin name+count strip on click.
function Column({
  id,
  title,
  extra,
  collapsed,
  onToggleCollapse,
  itemIds,
  children,
}: {
  id: string
  title: string
  extra?: ReactNode
  collapsed: boolean
  onToggleCollapse: () => void
  itemIds: string[]
  children: ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  if (collapsed) {
    return (
      <button
        ref={setNodeRef}
        className="flex w-9 flex-none flex-col items-center gap-1 rounded-xl border py-2"
        style={{ background: isOver ? 'var(--paper)' : 'var(--card)', borderColor: isOver ? 'var(--accent)' : 'var(--line)' }}
        title={`Expand ${title}`}
        onClick={onToggleCollapse}
      >
        <span style={{ writingMode: 'vertical-rl', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-faint)' }}>
          {title}
        </span>
      </button>
    )
  }

  return (
    <div
      ref={setNodeRef}
      className="flex w-[260px] flex-none flex-col gap-1.5 rounded-xl border p-2"
      style={{ background: 'var(--card)', borderColor: isOver ? 'var(--accent)' : 'var(--line)' }}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-[0.09em]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
          {title}
        </span>
        <span className="flex items-center gap-1">
          {extra}
          <button
            className="btn ghost sm"
            style={{ minWidth: 20, minHeight: 20, padding: 0, fontSize: 11 }}
            title="Collapse column"
            onClick={onToggleCollapse}
          >
            «
          </button>
        </span>
      </div>
      <SortableContext id={id} items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </div>
  )
}

export function ProjectsView({ data, actions, today }: ViewProps) {
  const [sel, setSel] = useState<string | null>(null)
  const [pName, setPName] = useState('')
  const [sName, setSName] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [wkOff, setWkOff] = useState(0) // Sprint work card's week pager (0 = this week)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => loadCollapsed())
  // Log Entries recolor LIVE through their Bucket (#18).
  const entryStyle = (e: LogEntry) => stripeVar(blockStyle({ bucketId: e.bucketId, cat: e.cat }, data.buckets))
  const todayDate = manilaDate(today)
  const todayIso = isoDate(todayDate)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  function toggleCollapse(key: string) {
    setCollapsed((c) => {
      const next = { ...c, [key]: !c[key] }
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      return next
    })
  }
  const onToggleDone = (e: LogEntry) => actions.updateLogEntry(e.id, { state: e.state === 'done' ? 'open' : 'done' })
  const onDelete = (id: string) => actions.deleteLogEntry(id)

  const projects = [...data.projects].sort((a, b) => a.position - b.position)
  const project = projects.find((p) => p.id === sel) ?? null
  const sprints = project
    ? data.sprints.filter((s) => s.projectId === project.id).sort((a, b) => a.position - b.position)
    : []

  // The bullet-journal inbox: open tasks/notes not yet processed into a project.
  // Ordered by Board position (#26) — its own column order, global across boards.
  const inbox = data.logEntries
    .filter((e) => (e.kind === 'task' || e.kind === 'note') && e.state === 'open' && !e.projectId)
    .sort((a, b) => a.boardPosition - b.boardPosition)

  // Sprint work: open active-sprint tasks not yet placed on a day. The moment
  // a day is picked (a dated one-off — on_date + start_min) the task leaves
  // this card and lives on its day in the Planner.
  const wkRange = weekRange(todayDate, wkOff)
  const week = Array.from({ length: 7 }, (_, i) => addDays(wkRange.start, i))
  const wkLabel = wkOff === 0 ? 'this wk' : wkRange.label.replace('Week of ', '')
  const activeSprintIds = new Set(data.sprints.filter((s) => s.status === 'active').map((s) => s.id))
  const sprintById = new Map(data.sprints.map((s) => [s.id, s]))
  const projectById = new Map(data.projects.map((p) => [p.id, p]))
  const sprintTasks = data.logEntries.filter(
    (e) =>
      e.kind === 'task' &&
      e.state === 'open' &&
      e.sprintId &&
      activeSprintIds.has(e.sprintId) &&
      e.startMin == null &&
      // Already filled into a Container's Agenda (#33) → spoken for, drop it
      // from the "plan into your week" list (it shows as scheduled on the Board).
      !e.isAgendaItem,
  )

  async function addProject() {
    const n = pName.trim()
    if (!n) return
    setPName('')
    const id = await actions.addProject(n)
    setSel(id)
  }
  async function addSprint() {
    const n = sName.trim()
    if (!n || !project) return
    setSName('')
    await actions.addSprint(project.id, n)
  }

  async function addTask(key: string, sprintId: string | null) {
    const text = (drafts[key] ?? '').trim()
    if (!text || !project) return
    setDrafts((d) => ({ ...d, [key]: '' }))
    await actions.addLogEntry({ onDate: todayIso, kind: 'task', text, projectId: project.id, sprintId })
  }
  const addRow = (key: string, sprintId: string | null) => (
    <input
      className="qi"
      placeholder="+ add task…"
      style={{ fontSize: 12, padding: '4px 6px' }}
      value={drafts[key] ?? ''}
      onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
      onKeyDown={(e) => e.key === 'Enter' && addTask(key, sprintId)}
    />
  )

  const countFor = (p: Project) => data.logEntries.filter((e) => e.projectId === p.id).length
  const sprintCountFor = (p: Project) => data.sprints.filter((s) => s.projectId === p.id).length

  // ---------- project list ----------
  if (!project) {
    // Inbox rows are draggable here too — dropping one on a Project tile
    // files it into that Project's Backlog (index-page filing, #26); dropping
    // it on another Inbox row instead just reorders the shared global Inbox.
    function handleIndexDragEnd(evt: DragEndEvent) {
      const { active, over } = evt
      if (!over) return
      const activeId = String(active.id)
      const overId = String(over.id)
      if (data.projects.some((p) => p.id === overId)) {
        // Append to the end of the TARGET project's own Backlog, not the
        // (unrelated-length) global Inbox list this row is dragged from.
        const targetBacklogLength = data.logEntries.filter((e) => e.projectId === overId && !e.sprintId).length
        actions.moveBoardEntry(overId, { id: activeId, dest: 'backlog', index: targetBacklogLength })
        return
      }
      const destIds = inbox.map((e) => e.id).filter((id) => id !== activeId)
      let index = destIds.indexOf(overId)
      if (index === -1) index = destIds.length
      // Inbox is global — projectId is unused when dest is 'inbox' (applyBoardMove).
      actions.moveBoardEntry('', { id: activeId, dest: 'inbox', index })
    }

    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleIndexDragEnd}>
        <div>
          <div className="view-head mb-[18px]">
            <h2>Projects</h2>
            <p>Process brain-dump notes into sprints — from planning to project end.</p>
          </div>
          <div className="mb-4 flex gap-1.5">
            <input
              className="qi flex-1 max-w-[320px]"
              placeholder="New project…"
              maxLength={120}
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addProject()}
            />
            <button className="btn ghost sm" onClick={addProject}>
              ＋ Project
            </button>
          </div>
          {projects.length === 0 && <div className="hint px-0">No projects yet — create one, then pull notes in from the inbox.</div>}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {projects.map((p) => (
              <ProjectTile key={p.id} project={p} sprintCount={sprintCountFor(p)} taskCount={countFor(p)} onOpen={() => setSel(p.id)} />
            ))}
          </div>

          {sprintTasks.length > 0 && (
            <>
              <div className="subhead">Sprint work — plan into your week</div>
              <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
                <div className="flex items-center justify-end gap-1 px-2 pt-1.5">
                  <button
                    className="btn ghost sm"
                    style={{ minWidth: 32, minHeight: 32 }}
                    aria-label="Previous week"
                    title="Previous week"
                    disabled={wkOff === 0}
                    onClick={() => setWkOff((o) => Math.max(0, o - 1))}
                  >
                    ‹
                  </button>
                  <span
                    className="text-[11px]"
                    style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)', minWidth: 64, textAlign: 'center' }}
                  >
                    {wkLabel}
                  </span>
                  <button
                    className="btn ghost sm"
                    style={{ minWidth: 32, minHeight: 32 }}
                    aria-label="Next week"
                    title="Next week"
                    onClick={() => setWkOff((o) => o + 1)}
                  >
                    ›
                  </button>
                </div>
                {sprintTasks.map((e) => {
                  const sp = e.sprintId ? sprintById.get(e.sprintId) : undefined
                  const pr = sp ? projectById.get(sp.projectId) : undefined
                  return (
                    <div key={e.id} className="litem flex-wrap" style={entryStyle(e)}>
                      <span className="txt">
                        {e.text}
                        {(pr || sp) && (
                          <span style={{ color: 'var(--ink-faint)', fontSize: 11, marginLeft: 6 }}>
                            {pr?.name}
                            {sp ? ` · ${sp.name}` : ''}
                          </span>
                        )}
                      </span>
                      <span className="flex gap-0.5">
                        {DOW.map((d, i) => {
                          const dayIso = isoDate(week[i])
                          return (
                            <button
                              key={i}
                              className="btn ghost sm"
                              style={{ minWidth: 26, padding: '3px 5px' }}
                              title={`Schedule ${d} ${week[i].getDate()}`}
                              disabled={dayIso < todayIso}
                              onClick={() => actions.scheduleEntryToDate(e.id, dayIso)}
                            >
                              {d[0]}
                            </button>
                          )
                        })}
                      </span>
                      <button className="chk" role="checkbox" aria-checked={false} title="Mark done" onClick={() => actions.updateLogEntry(e.id, { state: 'done' })}>
                        <Check />
                      </button>
                    </div>
                  )
                })}
                <div className="hint">Tap a day (‹ › pages weeks) to schedule it there — the task moves to that day's Planner column.</div>
              </div>
            </>
          )}

          {inbox.length > 0 && (
            <>
              <div className="subhead">Inbox · {inbox.length} unprocessed</div>
              <SortableContext id="index-inbox" items={inbox.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-1.5">
                  {inbox.map((e) => (
                    <IndexInboxRow key={e.id} e={e} entryStyle={entryStyle} />
                  ))}
                </div>
              </SortableContext>
            </>
          )}
        </div>
      </DndContext>
    )
  }

  // ---------- project board ----------
  const backlog = data.logEntries
    .filter((e) => e.projectId === project.id && !e.sprintId)
    .sort((a, b) => a.boardPosition - b.boardPosition)
  const tasksBySprint = new Map(
    sprints.map((s) => [
      s.id,
      data.logEntries.filter((e) => e.sprintId === s.id).sort((a, b) => a.boardPosition - b.boardPosition),
    ]),
  )

  function handleBoardDragEnd(evt: DragEndEvent) {
    const { active, over } = evt
    if (!over || !project) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const sortableData = over.data.current as { sortable?: { containerId: string } } | undefined
    const dest = sortableData?.sortable?.containerId ?? overId
    if (dest !== 'inbox' && dest !== 'backlog' && !sprints.some((s) => s.id === dest)) return

    const columnItems =
      dest === 'inbox' ? inbox : dest === 'backlog' ? backlog : (tasksBySprint.get(dest) ?? [])
    const destIds = columnItems.map((e) => e.id).filter((id) => id !== activeId)
    let index = destIds.indexOf(overId)
    if (index === -1) index = destIds.length
    actions.moveBoardEntry(project.id, { id: activeId, dest, index })
  }

  return (
    <div>
      <div className="view-head mb-[14px] flex flex-wrap items-baseline gap-[14px]">
        <div className="flex flex-1 items-baseline gap-2.5">
          <button className="btn ghost sm" onClick={() => setSel(null)}>
            ← Projects
          </button>
          <h2>{project.name}</h2>
          <StatusPill status={project.status} onClick={() => actions.updateProject(project.id, { status: PROJECT_NEXT[project.status] })} />
        </div>
        <button
          className="btn ghost sm"
          onClick={() => {
            if (confirm(`Delete project "${project.name}"? Its sprints go too; tasks return to the inbox.`)) {
              actions.deleteProject(project.id)
              setSel(null)
            }
          }}
        >
          Delete
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleBoardDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          <Column
            id="inbox"
            title={`Inbox · ${inbox.length}`}
            collapsed={!!collapsed['inbox']}
            onToggleCollapse={() => toggleCollapse('inbox')}
            itemIds={inbox.map((e) => e.id)}
          >
            {inbox.length === 0 && <div className="hint p-1">Empty — nothing to process.</div>}
            {inbox.map((e) => (
              <EntryCard key={e.id} e={e} entryStyle={entryStyle} onToggleDone={onToggleDone} onDelete={onDelete} />
            ))}
          </Column>

          <Column
            id="backlog"
            title={`Backlog · ${backlog.length}`}
            collapsed={!!collapsed[`${project.id}:backlog`]}
            onToggleCollapse={() => toggleCollapse(`${project.id}:backlog`)}
            itemIds={backlog.map((e) => e.id)}
          >
            {backlog.map((e) => (
              <EntryCard key={e.id} e={e} entryStyle={entryStyle} onToggleDone={onToggleDone} onDelete={onDelete} />
            ))}
            {addRow('backlog', null)}
          </Column>

          {sprints.map((s) => {
            const tasks = tasksBySprint.get(s.id) ?? []
            const done = tasks.filter((e) => e.state === 'done').length
            return (
              <Column
                key={s.id}
                id={s.id}
                title={`${s.name} · ${done}/${tasks.length}`}
                extra={<StatusPill status={s.status} onClick={() => actions.updateSprint(s.id, { status: SPRINT_NEXT[s.status] })} />}
                collapsed={!!collapsed[`${project.id}:${s.id}`]}
                onToggleCollapse={() => toggleCollapse(`${project.id}:${s.id}`)}
                itemIds={tasks.map((e) => e.id)}
              >
                {tasks.map((e) => (
                  <EntryCard key={e.id} e={e} entryStyle={entryStyle} onToggleDone={onToggleDone} onDelete={onDelete} />
                ))}
                {addRow(s.id, s.id)}
              </Column>
            )
          })}

          <div className="flex w-[220px] flex-none flex-col gap-1.5">
            <div className="flex gap-1.5">
              <input
                className="qi flex-1"
                placeholder="New sprint…"
                maxLength={80}
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSprint()}
              />
              <button className="btn ghost sm" onClick={addSprint}>
                ＋
              </button>
            </div>
            <div className="hint p-0">Add sprints left→right in the order you'll run them.</div>
          </div>
        </div>
      </DndContext>
    </div>
  )
}

// A Project tile on the index page — also a drop target for filing an Inbox
// row directly into its Backlog (#26).
function ProjectTile({
  project,
  sprintCount,
  taskCount,
  onOpen,
}: {
  project: Project
  sprintCount: number
  taskCount: number
  onOpen: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: project.id })
  return (
    <button
      ref={setNodeRef}
      className="rounded-xl border p-4 text-left"
      style={{ background: 'var(--card)', borderColor: isOver ? 'var(--accent)' : 'var(--line)' }}
      onClick={onOpen}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
          {project.name}
        </span>
        <StatusPill status={project.status} />
      </div>
      <div className="text-[12px]" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
        {sprintCount} sprints · {taskCount} tasks
      </div>
    </button>
  )
}

// An Inbox row on the Projects index page — draggable onto a Project tile to
// file it (#26); dropping it doesn't reorder anything on this page itself.
function IndexInboxRow({ e, entryStyle }: { e: LogEntry; entryStyle: (e: LogEntry) => Record<string, string> | undefined }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: e.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className="flex touch-none items-center gap-2 rounded-md border px-2 py-1.5"
      style={{
        borderColor: 'var(--line-soft)',
        background: 'var(--paper)',
        ...entryStyle(e),
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
    >
      <span className="bullet" style={{ fontFamily: 'var(--mono)', width: 16, color: 'var(--ink-faint)' }}>
        {bullet(e.kind, e.state)}
      </span>
      <span className="flex-1 text-[13px]">{e.text}</span>
      <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
        drag onto a project, or open one to file →
      </span>
    </div>
  )
}
