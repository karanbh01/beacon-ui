import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import './Popover.css'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** Labels the surface for assistive tech; every chrome popover has a title. */
  label: string
  /** Right-aligned under its trigger by default; the search panel overrides. */
  align?: 'start' | 'end'
  className?: string
  children: ReactNode
}

/**
 * The glass surface all three chrome popovers share (Figma 119:2, 145:3460,
 * 147:13): a `--glass` fill, a 0.5px border overlay and a soft drop shadow.
 *
 * Dismissal lives here rather than in each panel, because getting it wrong is
 * the same bug three times: Escape must close, a click outside must close, and
 * a click *inside* must not. `pointerdown` rather than `click` — a click fires
 * after the mouse is released, so a drag that starts inside and ends outside
 * would otherwise close the panel mid-interaction.
 */
export function Popover({
  open,
  onClose,
  label,
  align = 'end',
  className,
  children
}: PopoverProps): ReactElement | null {
  const surface = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }

    const onPointerDown = (event: PointerEvent): void => {
      const node = surface.current
      if (node === null || !(event.target instanceof Node)) return
      // The trigger handles its own toggle; closing here too would reopen it.
      if (node.contains(event.target) || node.parentElement?.contains(event.target) === true) return
      onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={surface}
      className={['popover', `popover-${align}`, className].filter(Boolean).join(' ')}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  )
}
