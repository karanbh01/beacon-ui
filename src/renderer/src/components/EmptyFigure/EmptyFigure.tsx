import { useEffect, useRef, type ReactElement } from 'react'
import { mountFigure, type FigureKind } from './mountFigure'
import './EmptyFigure.css'

export type { FigureKind } from './mountFigure'

/**
 * An isometric line figure for an empty state (BU-231): the thing that would
 * hold what is missing, holding none of it.
 *
 * Hairline figures (MIT), which draw into an svg and run on their own frame
 * loop; they answer the pointer, settle when left, sleep offscreen and hold
 * still under reduced motion. Decoration: the message beside it says what
 * is empty, so it is hidden from assistive technology.
 */
export function EmptyFigure({ kind }: { kind: FigureKind }): ReactElement {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (element === null) return
    const figure = mountFigure(kind, element)
    return () => {
      figure.destroy()
    }
  }, [kind])

  return (
    <div className="empty-figure" aria-hidden="true">
      <div ref={host} className="empty-figure-stage" />
    </div>
  )
}
