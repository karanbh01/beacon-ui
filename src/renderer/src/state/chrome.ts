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

/** Named, so the pane host has a total fallback for an unknown layout id. */
export const SINGLE_PANE: LayoutOption = {
  id: 'single',
  label: 'Single pane',
  panes: [{ x: 0, y: 0, w: 24, h: 24 }]
}

export const LAYOUT_OPTIONS: readonly LayoutOption[] = [
  SINGLE_PANE,
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

export type SplitAxis = 'x' | 'y'

/** Where each divider sits, as the first track's share of the grid. */
export interface Split {
  x: number
  y: number
}

export const EVEN_SPLIT: Split = { x: 0.5, y: 0.5 }

/**
 * A pane cannot be dragged smaller than this.
 *
 * A pane resized to nothing is a pane you cannot get back — its divider ends
 * up under the window edge with no handle left to grab.
 */
export const MIN_SPLIT = 0.15

export function clampSplit(value: number): number {
  return Math.min(Math.max(value, MIN_SPLIT), 1 - MIN_SPLIT)
}

interface ChromeState {
  layout: string
  /**
   * Divider positions PER LAYOUT (BU-69). A 70/30 that made sense for
   * main-stack is not what you want back when you return to grid, so they do
   * not share a number.
   */
  splits: Record<string, Split | undefined>
  setLayout: (id: string) => void
  setSplit: (layout: string, axis: SplitAxis, value: number) => void
  resetSplit: (layout: string, axis: SplitAxis) => void
}

export function splitFor(splits: Record<string, Split | undefined>, layout: string): Split {
  return splits[layout] ?? EVEN_SPLIT
}

/**
 * Chrome preferences that outlive a session.
 *
 * `PaneHost` reads `layout` and renders that many panes, each with its own
 * tab strip (BU-55), sized by `splits` (BU-69). The rectangles above are what
 * it lays out, via `shell/paneGrid`.
 */
export const useChrome = create<ChromeState>()(
  persist(
    (set) => ({
      layout: SINGLE_PANE.id,
      splits: {},
      setLayout: (id) => {
        set({ layout: id })
      },
      setSplit: (layout, axis, value) => {
        set((state) => ({
          splits: {
            ...state.splits,
            [layout]: { ...splitFor(state.splits, layout), [axis]: clampSplit(value) }
          }
        }))
      },
      resetSplit: (layout, axis) => {
        set((state) => ({
          splits: {
            ...state.splits,
            [layout]: { ...splitFor(state.splits, layout), [axis]: EVEN_SPLIT[axis] }
          }
        }))
      }
    }),
    {
      name: 'beacon.chrome',
      version: 2,
      // Version 1 stored a layout and nothing else; an even split is what it
      // was rendering, so there is nothing to reconstruct.
      migrate: (persisted) => ({ ...(persisted as ChromeState), splits: {} })
    }
  )
)
