import type { ReactElement } from 'react'
import { ChainIcon } from '../../icons/generated'
import './Tab.css'

/**
 * A chip means the tab is bound to an object (taxonomy 2). The chain inside
 * it means "this value follows something else" — a pinned document, or
 * another tab's live subject.
 */
export type TabChip =
  { kind: 'pin'; target: string } | { kind: 'query'; subject: string; linked?: boolean }

export interface TabProps {
  label: string
  active?: boolean
  /** Unsaved changes on a document. Never combined with a chip. */
  dirty?: boolean
  chip?: TabChip
  onSelect?: () => void
  /** Omit to make the tab unclosable, e.g. a pinned global tool. */
  onClose?: () => void
  className?: string
}

function Chip({ chip }: { chip: TabChip }): ReactElement {
  if (chip.kind === 'pin') {
    return (
      <span className="tab-chip tab-chip-pin">
        <ChainIcon size={9} className="tab-chip-chain" />
        <span className="tab-chip-label">{chip.target}</span>
      </span>
    )
  }
  return (
    <span className="tab-chip tab-chip-query">
      {chip.linked === true && <ChainIcon size={9} className="tab-chip-chain" />}
      <span className="tab-chip-label">{chip.subject}</span>
    </span>
  )
}

/**
 * Figma set 118:6, archetypes 229:4264. 34px tall, 14px horizontal padding,
 * active marked by a 2px accent underline rather than a fill.
 *
 * All six archetypes fall out of three independent props: a document is a
 * bare label, dirty adds the dot, and the chip carries pin/query/linked.
 */
export function Tab({
  label,
  active = false,
  dirty = false,
  chip,
  onSelect,
  onClose,
  className
}: TabProps): ReactElement {
  const classes = ['tab', active && 'tab-active', className].filter(Boolean).join(' ')

  return (
    <div className={classes} data-active={active}>
      <button type="button" className="tab-select" onClick={onSelect} aria-current={active}>
        <span className="tab-label">{label}</span>
        {/* Muted, not accent — the pane header states dirtiness loudly, the
            tab only needs to mark it. */}
        {dirty && <span className="tab-dirty" aria-label="unsaved changes" />}
        {chip !== undefined && <Chip chip={chip} />}
      </button>
      {onClose !== undefined && (
        <button type="button" className="tab-close" onClick={onClose} aria-label={`Close ${label}`}>
          &times;
        </button>
      )}
    </div>
  )
}
