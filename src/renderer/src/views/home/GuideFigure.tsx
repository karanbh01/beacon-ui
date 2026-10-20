import { useEffect, useRef, type ReactElement } from 'react'
import { mountFigure, type GuideFigureKind } from '../../components/EmptyFigure/mountFigure'
import '../../components/EmptyFigure/EmptyFigure.css'

/**
 * A guide card's figure (Karan, 2026-10-20), drawn as the empty states are:
 * a Hairline line figure that answers the pointer and sleeps offscreen.
 * Decoration, as the card's title says what the guide is.
 */
export function GuideFigure({ kind }: { kind: GuideFigureKind }): ReactElement {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (element === null) return
    const figure = mountFigure(kind, element)
    return () => {
      figure.destroy()
    }
  }, [kind])

  return <div ref={host} className="home-guide-figure figure-palette" aria-hidden="true" />
}
