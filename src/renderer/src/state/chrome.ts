import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { HOME_PAGE_ID, SIDEBAR_PAGES } from '../shell/pages'

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

/**
 * Chrome state, keyed by SIDEBAR PAGE (BU-75).
 *
 * A layout is the container that holds tab strips, so per-tab layout is
 * structurally incoherent — the page is the smallest unit that can own one.
 * Before this, one global `layout` meant choosing two columns anywhere chose
 * it everywhere.
 *
 * `splits` is keyed by page AND layout. Per-layout alone (BU-69) was already
 * right about one thing — a 70/30 that suits main-stack is not what you want
 * back in grid — and wrong about another: Data Explorer's main-stack and
 * Beacon View's main-stack are different arrangements of different work.
 */
interface ChromeState {
  layoutByPage: Record<string, string | undefined>
  splits: Record<string, Split | undefined>
  setLayout: (page: string, id: string) => void
  setSplit: (page: string, layout: string, axis: SplitAxis, value: number) => void
  resetSplit: (page: string, layout: string, axis: SplitAxis) => void
}

/** Unknown page → single pane. A page nobody has arranged has no arrangement. */
export function layoutFor(layoutByPage: Record<string, string | undefined>, page: string): string {
  return layoutByPage[page] ?? SINGLE_PANE.id
}

/** Splits are per page AND layout, so the key carries both. */
export function splitKey(page: string, layout: string): string {
  return `${page}#${layout}`
}

export function splitFor(
  splits: Record<string, Split | undefined>,
  page: string,
  layout: string
): Split {
  return splits[splitKey(page, layout)] ?? EVEN_SPLIT
}

/** The shape stored before version 3, when a layout was global. */
interface GlobalChrome {
  layout?: string
  layoutByPage?: Record<string, string | undefined>
  splits?: Record<string, Split | undefined>
}

/**
 * Bring a stored arrangement up to the per-page shape (BU-75).
 *
 * Every known page is SEEDED from the old global value rather than reset to
 * single. Someone who had chosen two columns had chosen it for the app, and
 * the honest reading of that on upgrade is "two columns everywhere" — which
 * is exactly what they were looking at. Resetting would silently discard a
 * preference on the one launch nobody is expecting a change.
 *
 * The old `splits` were keyed by layout id alone; those become that layout's
 * split on every page, for the same reason.
 */
export function migrateChrome(
  persisted: unknown
): Omit<ChromeState, 'setLayout' | 'setSplit' | 'resetSplit'> {
  const stored = persisted as GlobalChrome

  // Already per-page: a v3 store rehydrating, nothing to reshape.
  if (stored.layoutByPage !== undefined) {
    return { layoutByPage: stored.layoutByPage, splits: stored.splits ?? {} }
  }

  const previous = stored.layout ?? SINGLE_PANE.id
  const pages = [...SIDEBAR_PAGES.map((page) => page.id), HOME_PAGE_ID]

  const layoutByPage: Record<string, string> = {}
  const splits: Record<string, Split> = {}

  for (const page of pages) {
    layoutByPage[page] = previous
    for (const [layout, split] of Object.entries(stored.splits ?? {})) {
      if (split !== undefined) splits[splitKey(page, layout)] = split
    }
  }

  return { layoutByPage, splits }
}

export const useChrome = create<ChromeState>()(
  persist(
    (set) => ({
      layoutByPage: {},
      splits: {},
      setLayout: (page, id) => {
        set((state) => ({ layoutByPage: { ...state.layoutByPage, [page]: id } }))
      },
      setSplit: (page, layout, axis, value) => {
        set((state) => ({
          splits: {
            ...state.splits,
            [splitKey(page, layout)]: {
              ...splitFor(state.splits, page, layout),
              [axis]: clampSplit(value)
            }
          }
        }))
      },
      resetSplit: (page, layout, axis) => {
        set((state) => ({
          splits: {
            ...state.splits,
            [splitKey(page, layout)]: {
              ...splitFor(state.splits, page, layout),
              [axis]: EVEN_SPLIT[axis]
            }
          }
        }))
      }
    }),
    {
      name: 'beacon.chrome',
      version: 3,
      migrate: (persisted) => migrateChrome(persisted)
    }
  )
)
