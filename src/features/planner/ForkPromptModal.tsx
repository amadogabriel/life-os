import { Modal } from '../../components/Modal'

/** Calendar-style ask-on-first-edit for a projected future day (ADR-0002):
 *  "Just this ⟨date⟩" forks the whole day into its own Day Plan; "Every
 *  ⟨weekday⟩" edits the weekday Template as before. Only still-projected
 *  future days ever show this — today and past days never prompt, and an
 *  already-forked day takes edits silently. Big tap targets on purpose. */
export function ForkPromptModal({
  dayName,
  dateLabel,
  onJustThis,
  onEveryWeek,
  onClose,
}: {
  dayName: string // e.g. "Thursday"
  dateLabel: string // e.g. "Thu, Jul 23"
  onJustThis: () => void
  onEveryWeek: () => void
  onClose: () => void
}) {
  return (
    <Modal title="Change this day?" onClose={onClose}>
      <p className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
        {dateLabel} still follows the {dayName} Template. Where should your change go?
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {/* NB: not `className="block"` on the inner spans — that's the planner
            grid's absolutely-positioned block card style. */}
        <button className="btn primary flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5" onClick={onJustThis}>
          <span>Just this {dateLabel}</span>
          <span className="text-[11px] font-normal opacity-75">
            ⑂ this date gets its own plan and stops following the Template
          </span>
        </button>
        <button className="btn flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5" onClick={onEveryWeek}>
          <span>Every {dayName}</span>
          <span className="text-[11px] font-normal opacity-75">edit the weekday Template, as usual</span>
        </button>
        <button className="btn ghost min-h-[44px] w-full" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
