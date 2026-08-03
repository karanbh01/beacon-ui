import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { fittingAlign, type PopoverAlign } from './popoverAlign'
import './Popover.css'

export interface PopoverProps {
  open: boolean
  onClose: () => void
  /** Labels the surface for assistive tech; every chrome popover has a title. */
  label: string
  /**
   * Which edge it hangs from. `start` opens rightward from its trigger, `end`
   * leftward. Whichever is asked for, it flips when that direction would run
   * off the window — see below.
   */
  align?: PopoverAlign
  className?: string
  children: ReactNode
}

export function Popover({
  open,
  onClose,
  label,
  align = 'end',
  className,
  children
}: PopoverProps): ReactElement | null {
  const surface = useRef<HTMLDivElement>(null)
  const [placed, setPlaced] = useState<PopoverAlign>(align)

  // Before paint, so a panel that has to flip never renders in the wrong
  // place first. Measured against the trigger's box, not the panel's own
  // left edge, which has already been positioned by the requested align.
  useLayoutEffect(() => {
    if (!open) return
    const node = surface.current
    const anchor = node?.parentElement
    if (node === null || anchor === undefined || anchor === null) return

    const box = anchor.getBoundingClientRect()
    setPlaced(
      fittingAlign(
        align,
        { left: box.left, right: box.right, width: node.offsetWidth },
        window.innerWidth
      )
    )
  }, [open, align])

  // Reopening should re-measure rather than reuse the last answer, since the
  // trigger may have moved in the meantime.
  useEffect(() => {
    if (!open) setPlaced(align)
  }, [open, align])

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
      className={['popover', `popover-${placed}`, className].filter(Boolean).join(' ')}
      role="dialog"
      aria-label={label}
    >
      {children}
    </div>
  )
}
