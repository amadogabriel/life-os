import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { agendaItems, bullet } from '../../lib/planner'
import type { PlannerActions, PlannerData } from '../../lib/queries/planner'

/**
 * Fill and manage a Container's **Agenda** for one specific date (ADR-0006):
 * the ordered list of task Log Entries parented to Container Block `blockId`
 * on `dateIso`. Filling here writes Dated one-offs (block_id + isAgendaItem) —
 * it never forks the day (US-13). Ad-hoc typing lands a brand-new task (#32);
 * later slices add a Sprint/Backlog/Inbox picker (#33), reorder (#34) and
 * check-off (#36).
 */
export function AgendaModal({
  data,
  actions,
  blockId,
  dateIso,
  title,
  onClose,
}: {
  data: PlannerData
  actions: PlannerActions
  blockId: string
  dateIso: string
  title: string
  onClose: () => void
}) {
  const items = agendaItems(data.logEntries, blockId, dateIso)
  const [text, setText] = useState('')

  async function add() {
    const t = text.trim()
    if (!t) return
    setText('')
    await actions.addAgendaItem(blockId, dateIso, t)
  }

  return (
    <Modal title={`▤ ${title} · Agenda`} onClose={onClose}>
      <p className="text-[11px] text-[var(--ink-faint)] mb-2">
        Fill this chunk with what you'll attack, in priority order — worked top-to-bottom across the
        block's single span (no per-task timing). Filling never forks the day.
      </p>
      {items.length === 0 ? (
        <p className="text-[12px] text-[var(--ink-soft)] italic mb-2">Empty — nothing filled in yet.</p>
      ) : (
        <ul className="agenda-list">
          {items.map((e) => {
            const sprint = e.sprintId ? data.sprints.find((s) => s.id === e.sprintId) : undefined
            const project = e.projectId ? data.projects.find((p) => p.id === e.projectId) : undefined
            const src = sprint?.name ?? project?.name
            return (
              <li key={e.id} className={`agenda-row${e.state === 'done' ? ' done' : ''}`}>
                <span className="bl">{bullet(e.kind, e.state)}</span>
                <span className="tx">{e.text}</span>
                {src ? <span className="src">{src}</span> : null}
              </li>
            )
          })}
        </ul>
      )}
      <div className="field mt-2">
        <label>Add an ad-hoc task</label>
        <input
          type="text"
          maxLength={120}
          value={text}
          placeholder="e.g. call the plumber"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void add()
            }
          }}
        />
      </div>
      <div className="mt-[18px] flex items-center gap-2">
        <div className="flex-1" />
        <button className="btn ghost" onClick={onClose}>
          Done
        </button>
        <button className="btn primary" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>
    </Modal>
  )
}
