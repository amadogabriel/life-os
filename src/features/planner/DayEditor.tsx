import { useRef, useState } from 'react'
import type { Bucket, PlannerActions, PlannerData } from '../../lib/queries/planner'
import { blockStyle, depthClass, isTraceStale, placedBlockFields, stripeVar } from '../../lib/planner'
import { Modal } from '../../components/Modal'
import { TimelineEditor } from '../../components/TimelineEditor'
import { BucketModal } from '../design/BucketModal'

/** Design-a-day-style editor for one weekday: the day's blocks on a
 *  proportional timeline (drag to reorder, drag the bottom edge to resize,
 *  drag the top edge to move-and-pin the start, all in 30-min snaps), plus
 *  the bucket palette to tap-add or drag-in tasks.
 *
 *  With `forkDate` set it edits that date's Day Plan (whole-day fork) instead
 *  of the weekday Template — same editor, edits routed to the fork's dated
 *  Blocks (silently: the fork decision was already made).
 *
 *  With `lazyForkDate` set (and `forkDate` unset) it previews the weekday
 *  Template for a still-projected date and forks the day on the first mutating
 *  edit — so opening it and closing it untouched leaves the day unforked
 *  (ADR-0002: "looking around never creates data"). */
export function DayEditor({
  data,
  actions,
  dow,
  forkDate,
  lazyForkDate,
  onClose,
  onEditBlock,
}: {
  data: PlannerData
  actions: PlannerActions
  dow: number
  forkDate?: string // ISO date of the Day Plan (fork) being edited
  lazyForkDate?: string // ISO date of a projected day to fork on first edit
  onClose: () => void
  onEditBlock: (blockId: string, forkDate?: string) => void
}) {
  const [editingBucket, setEditingBucket] = useState<Bucket | 'new' | null>(null)
  // Null until this day is a fork — either it was opened as one (`forkDate`) or
  // a lazy edit just created it. Once set, every edit routes to the fork.
  const [forkedDate, setForkedDate] = useState<string | null>(forkDate ?? null)
  const idMap = useRef<Record<string, string>>({})
  const activeFork = forkedDate
  const blocks = activeFork ? (data.dayForks[activeFork] ?? []) : data.blocksByDow[dow]

  /** The fork date edits should target — forking a lazy projected day on first
   *  use. Returns null when editing the weekday Template ("Every weekday"). */
  async function targetFork(): Promise<string | null> {
    if (activeFork) return activeFork
    if (!lazyForkDate) return null
    idMap.current = await actions.forkDay(lazyForkDate)
    setForkedDate(lazyForkDate)
    return lazyForkDate
  }
  /** Retarget a Template block id to its fork copy once the day has forked. */
  const mapId = (id: string) => idMap.current[id] ?? id

  const addBlock = async (position: number) => {
    const fd = await targetFork()
    return fd ? actions.addForkBlock(fd, position) : actions.addBlock(dow, position)
  }
  const reorderBlocks = async (ids: string[]) => {
    const fd = await targetFork()
    return fd ? actions.reorderForkBlocks(fd, ids.map(mapId)) : actions.reorderBlocks(dow, ids)
  }
  const updateBlock = async (id: string, fields: Parameters<PlannerActions['updateBlock']>[1]) => {
    await targetFork()
    return actions.updateBlock(mapId(id), fields)
  }
  const removeBlock = async (id: string) => {
    // X reads as "delete this block", not "fork this date": on an un-customized
    // day (weekday Template or a still-projected future day) the block IS a
    // Template block, so delete it there — it leaves that weekday everywhere.
    // Only once the day is already a fork does deletion stay scoped to the
    // fork's own copy. (Deliberate divergence from the fork-on-first-edit rule
    // the other handlers follow — deleting shouldn't silently spawn a fork.)
    if (activeFork) return actions.deleteBlock(mapId(id))
    return actions.deleteBlock(id)
  }
  const editBlock = async (id: string) => {
    const fd = await targetFork()
    onEditBlock(mapId(id), fd ?? undefined)
  }
  const title = activeFork
    ? `⑂ ${data.days[dow].name.slice(0, 3)} ${new Date(`${activeFork}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · edit this day only`
    : `${data.days[dow].name} · edit day`

  async function addFromChip(bucketId: string, taskId: string): Promise<string | null> {
    const bucket = data.buckets.find((bk) => bk.id === bucketId)
    const task = bucket?.tasks.find((t) => t.id === taskId)
    if (!bucket || !task) return null
    // addBlock forks first if lazy and returns the new block's real id.
    const id = await addBlock(blocks.length)
    // placedBlockFields records the source Bucket (`cat` is stamped derived
    // data) AND carries the task's Traces (#20/#21) onto the block, so the chip
    // is pre-linked: checking it off logs the habit, its entry accrues to the
    // project.
    await actions.updateBlock(id, placedBlockFields(bucket, task))
    return id
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="grid items-start gap-3 max-md:grid-cols-1 md:grid-cols-[1fr_240px]">
        <div className="daycard" style={{ maxHeight: 'calc(90vh - 180px)', overflowY: 'auto' }}>
          <TimelineEditor
            items={blocks}
            buckets={data.buckets}
            onSetMins={(id, mins) => updateBlock(id, { durMin: mins })}
            onSetStart={(id, startMin) => updateBlock(id, { startMin })}
            onReorder={(ids) => reorderBlocks(ids)}
            onRemove={(id) => removeBlock(id)}
            onTitleClick={editBlock}
            onDropExternal={async (payload, at) => {
              const [bk, task] = payload.split('|')
              const id = await addFromChip(bk, task)
              if (id && at < blocks.length) {
                const ids = blocks.map((b) => b.id)
                ids.splice(at, 0, id)
                await reorderBlocks(ids)
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-3" style={{ maxHeight: 'calc(90vh - 180px)', overflowY: 'auto' }}>
          {data.buckets.map((bk) => (
            <div key={bk.id} className="bucket shrink-0">
              <div className="bucket-head">
                <span className={`hname s-${bk.cat}`} style={stripeVar(blockStyle({ bucketId: bk.id, cat: bk.cat }, data.buckets))}>
                  <span className="dot" />
                  {bk.name}
                </span>
                <button className="bk-edit" title="Edit bucket" onClick={() => setEditingBucket(bk)}>
                  ⋯
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 p-[11px_13px]">
                {bk.tasks.map((tk) => {
                  const stale = isTraceStale(tk, data.projects, data.sprints)
                  return (
                    <button
                      key={tk.id}
                      className={`chip s-${bk.cat}${depthClass(tk.deep)}`}
                      style={{
                        ...stripeVar(blockStyle({ bucketId: bk.id, cat: bk.cat }, data.buckets)),
                        ...(stale ? { opacity: 0.55, borderStyle: 'dashed' } : undefined),
                      }}
                      title={
                        stale
                          ? 'Trace stale — its sprint is done or project archived; re-point it'
                          : tk.habitId || tk.projectId
                            ? 'Traced task'
                            : undefined
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', bk.id + '|' + tk.id)
                        e.dataTransfer.effectAllowed = 'copy'
                      }}
                      onClick={() => addFromChip(bk.id, tk.id)}
                    >
                      {tk.deep ? '▲ ' : ''}
                      {tk.name}
                      {/* Subtle trace markers: ↻ habit-traced, ◇ project-traced, ⚠ stale. */}
                      {tk.habitId && (
                        <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.75 }} title="Habit-traced">
                          ↻
                        </span>
                      )}
                      {tk.projectId && (
                        <span style={{ marginLeft: 3, fontSize: 10, opacity: 0.75 }} title="Project-traced">
                          ◇
                        </span>
                      )}
                      {stale && (
                        <span style={{ marginLeft: 3, fontSize: 10 }} title="Trace stale — re-point">
                          ⚠
                        </span>
                      )}
                      <span className="add">＋</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <button
            className="addbucket shrink-0"
            onClick={async () => {
              const fd = await targetFork()
              const id = fd ? await actions.addForkBlock(fd, blocks.length) : await actions.addBlock(dow, blocks.length)
              onEditBlock(id, fd ?? undefined)
            }}
          >
            + Custom block
          </button>
          <button className="addbucket shrink-0" onClick={() => setEditingBucket('new')}>
            + New bucket
          </button>
        </div>
      </div>
      {editingBucket && (
        <BucketModal
          bucket={editingBucket === 'new' ? null : editingBucket}
          habits={data.habits}
          projects={data.projects}
          sprints={data.sprints}
          onSave={async (b) => {
            await actions.saveBucket(b, data.buckets.length)
            setEditingBucket(null)
          }}
          onDelete={async (id) => {
            await actions.deleteBucket(id)
            setEditingBucket(null)
          }}
          onClose={() => setEditingBucket(null)}
        />
      )}
      <div className="mt-[14px] flex justify-end">
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
