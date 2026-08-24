import type { DragEvent, ReactElement } from 'react'
import { ChainIcon } from '../../icons/generated'
import { TAB_MIME } from './dragTab'
import './Tab.css'

/**
 * A chip means the tab is bound to an object (taxonomy 2). The chain inside
 * it means "this value follows something else" — a pinned document, or
 * another tab's live subject.
 */
export type TabChip =
  | { kind: 'pin'; target: string }
  /**
   * `linked` marks BOTH ends of a link, not just the follower (BU-108). A
   * link is a relationship between two tabs and the chain is how it is
   * visible; showing it on one end only made the other look independent.
   */
  | { kind: 'query'; subject: string; linked?: boolean }

export interface TabProps {
  label: string
  active?: boolean
  /** Unsaved changes on a document. Never combined with a chip. */
  dirty?: boolean
  chip?: TabChip
  onSelect?: () => void
  /**
   * Makes the chip a control rather than decoration (BU-108). The chip is
   * where linking is expressed, so it is where linking is changed.
   *
   * The chip's own rect goes with it: the tab strip clips overflow so it can
   * scroll sideways, so whatever opens has to be drawn outside the strip and
   * needs to know where the chip is.
   */
  onChipClick?: (anchor: DOMRect) => void
  /**
   * Makes the chain itself the unlink control (BU-109). Present only when
   * this tab is in a link — breaking one is a single act, so it gets a single
   * click rather than a menu.
   */
  onUnlink?: () => void
  /** Omit to make the tab unclosable, e.g. a pinned global tool. */
  onClose?: () => void
  /** Workspace id, carried by a drag so another strip can claim it (BU-55). */
  dragId?: string
  onDragStateChange?: (dragging: boolean) => void
  className?: string
}

function Chip({
  chip,
  onClick,
  onUnlink
}: {
  chip: TabChip
  onClick?: (anchor: DOMRect) => void
  onUnlink?: () => void
}): ReactElement {
  const name = chip.kind === 'pin' ? chip.target : chip.subject
  const chained = chip.kind === 'pin' || chip.linked === true
  const label = chip.kind === 'pin' ? chip.target : chip.subject
  const kindClass = chip.kind === 'pin' ? 'tab-chip-pin' : 'tab-chip-query'

  return (
    <span className={`tab-chip ${kindClass}`}>
      {chained &&
        (onUnlink === undefined ? (
          <ChainIcon size={9} className="tab-chip-chain" />
        ) : (
          <button
            type="button"
            className="tab-chip-unlink"
            aria-label={`Unlink ${name}`}
            onClick={onUnlink}
          >
            <ChainIcon size={9} className="tab-chip-chain" />
          </button>
        ))}

      {onClick === undefined ? (
        <span className="tab-chip-label">{label}</span>
      ) : (
        <button
          type="button"
          className="tab-chip-label tab-chip-button"
          aria-label={`Link ${name}`}
          aria-haspopup="menu"
          onClick={(event) => {
            // The chip's own rect, not the label's: the menu should hang off
            // the whole bubble.
            const box = event.currentTarget.parentElement ?? event.currentTarget
            onClick(box.getBoundingClientRect())
          }}
        >
          {label}
        </button>
      )}
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
  onChipClick,
  onUnlink,
  onClose,
  dragId,
  onDragStateChange,
  className
}: TabProps): ReactElement {
  const classes = ['tab', active && 'tab-active', className].filter(Boolean).join(' ')

  const handleDragStart = (event: DragEvent<HTMLDivElement>): void => {
    if (dragId === undefined) return
    event.dataTransfer.setData(TAB_MIME, dragId)
    event.dataTransfer.effectAllowed = 'move'
    onDragStateChange?.(true)
  }

  return (
    <div
      className={classes}
      data-active={active}
      draggable={dragId !== undefined}
      onDragStart={handleDragStart}
      onDragEnd={() => {
        onDragStateChange?.(false)
      }}
    >
      <button type="button" className="tab-select" onClick={onSelect} aria-current={active}>
        <span className="tab-label">{label}</span>
        {/* Muted, not accent — the pane header states dirtiness loudly, the
            tab only needs to mark it. */}
        {dirty && <span className="tab-dirty" aria-label="unsaved changes" />}
      </button>
      {/*
        Outside the select button, because a button inside a button is not
        valid HTML and screen readers do unpredictable things with it. The
        padding moved to `.tab` so the geometry is unchanged.
      */}
      {chip !== undefined && (
        <Chip
          chip={chip}
          {...(onChipClick === undefined ? {} : { onClick: onChipClick })}
          {...(onUnlink === undefined ? {} : { onUnlink })}
        />
      )}
      {onClose !== undefined && (
        <button type="button" className="tab-close" onClick={onClose} aria-label={`Close ${label}`}>
          &times;
        </button>
      )}
    </div>
  )
}
