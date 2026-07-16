import { useState } from 'react'
import type { ViewProps } from '../../App'
import { Check } from '../../components/Check'
import {
  bullet,
  catStyles,
  DOW,
  isoDate,
  stripeVar,
  weekDates,
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

export function ProjectsView({ data, actions, today }: ViewProps) {
  const [sel, setSel] = useState<string | null>(null)
  const [pName, setPName] = useState('')
  const [sName, setSName] = useState('')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const styles = catStyles(data.buckets)
  const todayIso = isoDate(today)

  const projects = [...data.projects].sort((a, b) => a.position - b.position)
  const project = projects.find((p) => p.id === sel) ?? null
  const sprints = project
    ? data.sprints.filter((s) => s.projectId === project.id).sort((a, b) => a.position - b.position)
    : []

  // The bullet-journal inbox: open tasks/notes not yet processed into a project.
  const inbox = data.logEntries
    .filter((e) => (e.kind === 'task' || e.kind === 'note') && e.state === 'open' && !e.projectId)
    .sort((a, b) => a.onDate.localeCompare(b.onDate))

  // Sprint work: open tasks from active sprints, planned into the current week.
  const week = weekDates(today)
  const activeSprintIds = new Set(data.sprints.filter((s) => s.status === 'active').map((s) => s.id))
  const sprintById = new Map(data.sprints.map((s) => [s.id, s]))
  const projectById = new Map(data.projects.map((p) => [p.id, p]))
  const sprintTasks = data.logEntries.filter(
    (e) => e.kind === 'task' && e.state === 'open' && e.sprintId && activeSprintIds.has(e.sprintId),
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
  function moveEntry(e: LogEntry, dest: string) {
    if (!project) return
    if (dest === 'inbox') return void actions.updateLogEntry(e.id, { projectId: null, sprintId: null })
    const sprintId = dest === 'backlog' ? null : dest
    const fields: Parameters<typeof actions.updateLogEntry>[1] = { projectId: project.id, sprintId }
    if (e.kind === 'note') fields.kind = 'task' // processing a note into a project makes it a task
    actions.updateLogEntry(e.id, fields)
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

  function EntryCard({ e, here }: { e: LogEntry; here: string }) {
    const done = e.state === 'done'
    return (
      <div
        className="flex items-center gap-2 rounded-md border px-2 py-1.5"
        style={{ borderColor: 'var(--line-soft)', background: 'var(--paper)', ...stripeVar(styles[e.cat]) }}
      >
        {e.kind === 'task' ? (
          <button
            className="bullet"
            title="Toggle done"
            onClick={() => actions.updateLogEntry(e.id, { state: done ? 'open' : 'done' })}
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
        <select
          className="qi"
          value={here}
          onChange={(ev) => moveEntry(e, ev.target.value)}
          style={{ padding: '2px 4px', fontSize: 11 }}
          title="Move"
        >
          <option value="inbox">Inbox</option>
          {project && <option value="backlog">Backlog</option>}
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="x" title="Delete" onClick={() => actions.deleteLogEntry(e.id)}>
          ✕
        </button>
      </div>
    )
  }

  const Column = ({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) => (
    <div
      className="flex w-[260px] flex-none flex-col gap-1.5 rounded-xl border p-2"
      style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
    >
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-[0.09em]" style={{ fontFamily: 'var(--mono)', color: 'var(--ink-faint)' }}>
          {title}
        </span>
        {extra}
      </div>
      {children}
    </div>
  )

  // ---------- project list ----------
  if (!project) {
    return (
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
            <button
              key={p.id}
              className="rounded-xl border p-4 text-left"
              style={{ background: 'var(--card)', borderColor: 'var(--line)' }}
              onClick={() => setSel(p.id)}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[15px] font-semibold" style={{ fontFamily: 'var(--serif)' }}>
                  {p.name}
                </span>
                <StatusPill status={p.status} />
              </div>
              <div className="text-[12px]" style={{ color: 'var(--ink-faint)', fontFamily: 'var(--mono)' }}>
                {sprintCountFor(p)} sprints · {countFor(p)} tasks
              </div>
            </button>
          ))}
        </div>

        {sprintTasks.length > 0 && (
          <>
            <div className="subhead">Sprint work — plan into your week</div>
            <div className="overflow-hidden rounded-xl border" style={{ background: 'var(--card)', borderColor: 'var(--line)' }}>
              {sprintTasks.map((e) => {
                const wk = week.findIndex((d) => isoDate(d) === e.onDate)
                const sp = e.sprintId ? sprintById.get(e.sprintId) : undefined
                const pr = sp ? projectById.get(sp.projectId) : undefined
                return (
                  <div key={e.id} className="litem flex-wrap" style={stripeVar(styles[e.cat])}>
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
                      {DOW.map((d, i) => (
                        <button
                          key={i}
                          className={'btn ghost sm' + (wk === i ? ' deep-on' : '')}
                          style={{ minWidth: 26, padding: '3px 5px' }}
                          title={`Schedule ${d}`}
                          onClick={() => actions.updateLogEntry(e.id, { onDate: isoDate(week[i]) })}
                        >
                          {d[0]}
                        </button>
                      ))}
                    </span>
                    {wk >= 0 && !e.blockId && (
                      <button className="btn ghost sm" title="Drop onto that day's timeline" onClick={() => actions.scheduleBlockFromEntry(e.id, wk)}>
                        ▸ block
                      </button>
                    )}
                    {e.blockId && (
                      <span className="text-[11px]" style={{ color: 'var(--accent)' }}>
                        ▸ blocked
                      </span>
                    )}
                    <button className="chk" role="checkbox" aria-checked={false} title="Mark done" onClick={() => actions.updateLogEntry(e.id, { state: 'done' })}>
                      <Check />
                    </button>
                  </div>
                )
              })}
              <div className="hint">Tap a day to schedule; ▸ block drops it onto that day's timeline.</div>
            </div>
          </>
        )}

        {inbox.length > 0 && (
          <>
            <div className="subhead">Inbox · {inbox.length} unprocessed</div>
            <div className="flex flex-col gap-1.5">
              {inbox.map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                  style={{ borderColor: 'var(--line-soft)', background: 'var(--paper)', ...stripeVar(styles[e.cat]) }}
                >
                  <span className="bullet" style={{ fontFamily: 'var(--mono)', width: 16, color: 'var(--ink-faint)' }}>
                    {bullet(e.kind, e.state)}
                  </span>
                  <span className="flex-1 text-[13px]">{e.text}</span>
                  <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>
                    open a project to file →
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ---------- project board ----------
  const backlog = data.logEntries.filter((e) => e.projectId === project.id && !e.sprintId)
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

      <div className="flex gap-3 overflow-x-auto pb-2">
        <Column title={`Inbox · ${inbox.length}`}>
          {inbox.length === 0 && <div className="hint p-1">Empty — nothing to process.</div>}
          {inbox.map((e) => (
            <EntryCard key={e.id} e={e} here="inbox" />
          ))}
        </Column>

        <Column title={`Backlog · ${backlog.length}`}>
          {backlog.map((e) => (
            <EntryCard key={e.id} e={e} here="backlog" />
          ))}
          {addRow('backlog', null)}
        </Column>

        {sprints.map((s) => {
          const tasks = data.logEntries.filter((e) => e.sprintId === s.id)
          const done = tasks.filter((e) => e.state === 'done').length
          return (
            <Column
              key={s.id}
              title={`${s.name} · ${done}/${tasks.length}`}
              extra={<StatusPill status={s.status} onClick={() => actions.updateSprint(s.id, { status: SPRINT_NEXT[s.status] })} />}
            >
              {tasks.map((e) => (
                <EntryCard key={e.id} e={e} here={s.id} />
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
    </div>
  )
}
