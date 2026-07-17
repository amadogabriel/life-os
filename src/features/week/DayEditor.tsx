import { useState } from 'react'
import type { Bucket, PlannerActions, PlannerData } from '../../lib/queries/planner'
import { catStyles, stripeVar } from '../../lib/planner'
import { Modal } from '../../components/Modal'
import { TimelineEditor } from '../../components/TimelineEditor'
import { BucketModal } from '../design/BucketModal'

/** Design-a-day-style editor for one weekday: the day's blocks on a
 *  proportional timeline (drag to reorder, drag the bottom edge to resize in
 *  30-min snaps), plus the bucket palette to tap-add or drag-in tasks.
 *
 *  With `forkDate` set it edits that date's Day Plan (whole-day fork) instead
 *  of the weekday Template — same editor, edits routed to the fork's dated
 *  Blocks (silently: the fork decision was already made). */
export function DayEditor({
  data,
  actions,
  dow,
  forkDate,
  onClose,
  onEditBlock,
}: {
  data: PlannerData
  actions: PlannerActions
  dow: number
  forkDate?: string // ISO date of the Day Plan (fork) being edited
  onClose: () => void
  onEditBlock: (blockId: string) => void
}) {
  const [editingBucket, setEditingBucket] = useState<Bucket | 'new' | null>(null)
  const blocks = forkDate ? (data.dayForks[forkDate] ?? []) : data.blocksByDow[dow]
  const styles = catStyles(data.buckets)
  const addBlock = (position: number) =>
    forkDate ? actions.addForkBlock(forkDate, position) : actions.addBlock(dow, position)
  const reorderBlocks = (ids: string[]) =>
    forkDate ? actions.reorderForkBlocks(forkDate, ids) : actions.reorderBlocks(dow, ids)
  const title = forkDate
    ? `⑂ ${data.days[dow].name.slice(0, 3)} ${new Date(`${forkDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · edit this day only`
    : `${data.days[dow].name} · edit day`

  async function addFromChip(bucketId: string, taskId: string): Promise<string | null> {
    const bucket = data.buckets.find((bk) => bk.id === bucketId)
    const task = bucket?.tasks.find((t) => t.id === taskId)
    if (!bucket || !task) return null
    const id = await addBlock(blocks.length)
    await actions.updateBlock(id, {
      cat: bucket.cat,
      title: task.name,
      durMin: 60,
      anchored: false,
      deep: task.deep,
    })
    return id
  }

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="grid items-start gap-3 max-md:grid-cols-1 md:grid-cols-[1fr_240px]">
        <div className="daycard" style={{ maxHeight: 'calc(90vh - 180px)', overflowY: 'auto' }}>
          <TimelineEditor
            items={blocks}
            styles={styles}
            onSetMins={(id, mins) => actions.updateBlock(id, { durMin: mins })}
            onSetStart={(id, startMin) => actions.updateBlock(id, { startMin })}
            onReorder={(ids) => reorderBlocks(ids)}
            onRemove={(id) => actions.deleteBlock(id)}
            onTitleClick={onEditBlock}
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
                <span className={`hname s-${bk.cat}`} style={stripeVar(styles[bk.cat])}>
                  <span className="dot" />
                  {bk.name}
                </span>
                <button className="bk-edit" title="Edit bucket" onClick={() => setEditingBucket(bk)}>
                  ⋯
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 p-[11px_13px]">
                {bk.tasks.map((tk) => (
                  <button
                    key={tk.id}
                    className={`chip s-${bk.cat}`}
                    style={stripeVar(styles[bk.cat])}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', bk.id + '|' + tk.id)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => addFromChip(bk.id, tk.id)}
                  >
                    {tk.deep ? '▲ ' : ''}
                    {tk.name}
                    <span className="add">＋</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button
            className="addbucket shrink-0"
            onClick={async () => {
              const id = await addBlock(blocks.length)
              onEditBlock(id)
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
