import { useRef, type CSSProperties, type ReactElement } from 'react'
import { clampSplit, type SplitAxis } from '../state/chrome'

/** One arrow press. Fine enough to aim with, coarse enough to get somewhere. */
const NUDGE = 0.02

export interface PaneDividerProps {
  axis: SplitAxis
  /** The first track's share, 0..1. */
  value: number
  onChange: (value: number) => void
  onReset: () => void
  style?: CSSProperties
}

/** Fraction of the host the pointer is at, along this divider's axis. */
function fractionAt(host: DOMRect, axis: SplitAxis, x: number, y: number): number {
  return axis === 'x' ? (x - host.left) / host.width : (y - host.top) / host.height
}

/**
 * The draggable line between two panes (BU-69).
 *
 * Sits ON the 1px gap rather than inside a pane: it is a grid item in the
 * first track, pushed onto the boundary by a negative margin, so it is
 * 9px wide to the pointer and a hairline to the eye. Placing it inside a pane
 * would make it part of that pane's scroll region.
 *
 * Pointer capture is what makes the drag survive the cursor leaving those 9px,
 * which at any real dragging speed it does immediately.
 */
export function PaneDivider({
  axis,
  value,
  onChange,
  onReset,
  style
}: PaneDividerProps): ReactElement {
  const host = useRef<HTMLDivElement>(null)

  const trackFrom = (event: { clientX: number; clientY: number }): void => {
    const grid = host.current?.parentElement?.getBoundingClientRect()
    if (grid === undefined) return
    onChange(fractionAt(grid, axis, event.clientX, event.clientY))
  }

  const nudge = (by: number): void => {
    onChange(clampSplit(value + by))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
    const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown'

    if (event.key === back) nudge(-NUDGE)
    else if (event.key === forward) nudge(NUDGE)
    else if (event.key === 'Home' || event.key === 'End') onReset()
    else return

    event.preventDefault()
  }

  return (
    <div
      ref={host}
      className={`pane-divider pane-divider-${axis}`}
      style={style}
      role="separator"
      tabIndex={0}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={axis === 'x' ? 'Resize columns' : 'Resize rows'}
      aria-valuenow={Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      onPointerDown={(event) => {
        // Capture BEFORE the first move: without it the drag dies the moment
        // the cursor crosses into the pane on either side.
        event.currentTarget.setPointerCapture(event.pointerId)
        event.preventDefault()
      }}
      onPointerMove={(event) => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
        trackFrom(event)
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    />
  )
}
