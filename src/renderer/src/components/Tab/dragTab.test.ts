import { describe, expect, it } from 'vitest'
import { carriesTab, dropIndexAt, dropMarkerX, paneDropTarget, TAB_MIME } from './dragTab'

/** Three tabs of deliberately different widths, laid out end to end. */
const RECTS = [
  { left: 100, width: 80, right: 180 },
  { left: 180, width: 140, right: 320 },
  { left: 320, width: 60, right: 380 }
] as DOMRect[]

describe('dropIndexAt', () => {
  it('lands before a tab while the cursor is in its first half', () => {
    expect(dropIndexAt(RECTS, 120)).toBe(0)
    expect(dropIndexAt(RECTS, 200)).toBe(1)
  })

  it('lands after a tab once the cursor passes its midpoint', () => {
    // 260 is past the middle of the wide second tab (180 + 70 = 250).
    expect(dropIndexAt(RECTS, 260)).toBe(2)
  })

  it('measures midpoints rather than dividing the strip evenly', () => {
    // At 190 an even split would say index 1 of 3 — a third of the way along
    // 100..380 is 193. The wide middle tab makes the honest answer 1 as well
    // only by coincidence, so check the case that separates them: 310 is in
    // the last quarter of the strip but still inside tab 2.
    expect(dropIndexAt(RECTS, 310)).toBe(2)
    expect(dropIndexAt(RECTS, 340)).toBe(2)
    expect(dropIndexAt(RECTS, 360)).toBe(3)
  })

  it('drops at the end past the last tab', () => {
    expect(dropIndexAt(RECTS, 900)).toBe(3)
  })

  it('drops into an empty strip at index 0', () => {
    expect(dropIndexAt([], 400)).toBe(0)
  })
})

describe('dropMarkerX', () => {
  it('marks the leading edge of the tab that would be pushed along', () => {
    expect(dropMarkerX(RECTS, 1)).toBe(180)
  })

  it('marks the end of the strip for a drop past the last tab', () => {
    expect(dropMarkerX(RECTS, 3)).toBe(380)
  })

  it('marks the origin of an empty strip', () => {
    expect(dropMarkerX([], 0)).toBe(0)
  })
})

describe('carriesTab', () => {
  it('accepts our own type and nothing else', () => {
    expect(carriesTab([TAB_MIME])).toBe(true)
    // A file or a text selection dragged onto a strip is not a tab.
    expect(carriesTab(['Files', 'text/plain'])).toBe(false)
  })
})

describe('paneDropTarget', () => {
  /** A 16px strip at the top of a pane that runs down to y=600. */
  const BAR = { top: 100, bottom: 116 } as DOMRect

  it('reads a position out of a drop on the strip', () => {
    const target = paneDropTarget(BAR, RECTS, 200, 108)
    expect(target.index).toBe(1)
    expect(target.markerX).toBe(180)
  })

  it('appends a drop on the pane body, and marks nothing', () => {
    // BU-70: the whole pane accepts the tab, but there is no gap between two
    // tabs to point at when the cursor is halfway down a table.
    const target = paneDropTarget(BAR, RECTS, 200, 400)
    expect(target.index).toBe(RECTS.length)
    expect(target.markerX).toBeUndefined()
  })

  it('appends into an empty pane', () => {
    expect(paneDropTarget(BAR, [], 200, 400)).toEqual({ index: 0 })
  })

  it('treats a pane with no strip on screen as body-only', () => {
    expect(paneDropTarget(undefined, RECTS, 200, 108).markerX).toBeUndefined()
  })
})
