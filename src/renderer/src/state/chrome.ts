import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The five arrangements in Figma's Layout Menu (119:2), drawn as 1.5px
 * outlined rectangles on a 24x24 grid. The rectangles ARE the spec — each
 * option's geometry is read straight off the component, so the control's
 * glyphs and the layout it names cannot drift apart.
 */
export interface LayoutPane {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutOption {
  id: string
  label: string
  panes: readonly LayoutPane[]
}

export const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  { id: 'single', label: 'Single pane', panes: [{ x: 0, y: 0, w: 24, h: 24 }] },
  {
    id: 'columns',
    label: 'Two columns',
    panes: [
      { x: 0, y: 0, w: 11, h: 24 },
      { x: 13, y: 0, w: 11, h: 24 }
    ]
  },
  {
    id: 'main-stack',
    label: 'Main pane with stack',
    panes: [
      { x: 0, y: 0, w: 11, h: 24 },
      { x: 13, y: 0, w: 11, h: 11 },
      { x: 13, y: 13, w: 11, h: 11 }
    ]
  },
  {
    id: 'grid',
    label: 'Four panes',
    panes: [
      { x: 0, y: 0, w: 11, h: 11 },
      { x: 13, y: 0, w: 11, h: 11 },
      { x: 0, y: 13, w: 11, h: 11 },
      { x: 13, y: 13, w: 11, h: 11 }
    ]
  },
  {
    id: 'banner',
    label: 'Full width above two',
    panes: [
      { x: 0, y: 0, w: 24, h: 11 },
      { x: 0, y: 13, w: 11, h: 11 },
      { x: 13, y: 13, w: 11, h: 11 }
    ]
  }
]

interface ChromeState {
  layout: string
  setLayout: (id: string) => void
}

/**
 * Chrome preferences that outlive a session.
 *
 * NOTE: choosing a layout records and reflects the choice, and does not yet
 * split the pane — PaneHost renders one pane per page, and multi-pane layout
 * is a substantial piece of work in its own right (#55). The control is
 * honest about what it is: a stored preference the pane host will read when
 * it can honour it.
 */
export const useChrome = create<ChromeState>()(
  persist(
    (set) => ({
      layout: LAYOUT_OPTIONS[0]?.id ?? 'single',
      setLayout: (id) => {
        set({ layout: id })
      }
    }),
    { name: 'beacon.chrome', version: 1 }
  )
)
